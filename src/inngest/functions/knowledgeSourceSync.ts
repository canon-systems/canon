import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { embed } from 'ai';
import { embeddingModel } from '@/lib/ai';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import {
  fetchGranolaNotes,
  type GranolaDetailDiagnostic,
  type GranolaFetchDiagnostics,
  type GranolaFolderDiagnostic,
  type GranolaNoteDiagnostic,
  type GranolaPageDiagnostic,
  type NormalizedGranolaNote,
} from '@/lib/server/integrations/granola';
import {
  hasNangoApiKey,
  listNangoConnectionsForUser,
  providerForNangoIntegration,
} from '@/lib/server/integrations/nango';
import {
  countWords,
  createKnowledgeTextChunk,
  chunkTextDocument,
  DEFAULT_KNOWLEDGE_CHUNK_MAX_WORDS,
  type KnowledgeTextChunk,
} from '@/lib/server/knowledge-sync/text-chunker';
import {
  getActiveProviderConnection,
  getOrganizationOwnerId,
  upsertProviderConnection,
} from '@/lib/server/knowledge-sync/source-repository';

type KnowledgeSourceSyncEvent = {
  sourceId?: string;
  organizationId?: string;
};

type SlackMessage = {
  ts: string;
  text: string;
  subtype?: string;
  reply_count?: number;
  user?: string;
};

type SlackReply = {
  ts: string;
  text: string;
  subtype?: string;
  user?: string;
};

type SlackHistoryResult = {
  messages: SlackMessage[];
  pagesFetched: number;
};

type SlackApiListResponse<T> = {
  ok: boolean;
  error?: string;
  needed?: string;
  provided?: string;
  messages?: T[];
  response_metadata?: { next_cursor?: string };
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

const NINETY_DAYS_AGO = () => Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000).toString();
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGES = 1000;
const MAX_SLACK_THREAD_REPLIES = 3;
const SLACK_THREAD_REPLY_CONCURRENCY = 5;
const MAX_SLACK_RETRY_ATTEMPTS = 3;
const MIN_MESSAGE_LENGTH = 20;
const SYNCABLE_STATUSES = new Set<SyncableSourceStatus>(['pending', 'syncing', 'active']);
const REQUIRED_SLACK_HISTORY_SCOPES = ['channels:history', 'groups:history', 'mpim:history', 'im:history'];

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

class SlackApiError extends Error {
  method: string;
  slackError: string;
  needed?: string;
  provided?: string;

