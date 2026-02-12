import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runDiffBackfillForSource } from '@/lib/server/diff/backfill';
import { createLogger, errorMessage } from '@/lib/server/logging';

type BackfillRequestedEvent = {
  sourceId?: string;
  userId?: string;
  requestedDays?: number;
};

const log = createLogger('inngest.diff_backfill', {
  label: 'Backfill Worker',
  eventLabels: {
    worker_start: 'Worker Started',
    worker_complete: 'Worker Completed',
    worker_failed: 'Worker Failed',
  },
});

export const diffSourceBackfill = inngest.createFunction(
  {
    id: 'diff-source-backfill',
    name: 'Canon: Source Activity Backfill',
    retries: 1,
    concurrency: { limit: 1 },
  },
  { event: 'diff/source.backfill.requested' },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as BackfillRequestedEvent;
    const sourceId = typeof data.sourceId === 'string' ? data.sourceId : '';
    const userId = typeof data.userId === 'string' ? data.userId : '';
    const requestedDays = typeof data.requestedDays === 'number' ? data.requestedDays : undefined;

    if (!sourceId || !userId) {
      return { error: 'Missing sourceId or userId' };
    }

    const supabase = createServiceRoleClient();
    const { data: source, error } = await supabase
      .from('workspace_sources')
      .select('id, user_id, provider, scope')
      .eq('id', sourceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return { error: error.message, sourceId, userId };
    }

    if (!source) {
      return { skipped: true, reason: 'source_not_found', sourceId, userId };
    }

    const sourceRow = source as { id: string; user_id: string; provider: string; scope: Record<string, unknown> | null };
    log.info('worker_start', {
      sourceId: sourceRow.id,
      userId,
      provider: sourceRow.provider,
      requestedDays: requestedDays ?? null,
    });

    try {
      const result = await step.run('run-diff-backfill', async () =>
        runDiffBackfillForSource({
          supabase,
          source: sourceRow,
          requestedDays,
        })
      );

      log.info('worker_complete', {
        sourceId: sourceRow.id,
        provider: sourceRow.provider,
        requestedDays: requestedDays ?? null,
        fetchedEvents: result.fetched_events,
        insertedEvents: result.inserted_events,
        windowStart: result.window.start,
        windowEnd: result.window.end,
        windowDays: result.window.days,
      });
      return result;
    } catch (error) {
      log.error('worker_failed', {
        sourceId: sourceRow.id,
        userId,
        provider: sourceRow.provider,
        error: errorMessage(error),
      });
      throw error;
    }
  }
);
