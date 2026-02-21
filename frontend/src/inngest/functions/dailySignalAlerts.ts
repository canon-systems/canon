import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runSignalEngine, sortSignalsByPriority } from '@/lib/server/signals/engine';
import { getWorkspaceSignalSettings } from '@/lib/server/signals/settings';
import {
  formatDailySignalAlertMessage,
  sendSlackMessage,
} from '@/lib/server/signals/delivery';
import { DIFF_SOURCE_PROVIDERS } from '@/lib/server/sources/providers';
import { getNormalizedWindowForDays } from '@/lib/server/signals/window';

type SourceRow = {
  id: string;
  user_id: string;
  provider: string;
};

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

async function activeConnectedSourceCount(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  sourceIds: string[];
  windowStart: string;
  windowEnd: string;
}): Promise<number> {
  const { supabase, sourceIds, windowStart, windowEnd } = params;
  if (sourceIds.length === 0) return 0;

  const { data, error } = await supabase
    .from('diff_event_canonical')
    .select('source_id')
    .in('source_id', sourceIds)
    .gte('occurred_at', windowStart)
    .lte('occurred_at', windowEnd)
    .limit(5000);

  if (error || !data) return 0;
  return new Set(
    data
      .map((row) => (typeof row.source_id === 'string' ? row.source_id : ''))
      .filter((id) => id.length > 0)
  ).size;
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
      .in('provider', [...DIFF_SOURCE_PROVIDERS]);

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
        const window = getNormalizedWindowForDays(settings.baseline_window_days, now, undefined, settings.time_zone);

        const signalRun = await runSignalEngine({
          supabase,
          userId,
          sourceIds,
        });
        const activeSourceCount = await activeConnectedSourceCount({
          supabase,
          sourceIds,
          windowStart: window.start,
          windowEnd: window.end,
        });

        const signals = sortSignalsByPriority(signalRun.signals);
        if (signals.length === 0) {
          usersProcessed += 1;
          console.log('[daily-signal-alerts] no signals detected', {
            userId,
            connectedSourceCount: sourceIds.length,
            activeConnectedSourceCount: activeSourceCount,
            activeSurfaceCount: signalRun.comparison.metrics.repos_touched.current_value,
          });
          continue;
        }

        const slack = await sendSlackMessage({
          supabase,
          userId,
          channel: settings.slack_channel,
          text: formatDailySignalAlertMessage({ window, signals, timeZone: settings.time_zone }),
        });
        const channel = slack.sent ? 'slack' : 'none';

        usersProcessed += 1;
        console.log('[daily-signal-alerts] processed user', {
          userId,
          connectedSourceCount: sourceIds.length,
          activeConnectedSourceCount: activeSourceCount,
          activeSurfaceCount: signalRun.comparison.metrics.repos_touched.current_value,
          signalsCount: signalRun.signals.length,
          deliveryChannel: channel,
          slackSent: slack.sent,
          slackReason: slack.reason,
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
    };
  }
);