  constructor(params: { method: string; error: string; needed?: string; provided?: string }) {
    super(`Slack ${params.method} failed: ${params.error}`);
    this.name = 'SlackApiError';
    this.method = params.method;
    this.slackError = params.error;
    this.needed = params.needed;
    this.provided = params.provided;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSlackJson<T>(url: string, botToken: string): Promise<T> {
  let attempt = 0;

  while (true) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${botToken}` },
    });

    if (res.status !== 429 || attempt >= MAX_SLACK_RETRY_ATTEMPTS) {
      return (await res.json()) as T;
    }

    attempt += 1;
    const retryAfterSeconds = Number(res.headers.get('retry-after') ?? '1');
    await sleep(Math.max(1, retryAfterSeconds) * 1000);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );

  return results;
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

function missingSlackHistoryScopes(scope: string | null | undefined): string[] {
  const provided = new Set(
    (scope || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

  return REQUIRED_SLACK_HISTORY_SCOPES.filter((scopeName) => !provided.has(scopeName));
}

async function fetchSlackHistory(botToken: string, channelId: string): Promise<SlackHistoryResult> {
  const messages: SlackMessage[] = [];
  let cursor: string | undefined;
  let pagesFetched = 0;
  const oldest = NINETY_DAYS_AGO();

  while (messages.length < MAX_MESSAGES) {
    const params = new URLSearchParams({
      channel: channelId,
      limit: '200',
      oldest,
    });
    if (cursor) params.set('cursor', cursor);

    const data = await fetchSlackJson<SlackApiListResponse<SlackMessage>>(
      `https://slack.com/api/conversations.history?${params}`,
      botToken
    );

    if (!data.ok) {
      throw new SlackApiError({
        method: 'conversations.history',
        error: data.error ?? 'unknown_error',
        needed: data.needed,
        provided: data.provided,
      });
    }

    if (!data.messages) break;
    pagesFetched++;
    messages.push(...data.messages);

    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return { messages: messages.slice(0, MAX_MESSAGES), pagesFetched };
}

async function fetchSlackThreadReplies(botToken: string, channelId: string, ts: string): Promise<SlackReply[]> {
  const replies: SlackReply[] = [];
  let cursor: string | undefined;

  while (replies.length < MAX_SLACK_THREAD_REPLIES) {
    const params = new URLSearchParams({
      channel: channelId,
      ts,
      limit: '15',
    });
    if (cursor) params.set('cursor', cursor);

    const data = await fetchSlackJson<SlackApiListResponse<SlackReply>>(
      `https://slack.com/api/conversations.replies?${params}`,
      botToken
    );
    if (!data.ok) {
      throw new SlackApiError({
        method: 'conversations.replies',
        error: data.error ?? 'unknown_error',
        needed: data.needed,
        provided: data.provided,
      });
    }

    replies.push(...(data.messages ?? []).filter((message) => message.ts !== ts));
    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return replies.slice(0, MAX_SLACK_THREAD_REPLIES);
}

function chunkMessages(messages: SlackMessage[], channelId: string, channelName: string): KnowledgeTextChunk[] {
  const chunks: KnowledgeTextChunk[] = [];
  if (messages.length === 0) return chunks;

  let currentTexts: string[] = [];
  let currentWordCount = 0;
  let earliestTs = messages[0].ts;
  let latestTs = messages[0].ts;
  let lastTs = parseFloat(messages[0].ts) * 1000;

  const flushChunk = () => {
    if (currentTexts.length === 0) return;
    chunks.push(
      createKnowledgeTextChunk({
        content: currentTexts.join('\n\n'),
        metadata: { channel_id: channelId, channel_name: channelName, earliest_ts: earliestTs, latest_ts: latestTs, message_count: currentTexts.length },
        identityParts: ['slack', channelId, earliestTs, latestTs, chunks.length],
      })
    );
    currentTexts = [];
    currentWordCount = 0;
  };

  for (const msg of messages) {
    const msgTimeMs = parseFloat(msg.ts) * 1000;
    const timeDelta = Math.abs(msgTimeMs - lastTs);

    if (timeDelta > TWO_HOURS_MS && currentTexts.length > 0) {
      flushChunk();
      earliestTs = msg.ts;
    }

    const words = countWords(msg.text);
    if (currentWordCount + words > DEFAULT_KNOWLEDGE_CHUNK_MAX_WORDS && currentTexts.length > 0) {
      flushChunk();
      earliestTs = msg.ts;
    }

    currentTexts.push(msg.text);
    currentWordCount += words;
    latestTs = msg.ts;
    lastTs = msgTimeMs;
  }

  flushChunk();
  return chunks;
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

function compactPairs(record: Record<string, string | number>, limit = 8) {
  return Object.entries(record)
    .slice(0, limit)
    .map(([key, value]) => `${key}:${value}`)
    .join(',');
}

function summarizeGranolaPage(page: GranolaPageDiagnostic) {
  return {
    page: page.page,
    responseType: page.responseType,
    responseKeys: page.responseKeys.join(',') || 'none',
    notesType: page.notesType,
    notesCount: page.notesCount,
    hasMore: page.hasMore,
    cursorReturned: page.cursorReturned,
    firstNoteKeys: page.firstNoteKeys.join(',') || 'none',
    firstNoteFieldTypes: compactPairs(page.firstNoteFieldTypes),
  };
}

function summarizeGranolaRejectedNote(note: GranolaNoteDiagnostic) {
  return {
    index: note.index,
    rawType: note.rawType,
    rawKeys: note.rawKeys.join(',') || 'none',
    idPresent: note.idPresent,
    titleLength: note.titleLength,
    collectedTextParts: note.collectedTextParts,
    bodyLength: note.bodyLength,
    contentLength: note.contentLength,
    textFieldLengths: compactPairs(note.textFieldLengths),
    reason: note.rejectionReason,
  };
}

function summarizeGranolaFailedDetail(detail: GranolaDetailDiagnostic) {
  return {
    index: detail.index,
    noteId: detail.noteId,
    responseKeys: detail.responseKeys.join(',') || 'none',
    error: detail.error,
  };
}

function summarizeGranolaFolder(folder: GranolaFolderDiagnostic) {
  return [
    folder.id,
    folder.name || 'unnamed',
    `notes:${folder.notesCount ?? 'unknown'}`,
    folder.error ? `error:${folder.error}` : '',
  ].filter(Boolean).join('|');
}

function logGranolaDiagnostics(params: {
  sourceId: string;
  sourceName: string;
  diagnostics: GranolaFetchDiagnostics;
}) {
  for (const page of params.diagnostics.pages) {
    log.info('granola_api_page', {
      sourceId: params.sourceId,
      source: params.sourceName,
      provider: 'granola',
      endpoint: params.diagnostics.endpoint,
      pageSize: params.diagnostics.pageSize,
      ...summarizeGranolaPage(page),
    });
  }

  const rawNotesSeen = params.diagnostics.pages.reduce((sum, page) => sum + page.notesCount, 0);
  const normalizedNotes = params.diagnostics.notes.filter((note) => note.normalized).length;
  const rejectedNotes = params.diagnostics.notes.filter((note) => !note.normalized);
  const detailsFetched = params.diagnostics.details.filter((detail) => detail.fetched).length;
  const detailFailures = params.diagnostics.details.filter((detail) => !detail.fetched);
  const transcriptItems = params.diagnostics.details.reduce((sum, detail) => sum + detail.transcriptItems, 0);
  const transcriptTextChars = params.diagnostics.details.reduce((sum, detail) => sum + detail.transcriptTextChars, 0);

  if (params.diagnostics.folders.length > 0) {
    log.info('granola_folder_summary', {
      sourceId: params.sourceId,
      source: params.sourceName,
      provider: 'granola',
      foldersVisible: params.diagnostics.folders.length,
      foldersWithNotes: params.diagnostics.folders.filter((folder) => (folder.notesCount ?? 0) > 0).length,
      folderNotesTotal: params.diagnostics.folders.reduce((sum, folder) => sum + (folder.notesCount ?? 0), 0),
      folders: params.diagnostics.folders.slice(0, 8).map(summarizeGranolaFolder).join(','),
    });
  }

  log.info('granola_normalization_summary', {
    sourceId: params.sourceId,
    source: params.sourceName,
    provider: 'granola',
    rawNotesSeen,
    normalizedNotes,
    rejectedNotes: rejectedNotes.length,
    rejectionReasons: compactPairs(
      rejectedNotes.reduce<Record<string, number>>((acc, note) => {
        const reason = note.rejectionReason || 'unknown';
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {})
    ) || 'none',
  });

  log.info('granola_transcript_summary', {
    sourceId: params.sourceId,
    source: params.sourceName,
    provider: 'granola',
    listedNotes: rawNotesSeen,
    detailRequests: params.diagnostics.details.length,
    detailsFetched,
    detailFailures: detailFailures.length,
    transcriptItems,
    transcriptTextChars,
    failureReasons: compactPairs(
      detailFailures.reduce<Record<string, number>>((acc, detail) => {
        const reason = detail.error || 'unknown';
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {})
    ) || 'none',
  });

  if (rawNotesSeen === 0) {
    log.warn('granola_empty_response', {
      sourceId: params.sourceId,
      source: params.sourceName,
      provider: 'granola',
      endpoint: params.diagnostics.endpoint,
      pages: params.diagnostics.pages.length,
      pageNotesCounts: params.diagnostics.pages.map((page) => `${page.page}:${page.notesCount}`).join(',') || 'none',
      likelyCause: 'Nango Granola API key can authenticate, but /v1/notes returned no notes for this workspace/key',
    });
  }

  for (const detail of detailFailures.slice(0, 5)) {
    log.warn('granola_transcript_fetch_failed', {
      sourceId: params.sourceId,
      source: params.sourceName,
      provider: 'granola',
      ...summarizeGranolaFailedDetail(detail),
    });
  }

  for (const note of rejectedNotes.slice(0, 5)) {
    log.warn('granola_note_rejected', {
      sourceId: params.sourceId,
      source: params.sourceName,
      provider: 'granola',
      ...summarizeGranolaRejectedNote(note),
    });
  }
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

        const replyCandidates = filtered.filter((msg) => (msg.reply_count ?? 0) > 0);
        const threadReplies = await mapWithConcurrency(
          replyCandidates,
          SLACK_THREAD_REPLY_CONCURRENCY,
          async (msg) => {
            const replies = await fetchSlackThreadReplies(accessToken, source.slack_channel_id!, msg.ts);
            const validReplies = replies.filter((r) => !r.subtype && r.text && r.text.length >= MIN_MESSAGE_LENGTH);
            return [msg.ts, validReplies.map((r) => ({ ts: r.ts, text: r.text, user: r.user }))] as const;
          }
        );
        const repliesByThread = new Map(threadReplies);

        const enriched: SlackMessage[] = [];
        for (const msg of filtered) {
          enriched.push(msg);
          enriched.push(...(repliesByThread.get(msg.ts) ?? []));
        }

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
        const chunks = chunkMessages(enriched, source.slack_channel_id!, source.slack_channel_name || '');

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
