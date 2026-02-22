import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runDiffBackfillForSource } from '@/lib/server/diff/backfill';
import { patchSourceBackfillStatus } from '@/lib/server/diff/backfillStatus';
import { createLogger, errorMessage } from '@/lib/server/logging';
import {
  loadWorkspaceSourceForUser,
  parseNonEmptyStringArray,
  parseSourceWorkerEvent,
  resolveSourceDisplayName,
} from './shared/sourceWorker';

type BackfillRequestedEvent = {
  sourceId?: string;
  sourceName?: string;
  userId?: string;
  requestedDays?: number;
  installedAt?: string;
  createdSourceIds?: string[];
};

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0)));
}

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
    idempotency: 'event.data.sourceId',
    concurrency: [
      { limit: 5 },
      { limit: 1, key: 'event.data.sourceId' },
    ],
  },
  { event: 'diff/source.backfill.requested' },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as BackfillRequestedEvent;
    const { sourceId, userId, sourceNameFromEvent } = parseSourceWorkerEvent(data);
    const createdSourceIds = parseNonEmptyStringArray(data.createdSourceIds);
    const setupBatchSourceIds = uniqueIds(createdSourceIds.length > 0 ? createdSourceIds : [sourceId]);
    const requestedDays = typeof data.requestedDays === 'number' ? data.requestedDays : undefined;
    const installedAt = typeof data.installedAt === 'string' ? data.installedAt : null;
    const installedAtDate = installedAt ? new Date(installedAt) : null;
    const hasValidInstalledAt = Boolean(installedAtDate && !Number.isNaN(installedAtDate.getTime()));

    const supabase = createServiceRoleClient();
    const { row: source, errorMessage: sourceLoadError } = await loadWorkspaceSourceForUser<{
      id: string;
      user_id: string;
      name?: string | null;
      provider: string;
      scope: Record<string, unknown> | null;
    }>({
      supabase,
      sourceId,
      userId,
      select: 'id, user_id, name, provider, scope',
    });

    if (sourceLoadError) {
      await patchSourceBackfillStatus({
        supabase,
        sourceId,
        patch: {
          status: 'failed',
          step_label: 'History sync failed to start',
          error: sourceLoadError,
        },
      });
      throw new Error(`Failed to load source for backfill: ${sourceLoadError}`);
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

    const sourceRow = source;
    const sourceName = resolveSourceDisplayName({
      sourceId: sourceRow.id,
      persistedName: sourceRow.name,
      sourceNameFromEvent,
    });

    log.info('worker_start', {
      sourceId: sourceRow.id,
      sourceName,
      userId,
      provider: sourceRow.provider,
      setupBatchSourceCount: setupBatchSourceIds.length,
      setupBatchSourceIds,
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
          setupBatchSourceCount: setupBatchSourceIds.length,
          setupBatchSourceIds,
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
        setupBatchSourceCount: setupBatchSourceIds.length,
        setupBatchSourceIds,
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
        setupBatchSourceCount: setupBatchSourceIds.length,
        setupBatchSourceIds,
        error: errorMessage(error),
      });
      throw error;
    }
  }
);
