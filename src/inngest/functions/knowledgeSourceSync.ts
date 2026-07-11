import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { embed } from 'ai';
import { embeddingModel } from '@/lib/ai';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import {
  fetchGranolaNotes,
  type NormalizedGranolaNote,
} from '@/lib/server/integrations/granola';
import {
  hasNangoApiKey,
  listNangoConnectionsForUser,
  providerForNangoIntegration,
} from '@/lib/server/integrations/nango';
import {
  chunkTextDocument,
  type KnowledgeTextChunk,
} from '@/lib/server/knowledge-sync/text-chunker';
import {
  getActiveProviderConnection,
  getOrganizationOwnerId,
  upsertProviderConnection,
} from '@/lib/server/knowledge-sync/source-repository';
import { logGranolaDiagnostics } from '@/lib/server/knowledge-sync/granola-diagnostics';
import {
  enrichSlackMessagesWithReplies,
  fetchSlackHistory,
  missingSlackHistoryScopes,
  SlackApiError,
} from '@/lib/server/knowledge-sync/slack-client';
import { chunkSlackMessages } from '@/lib/server/knowledge-sync/slack-chunking';

type KnowledgeSourceSyncEvent = {
  sourceId?: string;
  organizationId?: string;
};

type KnowledgeChunkInsert = {
  organization_id: string;
  source_id: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: string;
};

type SyncableSourceStatus = 'pending' | 'syncing' | 'active';

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

const MIN_MESSAGE_LENGTH = 20;
const SYNCABLE_STATUSES = new Set<SyncableSourceStatus>(['pending', 'syncing', 'active']);

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

class SyncStoppedError extends Error {
  phase: string;

  constructor(phase: string) {
    super(`Sync stopped during ${phase}`);
    this.name = 'SyncStoppedError';
    this.phase = phase;
  }
}

class NoSyncableContentError extends Error {
  rawMessages: number;
  filteredMessages: number;
  enrichedMessages: number;
  chunks: number;

  constructor(params: { rawMessages: number; filteredMessages: number; enrichedMessages: number; chunks: number }) {
    super('No syncable messages found for this source');
    this.name = 'NoSyncableContentError';
    this.rawMessages = params.rawMessages;
    this.filteredMessages = params.filteredMessages;
    this.enrichedMessages = params.enrichedMessages;
    this.chunks = params.chunks;
  }
}

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

async function getSlackAccessTokenForOrganization(
  supabase: ReturnType<typeof createServiceRoleClient>,
  organizationId: string
): Promise<{ accessToken: string | null; ownerId?: string; connectionId?: string; scope?: string | null }> {
  const ownerId = await getOrganizationOwnerId(supabase, organizationId);
  if (!ownerId) return { accessToken: null };

  const { connectionId } = await getActiveProviderConnection(supabase, { ownerId, provider: 'slack' });
  if (!connectionId) return { accessToken: null, ownerId };

  const { data: tokenRow } = await supabase
    .from('oauth_provider_tokens')
    .select('scope')
    .eq('provider', 'slack')
    .eq('connection_id', connectionId)
    .maybeSingle();

  const accessToken = await getProviderAccessToken({ provider: 'slack', connectionId });
  const scope = typeof tokenRow?.scope === 'string' ? tokenRow.scope : null;
  return { accessToken, ownerId, connectionId, scope };
}

async function getGranolaConnectionForOrganization(
  supabase: ReturnType<typeof createServiceRoleClient>,
  organizationId: string
): Promise<{ ownerId?: string; connectionId?: string }> {
  const ownerId = await getOrganizationOwnerId(supabase, organizationId);
  if (!ownerId) return {};

  if (hasNangoApiKey()) {
    try {
      const connections = await listNangoConnectionsForUser({ userId: ownerId, organizationId });
      const nangoConnection = connections.find((connection) => {
        const provider = providerForNangoIntegration(connection.provider_config_key);
        const hasAuthError = (connection.errors ?? []).some((error) => error.type === 'auth');
        return provider === 'granola' && !hasAuthError;
      });

      if (nangoConnection) {
        await upsertProviderConnection(supabase, {
          ownerId,
          provider: 'granola',
          connectionId: nangoConnection.connection_id,
          metadata: {
            ...(nangoConnection.metadata ?? {}),
            source: 'nango',
            provider_config_key: nangoConnection.provider_config_key,
            nango_provider: nangoConnection.provider,
            nango_connection_id: nangoConnection.id,
            organization_id: organizationId,
            reconciled_at: new Date().toISOString(),
            reconciled_from: 'knowledge_source_sync',
          },
        });

        log.info('granola_connection_reconciled', {
          organizationId,
          ownerId,
          connectionId: nangoConnection.connection_id,
          providerConfigKey: nangoConnection.provider_config_key,
        });

        return { ownerId, connectionId: nangoConnection.connection_id };
      }
    } catch (error) {
      log.warn('granola_connection_reconcile_failed', {
        organizationId,
        ownerId,
        error: errorMessage(error),
      });
    }
  }

  const { connectionId } = await getActiveProviderConnection(supabase, { ownerId, provider: 'granola' });
  return { ownerId, connectionId };
}

