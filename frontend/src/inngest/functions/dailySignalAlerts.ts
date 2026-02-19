import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runSignalEngine, sortSignalsByPriority } from '@/lib/server/signals/engine';
import { getWorkspaceSignalSettings } from '@/lib/server/signals/settings';
import {
  formatDailySignalAlertEmail,
  formatDailySignalAlertMessage,
  sendEmailDigest,
  sendSlackMessage,
} from '@/lib/server/signals/delivery';
import { getWindowForDays } from '@/lib/server/schedules/cadence';

type SourceRow = {
  id: string;
  user_id: string;
  provider: string;
};

const SIGNAL_WINDOW_DAYS = 7;

function groupSourceIdsByUser(rows: SourceRow[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const userId = String(row.user_id || '').trim();
    const sourceId = String(row.id || '').trim();
    if (!userId || !sourceId) continue;
    const current = grouped.get(userId) || [];
    if (!current.includes(sourceId)) current.push(sourceId);
    grouped.set(userId, current);
  }
  return grouped;
}

async function resolveAlertEmail(params: {
  emailDigestEnabled: boolean;
  emailDigestTo: string | null;
  userId: string;
  supabase: ReturnType<typeof createServiceRoleClient>;
}): Promise<string | null> {
  const { emailDigestEnabled, emailDigestTo, userId, supabase } = params;
  if (!emailDigestEnabled) return null;
  if (emailDigestTo && emailDigestTo.trim().length > 0) return emailDigestTo.trim();

  const userRes = await supabase.auth.admin.getUserById(userId);
  const email = userRes.data?.user?.email;
  return typeof email === 'string' && email.trim().length > 0 ? email.trim() : null;
}

export const dailySignalAlerts = inngest.createFunction(
  {
    id: 'daily-signal-alerts',
    name: 'Canon: Daily Signal Alerts',
    retries: 1,
    concurrency: { limit: 1 },
  },
  { cron: '0 12 * * *' },
  async () => {
    const supabase = createServiceRoleClient();
    const now = new Date();
    const { data, error } = await supabase
      .from('workspace_sources')
      .select('id, user_id, provider')
      .in('provider', ['github', 'jira']);

    if (error) {
      console.error('[daily-signal-alerts] failed to load sources', error);
      return { ok: false, error: error.message };
    }

    const grouped = groupSourceIdsByUser((data || []) as SourceRow[]);
    if (grouped.size === 0) {
      return { ok: true, users_processed: 0, users_failed: 0 };
    }

    let usersFailed = 0;
    let usersProcessed = 0;

    for (const [userId, sourceIds] of grouped.entries()) {
      try {
        const settings = await getWorkspaceSignalSettings({ supabase, userId });
        const windowDays = Math.max(1, settings.baseline_window_days || SIGNAL_WINDOW_DAYS);
        const window = getWindowForDays(windowDays, now);

        const signalRun = await runSignalEngine({
          supabase,
          userId,
          sourceIds,
          triggerType: 'daily_signal_monitor',
        });

        const signals = sortSignalsByPriority(signalRun.signals);
        if (signals.length === 0) {
          usersProcessed += 1;
          console.log('[daily-signal-alerts] no signals detected', { userId, sourceCount: sourceIds.length });
          continue;
        }

        const preference = settings.delivery_preference || 'slack_then_email';
        const wantsSlack = preference === 'slack_only' || preference === 'slack_then_email';
        const wantsEmail = preference === 'email_only' || preference === 'slack_then_email';

        let slack = { sent: false, reason: 'skipped_by_preference' } as { sent: boolean; reason?: string };
        if (wantsSlack) {
          slack = await sendSlackMessage({
            supabase,
            userId,
            channel: settings.slack_channel,
            text: formatDailySignalAlertMessage({ window, signals }),
          });
        }

        let email = { sent: false, reason: 'skipped_by_preference' } as { sent: boolean; reason?: string };
        if (wantsEmail) {
          const alertEmail = await resolveAlertEmail({
            emailDigestEnabled: settings.email_digest_enabled,
            emailDigestTo: settings.email_digest_to,
            userId,
            supabase,
          });

          if (alertEmail) {
            const rendered = formatDailySignalAlertEmail({ window, signals });
            email = await sendEmailDigest({
              to: alertEmail,
              subject: rendered.subject,
              text: rendered.text,
              html: rendered.html,
            });
          } else if (!settings.email_digest_enabled) {
            email = { sent: false, reason: 'email_disabled' };
          } else {
            email = { sent: false, reason: 'email_unresolved' };
          }
        }

        const channel = slack.sent && email.sent ? 'both' : slack.sent ? 'slack' : email.sent ? 'email' : 'none';

        usersProcessed += 1;
        console.log('[daily-signal-alerts] processed user', {
          userId,
          sourceCount: sourceIds.length,
          signalsCount: signalRun.signals.length,
          deliveryChannel: channel,
          slackSent: slack.sent,
          slackReason: slack.reason,
          emailSent: email.sent,
          emailReason: email.reason,
        });
      } catch (err) {
        usersFailed += 1;
        console.error('[daily-signal-alerts] user failed', {
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      ok: usersFailed === 0,
      users_processed: usersProcessed,
      users_failed: usersFailed,
      window,
    };
  }
);
