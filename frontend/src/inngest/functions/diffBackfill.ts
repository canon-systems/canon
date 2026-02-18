import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runDiffBackfillForSource } from '@/lib/server/diff/backfill';
import { patchSourceBackfillStatus } from '@/lib/server/diff/backfillStatus';
import { createLogger, errorMessage } from '@/lib/server/logging';

type BackfillRequestedEvent = {
  sourceId?: string;
  sourceName?: string;
  userId?: string;
  requestedDays?: number;
  installedAt?: string;
};

const log = createLogger('inngest.diff_backfill', {
  label: 'Backfill Worker',
  eventLabels: {
    worker_start: 'Worker Started',
    worker_complete: 'Worker Completed',
    worker_cancelled: 'Worker Cancelled',
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
    const sourceNameFromEvent = typeof data.sourceName === 'string' ? data.sourceName.trim() : '';
    const userId = typeof data.userId === 'string' ? data.userId : '';
    const requestedDays = typeof data.requestedDays === 'number' ? data.requestedDays : undefined;
    const installedAt = typeof data.installedAt === 'string' ? data.installedAt : null;
    const installedAtDate = installedAt ? new Date(installedAt) : null;
    const hasValidInstalledAt = Boolean(installedAtDate && !Number.isNaN(installedAtDate.getTime()));

    if (!sourceId || !userId) {
      throw new Error('Missing sourceId or userId');
    }

    const supabase = createServiceRoleClient();
    const { data: source, error } = await supabase
      .from('workspace_sources')
      .select('id, user_id, name, provider, scope')
      .eq('id', sourceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      await patchSourceBackfillStatus({
        supabase,
        sourceId,
        patch: {
          status: 'failed',
          step_label: 'History sync failed to start',
          error: error.message,
        },
      });
      throw new Error(`Failed to load source for backfill: ${error.message}`);
    }

    if (!source) {
      return {
        skipped: true,
        reason: 'source_not_found',
        sourceId,
        sourceName: sourceNameFromEvent || null,
        userId,
      };
    }

    const sourceRow = source as {
      id: string;
      user_id: string;
      name?: string | null;
      provider: string;
      scope: Record<string, unknown> | null;
    };
    const sourceName =
      typeof sourceRow.name === 'string' && sourceRow.name.trim().length > 0
        ? sourceRow.name.trim()
        : sourceNameFromEvent || sourceRow.id;

    log.info('worker_start', {
      sourceId: sourceRow.id,
      sourceName,
      userId,
      provider: sourceRow.provider,
      requestedDays: requestedDays ?? null,
      installedAt: hasValidInstalledAt ? installedAtDate?.toISOString() : null,
    });

    try {
      const result = await step.run('run-diff-backfill', async () =>
        runDiffBackfillForSource({
          supabase,
          source: sourceRow,
          requestedDays,
          now: hasValidInstalledAt ? installedAtDate ?? undefined : undefined,
        })
      );

      if (result.skipped === 'source_deleted') {
        log.info('worker_cancelled', {
          sourceId: sourceRow.id,
          sourceName,
          provider: sourceRow.provider,
          requestedDays: requestedDays ?? null,
          reason: result.skipped,
          fetchedEvents: result.fetched_events,
          insertedEvents: result.inserted_events,
        });
        return result;
      }

      log.info('worker_complete', {
        sourceId: sourceRow.id,
        sourceName,
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
        sourceName,
        userId,
        provider: sourceRow.provider,
        error: errorMessage(error),
      });
      throw error;
    }
  }
);