function chunkGranolaNotes(notes: NormalizedGranolaNote[]): KnowledgeTextChunk[] {
  const chunks: KnowledgeTextChunk[] = [];

  for (const note of notes) {
    chunks.push(
      ...chunkTextDocument({
        document: { content: note.content, metadata: note.metadata },
        identityParts: ['granola', note.id],
      })
    );
  }

  return chunks;
}

async function queueGranolaDownstreamWork(params: {
  organizationId: string;
  ownerId?: string;
  chunkCount: number;
}) {
  if (params.chunkCount === 0) return;

  const events: Array<{ name: string; data: Record<string, string> }> = [
    {
      name: 'onboarding/milestones.generate.requested',
      data: { organizationId: params.organizationId },
    },
  ];

  if (params.ownerId) {
    events.push({
      name: 'onboarding/readiness.generate.requested',
      data: { organizationId: params.organizationId, ownerId: params.ownerId },
    });
  }

  await inngest.send(events);
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

    if (!['slack', 'granola'].includes(source.provider)) {
      log.info('sync_skipped', { sourceId, reason: 'not_supported_source' });
      return { skipped: true, reason: 'not_supported_source' };
    }

    if (source.provider === 'slack' && !source.slack_channel_id) {
      log.info('sync_skipped', { sourceId, reason: 'missing_slack_channel_id' });
      return { skipped: true, reason: 'missing_slack_channel_id' };
    }

    if (!SYNCABLE_STATUSES.has(source.status as SyncableSourceStatus)) {
      log.info('sync_skipped', {
        sourceId,
        channel: source.slack_channel_name || source.name,
        reason: 'status_not_syncable',
        status: source.status,
      });
      return { skipped: true, reason: 'status_not_syncable', status: source.status };
    }

    if (source.provider === 'granola') {
      const { ownerId, connectionId } = await getGranolaConnectionForOrganization(supabase, organizationId);

      if (!connectionId) {
        log.error('sync_failed', {
          sourceId,
          source: source.name,
          error: 'No active Granola Nango connection configured for organization owner',
          ownerId,
          ms: elapsedMs(syncStartedAt),
        });
        await supabase
          .from('knowledge_sources')
          .update({ status: 'error', error_message: null })
          .eq('id', sourceId);
        return { ok: false, sourceId, reason: 'missing_granola_connection' };
      }

      await supabase.from('knowledge_sources').update({ status: 'syncing', error_message: null }).eq('id', sourceId);

      log.info('sync_start', {
        sourceId,
        source: source.name,
        provider: 'granola',
        organizationId,
        connectionId,
      });

      try {
        const {
          embeddedCount,
          noteCount,
          rawNoteCount,
          detailsFetched,
          transcriptItems,
          transcriptTextChars,
        } = await step.run('fetch-granola-notes-embed-insert', async () => {
          const fetchStartedAt = Date.now();
          await assertSyncStillActive(supabase, sourceId, 'granola notes fetch');
          const granolaResult = await fetchGranolaNotes(connectionId);
          const notes = granolaResult.notes;
          logGranolaDiagnostics({
            log,
            sourceId,
            sourceName: source.name,
            diagnostics: granolaResult.diagnostics,
          });

          log.info('sync_history_fetched', {
            sourceId,
            source: source.name,
            provider: 'granola',
            rawMessages: granolaResult.rawCount,
            filteredMessages: notes.length,
            enrichedMessages: notes.length,
            pages: granolaResult.pagesFetched,
            detailsFetched: granolaResult.detailsFetched,
            transcriptItems: granolaResult.transcriptItems,
            transcriptTextChars: granolaResult.transcriptTextChars,
            ms: elapsedMs(fetchStartedAt),
          });

          await assertSyncStillActive(supabase, sourceId, 'granola chunking');
          const chunks = chunkGranolaNotes(notes);

          log.info('sync_chunks_ready', {
            sourceId,
            source: source.name,
            provider: 'granola',
            chunks: chunks.length,
            messages: notes.length,
          });

          const rows: KnowledgeChunkInsert[] = [];
          for (const chunk of chunks) {
            await assertSyncStillActive(supabase, sourceId, 'granola embedding');
            const { embedding } = await embed({ model: embeddingModel, value: chunk.content });
            rows.push({
              organization_id: organizationId,
              source_id: sourceId,
              content: chunk.content,
              metadata: chunk.metadata,
              embedding: JSON.stringify(embedding),
            });
          }

          await assertSyncStillActive(supabase, sourceId, 'replace granola chunks');
          const { error: deleteError } = await supabase.from('knowledge_chunks').delete().eq('source_id', sourceId);
          if (deleteError) {
            log.error('sync_db_write_failed', {
              sourceId,
              source: source.name,
              operation: 'delete_existing_chunks',
              error: deleteError.message,
            });
            throw deleteError;
          }

          if (rows.length > 0) {
            const { error: insertError } = await supabase.from('knowledge_chunks').insert(rows);
            if (insertError) {
              log.error('sync_db_write_failed', {
                sourceId,
                source: source.name,
                operation: 'insert_chunks',
                chunks: rows.length,
                error: insertError.message,
              });
              throw insertError;
            }
          }

          return {
            embeddedCount: rows.length,
            noteCount: notes.length,
            rawNoteCount: granolaResult.rawCount,
            detailsFetched: granolaResult.detailsFetched,
            transcriptItems: granolaResult.transcriptItems,
            transcriptTextChars: granolaResult.transcriptTextChars,
          };
        });

        await assertSyncStillActive(supabase, sourceId, 'finalize granola');
        const emptySyncMessage = rawNoteCount === 0
          ? 'Granola returned no transcripts for this API key.'
          : noteCount === 0
            ? 'Granola returned meetings, but none had transcript text to index.'
            : null;
        await supabase.from('knowledge_sources').update({
          status: 'active',
          last_synced_at: new Date().toISOString(),
          chunk_count: embeddedCount,
          error_message: emptySyncMessage,
        }).eq('id', sourceId);

        await queueGranolaDownstreamWork({ organizationId, ownerId, chunkCount: embeddedCount });

        log.info('sync_complete', {
          sourceId,
          source: source.name,
          provider: 'granola',
          rawNotesFetched: rawNoteCount,
          notesFetched: noteCount,
          detailsFetched,
          transcriptItems,
          transcriptTextChars,
          chunksEmbedded: embeddedCount,
          downstreamQueued: embeddedCount > 0,
          ms: elapsedMs(syncStartedAt),
        });
        return { ok: true, sourceId, notesFetched: noteCount, chunksEmbedded: embeddedCount };
      } catch (error) {
        if (error instanceof SyncStoppedError) {
          log.info('sync_stopped', {
            sourceId,
            source: source.name,
            provider: 'granola',
            phase: error.phase,
            ms: elapsedMs(syncStartedAt),
          });
          return { ok: true, sourceId, stopped: true, phase: error.phase };
        }

        const msg = errorMessage(error);
        log.error('sync_failed', {
          sourceId,
          source: source.name,
          provider: 'granola',
          error: msg,
          ms: elapsedMs(syncStartedAt),
        });
        await supabase.from('knowledge_sources').update({ status: 'error', error_message: null }).eq('id', sourceId);
        throw error;
      }
    }

    const { accessToken, ownerId, connectionId, scope } = await getSlackAccessTokenForOrganization(supabase, organizationId);

    if (!accessToken) {
      log.error('sync_failed', {
        sourceId,
        channel: source.slack_channel_name || source.name,
        error: 'No active source OAuth token configured for organization owner',
        ownerId,
        connectionId,
        ms: elapsedMs(syncStartedAt),
      });
      await supabase
        .from('knowledge_sources')
        .update({ status: 'error', error_message: null })
        .eq('id', sourceId);
      return { ok: false, sourceId, reason: 'missing_source_oauth_token' };
    }

    log.info('sync_token_resolved', {
      sourceId,
      channel: source.slack_channel_name || source.name,
      ownerId,
      connectionId,
    });

    const missingScopes = missingSlackHistoryScopes(scope);
    if (missingScopes.length > 0) {
      log.error('source_api_failed', {
        sourceId,
        channel: source.slack_channel_name || source.name,
        method: 'scope_preflight',
        error: 'missing_scope',
        needed: missingScopes.join(','),
        provided: scope || 'none',
        ms: elapsedMs(syncStartedAt),
      });
      await supabase
        .from('knowledge_sources')
        .update({ status: 'error', error_message: null })
        .eq('id', sourceId);
      return { ok: false, sourceId, reason: 'missing_source_history_scopes', needed: missingScopes, provided: scope || null };
    }

    await supabase.from('knowledge_sources').update({ status: 'syncing', error_message: null }).eq('id', sourceId);

    log.info('sync_start', {
      sourceId,
      channel: source.slack_channel_name || source.name,
      channelId: source.slack_channel_id,
      organizationId,
    });

    try {
      const { embeddedCount } = await step.run('fetch-embed-insert', async () => {
        const fetchStartedAt = Date.now();
        await assertSyncStillActive(supabase, sourceId, 'history fetch');
        const history = await fetchSlackHistory(accessToken, source.slack_channel_id!);
        const rawMessages = history.messages;

        const filtered = rawMessages.filter(
          (m) => !m.subtype && m.text && m.text.length >= MIN_MESSAGE_LENGTH
        );

        const enriched = await enrichSlackMessagesWithReplies({
          botToken: accessToken,
          channelId: source.slack_channel_id!,
          messages: filtered,
          minMessageLength: MIN_MESSAGE_LENGTH,
        });

        log.info('sync_history_fetched', {
          sourceId,
          channel: source.slack_channel_name || source.name,
          rawMessages: rawMessages.length,
          filteredMessages: filtered.length,
          enrichedMessages: enriched.length,
          pages: history.pagesFetched,
          ms: elapsedMs(fetchStartedAt),
        });

        await assertSyncStillActive(supabase, sourceId, 'chunking');
        const chunks = chunkSlackMessages(enriched, source.slack_channel_id!, source.slack_channel_name || '');

        log.info('sync_chunks_ready', {
          sourceId,
          channel: source.slack_channel_name || source.name,
          chunks: chunks.length,
          messages: enriched.length,
        });

        if (chunks.length === 0) {
          throw new NoSyncableContentError({
            rawMessages: rawMessages.length,
            filteredMessages: filtered.length,
            enrichedMessages: enriched.length,
            chunks: chunks.length,
          });
        }

        const rows: KnowledgeChunkInsert[] = [];
        for (const chunk of chunks) {
          await assertSyncStillActive(supabase, sourceId, 'embedding');
          const { embedding } = await embed({ model: embeddingModel, value: chunk.content });
          rows.push({
            organization_id: organizationId,
            source_id: sourceId,
            content: chunk.content,
            metadata: chunk.metadata,
            embedding: JSON.stringify(embedding),
          });
        }

        await assertSyncStillActive(supabase, sourceId, 'replace chunks');
        const { error: deleteError } = await supabase.from('knowledge_chunks').delete().eq('source_id', sourceId);
        if (deleteError) {
          log.error('sync_db_write_failed', {
            sourceId,
            channel: source.slack_channel_name || source.name,
            operation: 'delete_existing_chunks',
            error: deleteError.message,
          });
          throw deleteError;
        }

        const { error: insertError } = await supabase.from('knowledge_chunks').insert(rows);
        if (insertError) {
          log.error('sync_db_write_failed', {
            sourceId,
            channel: source.slack_channel_name || source.name,
            operation: 'insert_chunks',
            chunks: rows.length,
            error: insertError.message,
          });
          throw insertError;
        }

        return { embeddedCount: rows.length };
      });

      await assertSyncStillActive(supabase, sourceId, 'finalize');
      await supabase.from('knowledge_sources').update({
        status: 'active',
        last_synced_at: new Date().toISOString(),
        chunk_count: embeddedCount,
        error_message: null,
      }).eq('id', sourceId);

      log.info('sync_complete', {
        sourceId,
        channel: source.slack_channel_name || source.name,
        chunksEmbedded: embeddedCount,
        ms: elapsedMs(syncStartedAt),
      });
      return { ok: true, sourceId, chunksEmbedded: embeddedCount };
    } catch (error) {
      if (error instanceof SyncStoppedError) {
        log.info('sync_stopped', {
          sourceId,
          channel: source.slack_channel_name || source.name,
          phase: error.phase,
          ms: elapsedMs(syncStartedAt),
        });
        return { ok: true, sourceId, stopped: true, phase: error.phase };
      }

      const msg = errorMessage(error);
      if (error instanceof NoSyncableContentError) {
        log.warn('sync_no_content', {
          sourceId,
          channel: source.slack_channel_name || source.name,
          rawMessages: error.rawMessages,
          filteredMessages: error.filteredMessages,
          enrichedMessages: error.enrichedMessages,
          chunks: error.chunks,
          ms: elapsedMs(syncStartedAt),
        });
      }
      if (error instanceof SlackApiError) {
        log.error('source_api_failed', {
          sourceId,
          channel: source.slack_channel_name || source.name,
          method: error.method,
          error: error.slackError,
          needed: error.needed,
          provided: error.provided,
          ms: elapsedMs(syncStartedAt),
        });
      }
      log.error('sync_failed', {
        sourceId,
        channel: source.slack_channel_name || source.name,
        error: msg,
        ms: elapsedMs(syncStartedAt),
      });
      await supabase.from('knowledge_sources').update({ status: 'error', error_message: null }).eq('id', sourceId);
      throw error;
    }
  }
);
