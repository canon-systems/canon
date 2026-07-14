import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/server/logging';
import { SyncStoppedError } from '@/lib/server/knowledge-sync/errors';
import { SYNCABLE_SOURCE_STATUSES, type SyncableSourceStatus } from '@/lib/server/knowledge-sync/constants';
import {
  getKnowledgeSourceAdapter,
  type KnowledgeSourceRow,
} from '@/lib/server/knowledge-sync/source-adapters';

type KnowledgeSourceSyncEvent = {
  sourceId?: string;
  organizationId?: string;
};

const log = createLogger('inngest.knowledge_source_sync', {
  label: 'Knowledge Source Sync',
  eventLabels: {
    sync_start: 'Sync Started',
    sync_history_fetched: 'History Fetched',
    sync_chunks_ready: 'Chunks Ready',
    sync_complete: 'Sync Completed',
    sync_failed: 'Sync Failed',
    sync_skipped: 'Sync Skipped',
    sync_stopped: 'Sync Stopped',
    sync_token_resolved: 'Source Token Resolved',
    source_api_failed: 'Source API Failed',
    sync_no_content: 'No Syncable Content',
    sync_db_write_failed: 'DB Write Failed',
    granola_api_page: 'Granola API Page',
    granola_empty_response: 'Granola Empty Response',
    granola_connection_reconciled: 'Granola Connection Reconciled',
    granola_connection_reconcile_failed: 'Granola Connection Reconcile Failed',
    granola_folder_summary: 'Granola Folder Summary',
    granola_normalization_summary: 'Granola Normalization Summary',
    granola_transcript_summary: 'Granola Transcript Summary',
    granola_transcript_fetch_failed: 'Granola Transcript Fetch Failed',
    granola_note_rejected: 'Granola Note Rejected',
  },
  componentColor: 'orange',
});

async function assertSyncStillActive(
  supabase: ReturnType<typeof createServiceRoleClient>,
  sourceId: string,
  phase: string
) {
  const { data } = await supabase
    .from('knowledge_sources')
    .select('status')
    .eq('id', sourceId)
    .maybeSingle();

  if (data?.status !== 'syncing') {
    throw new SyncStoppedError(phase);
  }
}

export const knowledgeSourceSync = inngest.createFunction(
  {
    id: 'knowledge-source-sync',
    name: 'Canon: Knowledge Source Sync',
    retries: 2,
    concurrency: {
      limit: 1,
      key: 'event.data.sourceId',
    },
  },
  { event: 'onboarding/knowledge.sync.requested' },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as KnowledgeSourceSyncEvent;
    const sourceId = typeof data.sourceId === 'string' ? data.sourceId : '';
    const organizationId = typeof data.organizationId === 'string' ? data.organizationId : '';

    if (!sourceId || !organizationId) {
      throw new Error('Missing sourceId or organizationId in event payload');
    }

    const syncStartedAt = Date.now();
    const supabase = createServiceRoleClient();

    const { data: source, error: sourceError } = await supabase
      .from('knowledge_sources')
      .select('id, organization_id, provider, name, slack_channel_id, slack_channel_name, status')
      .eq('id', sourceId)
      .single();

    if (sourceError || !source) {
      log.info('sync_skipped', { sourceId, reason: 'source_not_found' });
      return { skipped: true, reason: 'source_not_found' };
    }

    const sourceRow = source as KnowledgeSourceRow;
    const adapter = getKnowledgeSourceAdapter(sourceRow.provider);

    if (!adapter) {
      log.info('sync_skipped', { sourceId, reason: 'not_supported_source' });
      return { skipped: true, reason: 'not_supported_source' };
    }

    const validation = adapter.validate(sourceRow);
    if (!validation.ok) {
      log.info('sync_skipped', { sourceId, reason: validation.reason });
      return { skipped: true, reason: validation.reason };
    }

    if (!SYNCABLE_SOURCE_STATUSES.has(sourceRow.status as SyncableSourceStatus)) {
      log.info('sync_skipped', {
        sourceId,
        channel: sourceRow.slack_channel_name || sourceRow.name,
        reason: 'status_not_syncable',
        status: sourceRow.status,
      });
      return { skipped: true, reason: 'status_not_syncable', status: sourceRow.status };
    }

    return adapter.sync({
      supabase,
      source: sourceRow,
      sourceId,
      organizationId,
      syncStartedAt,
      step,
      log,
      assertActive: (phase) => assertSyncStillActive(supabase, sourceId, phase),
    });
  }
);
