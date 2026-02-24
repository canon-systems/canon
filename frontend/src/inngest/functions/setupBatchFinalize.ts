import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { runSignalEngine } from '@/lib/server/signals/engine';
import { DIFF_SOURCE_PROVIDERS } from '@/lib/server/sources/providers';
import { parseNonEmptyStringArray } from './shared/sourceWorker';

type SetupBatchFinalizeEvent = {
  userId?: string;
  createdSourceIds?: string[];
  mode?: 'single' | 'multi';
};

type SetupBatchStatus = {
  sourceCount: number;
  foundSourceCount: number;
  diffSourceCount: number;
  missingSourceIds: string[];
  pendingSetupSourceIds: string[];
  pendingBackfillSourceIds: string[];
  failedSourceIds: string[];
};

const MAX_READINESS_ATTEMPTS = 40;
const READINESS_WAIT = '15s';

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isDiffProvider(provider: string): boolean {
  return DIFF_SOURCE_PROVIDERS.includes(provider as (typeof DIFF_SOURCE_PROVIDERS)[number]);
}

async function getSetupBatchStatus(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  sourceIds: string[];
}): Promise<SetupBatchStatus> {
  const { supabase, userId, sourceIds } = params;
  const batchSourceIds = uniqueIds(sourceIds);
  if (batchSourceIds.length === 0) {
    return {
      sourceCount: 0,
      foundSourceCount: 0,
      diffSourceCount: 0,
      missingSourceIds: [],
      pendingSetupSourceIds: [],
      pendingBackfillSourceIds: [],
      failedSourceIds: [],
    };
  }

  const { data: rows } = await supabase
    .from('workspace_sources')
    .select('id, provider, status_payload')
    .eq('user_id', userId)
    .in('id', batchSourceIds);

  const rowById = new Map<string, { provider: string; status_payload: unknown }>();
  let diffSourceCount = 0;
  for (const row of rows || []) {
    const id = asText(row.id);
    if (!id) continue;
    const provider = asText(row.provider).toLowerCase();
    if (isDiffProvider(provider)) diffSourceCount += 1;
    rowById.set(id, {
      provider,
      status_payload: row.status_payload,
    });
  }

  const pendingSetupSourceIds: string[] = [];
  const pendingBackfillSourceIds: string[] = [];
  const failedSourceIds: string[] = [];
  const missingSourceIds = batchSourceIds.filter((id) => !rowById.has(id));

  for (const sourceId of batchSourceIds) {
    const source = rowById.get(sourceId);
    if (!source) continue;

    const statusPayload = asRecord(source.status_payload);
    const setupStatus = asText(statusPayload.status);
    const backfill = asRecord(statusPayload.backfill);
    const backfillStatus = asText(backfill.status);
    const diffProvider = isDiffProvider(source.provider);
    const setupReady =
      setupStatus === 'ready' ||
      setupStatus === 'draft_ready' ||
      (diffProvider && backfillStatus === 'done');

    if (setupStatus === 'failed' || backfillStatus === 'failed') {
      failedSourceIds.push(sourceId);
      continue;
    }

    if (!setupReady) {
      pendingSetupSourceIds.push(sourceId);
      continue;
    }

    if (diffProvider && backfillStatus !== 'done') {
      pendingBackfillSourceIds.push(sourceId);
    }
  }

  return {
    sourceCount: batchSourceIds.length,
    foundSourceCount: rowById.size,
    diffSourceCount,
    missingSourceIds,
    pendingSetupSourceIds,
    pendingBackfillSourceIds,
    failedSourceIds,
  };
}

const log = createLogger('inngest.setup_batch_finalize', {
  label: 'Setup Batch Finalize Worker',
  eventLabels: {
    worker_start: 'Worker Started',
    worker_cancelled: 'Worker Cancelled',
    worker_complete: 'Worker Completed',
    worker_failed: 'Worker Failed',
    batch_pending: 'Batch Pending',
    batch_failed: 'Batch Failed',
    batch_timed_out: 'Batch Timed Out',
    signal_run_start: 'Signal Run Started',
    signal_run_complete: 'Signal Run Completed',
  },
});

