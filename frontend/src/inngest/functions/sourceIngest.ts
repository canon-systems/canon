import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ingestSource, type IngestOptions, type WorkspaceSource } from '@/lib/server/services/sourceIngest';
import { createLogger, errorMessage } from '@/lib/server/logging';

type SourceIngestRequestedEvent = {
  sourceId?: string;
  sourceName?: string;
  userId?: string;
  mode?: IngestOptions['mode'];
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
    const sourceId = typeof data.sourceId === 'string' ? data.sourceId : '';
    const userId = typeof data.userId === 'string' ? data.userId : '';
    const sourceNameFromEvent = typeof data.sourceName === 'string' ? data.sourceName.trim() : '';
    const mode = data.mode === 'single' || data.mode === 'multi' ? data.mode : 'multi';
    const createdSourceIds = Array.isArray(data.createdSourceIds)
      ? data.createdSourceIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];

    if (!sourceId || !userId) {
      throw new Error('Missing sourceId or userId');
    }

    const supabase = createServiceRoleClient();
    const { data: source, error } = await supabase
      .from('workspace_sources')
      .select('id, user_id, name, provider, scope, connection_id, status_payload, last_error')
      .eq('id', sourceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load source for ingest: ${error.message}`);
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
    const sourceName =
      typeof sourceRow.name === 'string' && sourceRow.name.trim().length > 0
        ? sourceRow.name.trim()
        : sourceNameFromEvent || sourceRow.id;

    log.info('worker_start', {
      sourceId: sourceRow.id,
      sourceName,
      userId: sourceRow.user_id,
      provider: sourceRow.provider,
      mode,
      createdSourceCount: createdSourceIds.length,
    });

    try {
      await step.run('run-source-ingest', async () => {
        await ingestSource(supabase, sourceRow, { mode, createdSourceIds });
        return { ok: true };
      });

      log.info('worker_complete', {
        sourceId: sourceRow.id,
        sourceName,
        provider: sourceRow.provider,
        mode,
      });
      return { ok: true, sourceId: sourceRow.id, sourceName };
    } catch (error) {
      log.error('worker_failed', {
        sourceId: sourceRow.id,
        sourceName,
        provider: sourceRow.provider,
        mode,
        error: errorMessage(error),
      });
      throw error;
    }
  }
);

