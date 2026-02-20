import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ingestSource, type WorkspaceSource } from '@/lib/server/services/sourceIngest';
import { createLogger, errorMessage } from '@/lib/server/logging';
import {
  loadWorkspaceSourceForUser,
  parseNonEmptyStringArray,
  parseSourceWorkerEvent,
  resolveSourceDisplayName,
} from './shared/sourceWorker';

type SourceIngestRequestedEvent = {
  sourceId?: string;
  sourceName?: string;
  userId?: string;
  createdSourceIds?: string[];
};

const log = createLogger('inngest.source_ingest', {
  label: 'Source Setup Worker',
  eventLabels: {
    worker_start: 'Worker Started',
    worker_complete: 'Worker Completed',
    worker_cancelled: 'Worker Cancelled',
    worker_failed: 'Worker Failed',
  },
});

export const sourceIngestRequested = inngest.createFunction(
  {
    id: 'source-ingest-requested',
    name: 'Canon: Source Setup Ingest',
    retries: 1,
    concurrency: { limit: 3 },
  },
  { event: 'source/ingest.requested' },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as SourceIngestRequestedEvent;
    const { sourceId, userId, sourceNameFromEvent } = parseSourceWorkerEvent(data);
    const createdSourceIds = parseNonEmptyStringArray(data.createdSourceIds);

    const supabase = createServiceRoleClient();
    const { row: source, errorMessage: sourceLoadError } = await loadWorkspaceSourceForUser<WorkspaceSource>({
      supabase,
      sourceId,
      userId,
      select: 'id, user_id, name, provider, scope, connection_id, status_payload, last_error',
    });

    if (sourceLoadError) {
      throw new Error(`Failed to load source for ingest: ${sourceLoadError}`);
    }
    if (!source) {
      log.info('worker_cancelled', {
        sourceId,
        sourceName: sourceNameFromEvent || null,
        userId,
        reason: 'source_not_found',
      });
      return {
        skipped: true,
        reason: 'source_not_found',
        sourceId,
        sourceName: sourceNameFromEvent || null,
      };
    }

    const sourceRow = source as WorkspaceSource;
    const sourceName = resolveSourceDisplayName({
      sourceId: sourceRow.id,
      persistedName: sourceRow.name,
      sourceNameFromEvent,
    });

    log.info('worker_start', {
      sourceId: sourceRow.id,
      sourceName,
      userId: sourceRow.user_id,
      provider: sourceRow.provider,
      createdSourceCount: createdSourceIds.length,
    });

    try {
      await step.run('run-source-ingest', async () => {
        await ingestSource(supabase, sourceRow);
        return { ok: true };
      });

      log.info('worker_complete', {
        sourceId: sourceRow.id,
        sourceName,
        provider: sourceRow.provider,
      });
      return { ok: true, sourceId: sourceRow.id, sourceName };
    } catch (error) {
      log.error('worker_failed', {
        sourceId: sourceRow.id,
        sourceName,
        provider: sourceRow.provider,
        error: errorMessage(error),
      });
      throw error;
    }
  }
);
