import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runSignalEngine, sortSignalsByPriority } from '@/lib/server/signals/engine';
import { getWorkspaceSignalSettings } from '@/lib/server/signals/settings';
import {
  formatWeeklyDigestEmail,
  formatWeeklyDigestMessage,
  sendEmailDigest,
  sendSlackMessage,
} from '@/lib/server/signals/delivery';
import { getWindowForDays } from '@/lib/server/schedules/cadence';

type SourceRow = {
  id: string;
  user_id: string;
  provider: string;
};

const WEEKLY_WINDOW_DAYS = 7;

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

async function resolveDigestEmail(params: {
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

export const weeklySignalsDigest = inngest.createFunction(
  {
    id: 'weekly-signals-digest',
    name: 'Canon: Weekly Signals Digest',
    retries: 1,
    concurrency: { limit: 1 },
  },
  { cron: '0 14 * * 1' },
  async () => {
    const supabase = createServiceRoleClient();
    const now = new Date();
    const window = getWindowForDays(WEEKLY_WINDOW_DAYS, now);

    const { data, error } = await supabase
      .from('workspace_sources')
      .select('id, user_id, provider')
      .in('provider', ['github', 'jira']);

    if (error) {
      console.error('[weekly-signals-digest] failed to load sources', error);
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

        const signalRun = await runSignalEngine({
          supabase,
          userId,
          sourceIds,
          window,
          triggerType: 'weekly_digest',
        });

        const topSignals = sortSignalsByPriority(signalRun.signals).slice(0, 3);

        const slack = await sendSlackMessage({
          supabase,
          userId,
          channel: settings.slack_channel,
          text: formatWeeklyDigestMessage({ window, signals: topSignals }),
        });

        const digestEmail = await resolveDigestEmail({
          emailDigestEnabled: settings.email_digest_enabled,
          emailDigestTo: settings.email_digest_to,
          userId,
          supabase,
        });

        let email = { sent: false, reason: 'disabled' } as { sent: boolean; reason?: string };
        if (digestEmail) {
          const rendered = formatWeeklyDigestEmail({ window, signals: topSignals });
          email = await sendEmailDigest({
            to: digestEmail,
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html,
          });
        }

        usersProcessed += 1;
        console.log('[weekly-signals-digest] processed user', {
          userId,
          sourceCount: sourceIds.length,
          signalsCount: signalRun.signals.length,
          slackSent: slack.sent,
          slackReason: slack.reason,
          emailSent: email.sent,
          emailReason: email.reason,
        });
      } catch (err) {
        usersFailed += 1;
        console.error('[weekly-signals-digest] user failed', {
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