export const setupBatchFinalizeRequested = inngest.createFunction(
  {
    id: 'setup-batch-finalize-requested',
    name: 'Canon: Setup Batch Finalize',
    retries: 1,
    concurrency: [
      { limit: 5 },
      { limit: 1, key: 'event.data.userId' },
    ],
    timeouts: {
      finish: '5m',
    },
  },
  { event: 'source/setup.batch.finalize.requested' },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as SetupBatchFinalizeEvent;
    const userId = typeof data.userId === 'string' ? data.userId : '';
    const sourceIds = uniqueIds(parseNonEmptyStringArray(data.createdSourceIds));
    const mode = data.mode === 'single' || data.mode === 'multi' ? data.mode : 'multi';

    if (!userId || sourceIds.length === 0) {
      log.info('worker_cancelled', {
        userId: userId || null,
        sourceIds,
        reason: 'invalid_payload',
      });
      return { skipped: true, reason: 'invalid_payload' };
    }

    const supabase = createServiceRoleClient();

    log.info('worker_start', {
      userId,
      mode,
      sourceCount: sourceIds.length,
      sourceIds,
    });

    try {
      for (let attempt = 1; attempt <= MAX_READINESS_ATTEMPTS; attempt += 1) {
        const status = await step.run(`check-batch-readiness-${attempt}`, async () =>
          getSetupBatchStatus({
            supabase,
            userId,
            sourceIds,
          })
        );

        if (status.failedSourceIds.length > 0) {
          log.warn('batch_failed', {
            userId,
            sourceCount: status.sourceCount,
            sourceIds,
            failedSourceIds: status.failedSourceIds,
          });
          return {
            skipped: true,
            reason: 'batch_failed',
            failedSourceIds: status.failedSourceIds,
          };
        }

        if (status.foundSourceCount === 0) {
          log.info('worker_cancelled', {
            userId,
            sourceCount: status.sourceCount,
            sourceIds,
            reason: 'all_sources_removed',
          });
          return {
            skipped: true,
            reason: 'all_sources_removed',
          };
        }

        if (
          status.pendingSetupSourceIds.length > 0 ||
          status.pendingBackfillSourceIds.length > 0
        ) {
          if (attempt === MAX_READINESS_ATTEMPTS) {
            log.warn('batch_timed_out', {
              userId,
              sourceCount: status.sourceCount,
              foundSourceCount: status.foundSourceCount,
              sourceIds,
              missingSourceIds: status.missingSourceIds,
              pendingSetupSourceIds: status.pendingSetupSourceIds,
              pendingBackfillSourceIds: status.pendingBackfillSourceIds,
              attempts: attempt,
            });
            throw new Error(
              `Setup batch readiness timed out after ${attempt} attempts: found=${status.foundSourceCount}, pendingSetup=${status.pendingSetupSourceIds.length}, pendingBackfill=${status.pendingBackfillSourceIds.length}`
            );
          }

          log.info('batch_pending', {
            userId,
            sourceCount: status.sourceCount,
            foundSourceCount: status.foundSourceCount,
            sourceIds,
            missingSourceIds: status.missingSourceIds,
            pendingSetupSourceIds: status.pendingSetupSourceIds,
            pendingBackfillSourceIds: status.pendingBackfillSourceIds,
            attempt,
            maxAttempts: MAX_READINESS_ATTEMPTS,
          });

          await step.sleep(`wait-for-readiness-${attempt}`, READINESS_WAIT);
          continue;
        }

        log.info('signal_run_start', {
          userId,
          sourceCount: status.sourceCount,
          diffSourceCount: status.diffSourceCount,
          sourceIds,
        });

        const signalRun = await step.run('run-setup-batch-signals', async () =>
          runSignalEngine({
            supabase,
            userId,
          })
        );

        const elevated = signalRun.signals.filter((signal) => signal.severity === 'elevated').length;
        const significant = signalRun.signals.filter((signal) => signal.severity === 'significant').length;

        log.info('signal_run_complete', {
          userId,
          sourceCount: status.sourceCount,
          diffSourceCount: status.diffSourceCount,
          sourceIds,
          signalRunId: signalRun.runId,
          signalsCount: signalRun.signals.length,
          elevatedSignals: elevated,
          significantSignals: significant,
          windowStart: signalRun.comparison.window_current.start,
          windowEnd: signalRun.comparison.window_current.end,
        });

        log.info('worker_complete', {
          userId,
          sourceCount: status.sourceCount,
          sourceIds,
          signalRunId: signalRun.runId,
        });

        return {
          ok: true,
          userId,
          sourceIds,
          signalRunId: signalRun.runId,
        };
      }

      return { skipped: true, reason: 'unexpected_exit' };
    } catch (error) {
      log.error('worker_failed', {
        userId,
        sourceCount: sourceIds.length,
        sourceIds,
        error: errorMessage(error),
      });
      throw error;
    }
  }
);
