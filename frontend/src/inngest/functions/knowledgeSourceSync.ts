import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { embed } from 'ai';
import { embeddingModel } from '@/lib/ai';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import { getGongCredentialsForOrganization, type GongCredentials } from '@/lib/server/oauth/gongCredentials';

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

type GongCall = {
  id: string;
  url?: string;
  title?: string;
  scheduled?: string;
  started?: string;
  duration?: number;
};

type GongCallsResponse = {
  records?: {
    cursor?: string;
  };
  calls?: GongCall[];
};

type GongTranscriptSentence = {
  text?: string;
  start?: number;
  end?: number;
  _end?: number;
};

type GongTranscriptMonologue = {
  speakerId?: string;
  speaker_id?: string;
  sentences?: GongTranscriptSentence[];
};

type GongCallTranscript = {
  callId?: string;
  call_id?: string;
  transcript?: GongTranscriptMonologue[];
};

type GongTranscriptsResponse = {
  callTranscripts?: GongCallTranscript[];
  cursor?: string;
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
  },
  componentColor: 'orange',
});

const NINETY_DAYS_AGO = () => Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000).toString();
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGES = 1000;
const MAX_GONG_CALLS = 50;
const GONG_LOOKBACK_DAYS = 30;
const WORDS_PER_CHUNK = 400;
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

class GongApiError extends Error {
  method: string;
  status: number;
  detail: string;

  constructor(params: { method: string; status: number; detail: string }) {
    super(`Gong ${params.method} failed: ${params.detail || params.status}`);
    this.name = 'GongApiError';
    this.method = params.method;
    this.status = params.status;
    this.detail = params.detail;
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

function gongLookbackStart(): string {
  return new Date(Date.now() - GONG_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
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
  const { data: org } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', organizationId)
    .maybeSingle();

  const ownerId = typeof org?.owner_id === 'string' ? org.owner_id : undefined;
  if (!ownerId) return { accessToken: null };

  const { data: connection } = await supabase
    .from('oauth_connections')
    .select('connection_id')
    .eq('user_id', ownerId)
    .eq('provider', 'slack')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const connectionId = typeof connection?.connection_id === 'string' ? connection.connection_id : undefined;
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

function missingSlackHistoryScopes(scope: string | null | undefined): string[] {
  const provided = new Set(
    (scope || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

  return REQUIRED_SLACK_HISTORY_SCOPES.filter((scopeName) => !provided.has(scopeName));
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
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

    const res = await fetch(`https://slack.com/api/conversations.history?${params}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const data = (await res.json()) as SlackApiListResponse<SlackMessage>;

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
  const res = await fetch(
    `https://slack.com/api/conversations.replies?channel=${channelId}&ts=${ts}&limit=4`,
    { headers: { Authorization: `Bearer ${botToken}` } }
  );
  const data = (await res.json()) as SlackApiListResponse<SlackReply>;
  if (!data.ok) {
    throw new SlackApiError({
      method: 'conversations.replies',
      error: data.error ?? 'unknown_error',
      needed: data.needed,
      provided: data.provided,
    });
  }
  if (!data.messages) return [];
  return data.messages.slice(1, 4); // skip root message, take top 3 replies
}

function chunkMessages(messages: SlackMessage[], channelId: string, channelName: string): Array<{
  content: string;
  metadata: { channel_id: string; channel_name: string; earliest_ts: string; latest_ts: string; message_count: number };
}> {
  const chunks: ReturnType<typeof chunkMessages> = [];
  if (messages.length === 0) return chunks;

  let currentTexts: string[] = [];
  let currentWordCount = 0;
  let earliestTs = messages[0].ts;
  let latestTs = messages[0].ts;
  let lastTs = parseFloat(messages[0].ts) * 1000;

  const flushChunk = () => {
    if (currentTexts.length === 0) return;
    chunks.push({
      content: currentTexts.join('\n\n'),
      metadata: { channel_id: channelId, channel_name: channelName, earliest_ts: earliestTs, latest_ts: latestTs, message_count: currentTexts.length },
    });
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

    const words = wordCount(msg.text);
    if (currentWordCount + words > WORDS_PER_CHUNK && currentTexts.length > 0) {
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

async function gongRequest<T>(credentials: GongCredentials, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(new URL(path, credentials.apiBaseUrl), {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: credentials.authorization,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new GongApiError({ method: path, status: response.status, detail });
  }

  return response.json() as Promise<T>;
}

async function fetchGongCalls(credentials: GongCredentials): Promise<{ calls: GongCall[]; pagesFetched: number }> {
  const calls: GongCall[] = [];
  let cursor: string | undefined;
  let pagesFetched = 0;
  const fromDateTime = gongLookbackStart();
  const toDateTime = new Date().toISOString();

  while (calls.length < MAX_GONG_CALLS) {
    const params = new URLSearchParams({ fromDateTime, toDateTime });
    if (cursor) params.set('cursor', cursor);
    const data = await gongRequest<GongCallsResponse>(credentials, 'GET', `/v2/calls?${params.toString()}`);
    pagesFetched++;
    calls.push(...(data.calls ?? []));
    cursor = data.records?.cursor || undefined;
    if (!cursor) break;
  }

  return { calls: calls.slice(0, MAX_GONG_CALLS), pagesFetched };
}

async function fetchGongTranscripts(credentials: GongCredentials, callIds: string[]): Promise<GongCallTranscript[]> {
  if (callIds.length === 0) return [];
  const data = await gongRequest<GongTranscriptsResponse>(credentials, 'POST', '/v2/calls/transcript', { callIds });
  return data.callTranscripts ?? [];
}

function sentenceEnd(sentence: GongTranscriptSentence): number | undefined {
  return typeof sentence.end === 'number'
    ? sentence.end
    : typeof sentence._end === 'number'
      ? sentence._end
      : undefined;
}

function transcriptText(transcript: GongCallTranscript): string {
  return (transcript.transcript ?? [])
    .flatMap((monologue) => {
      const speaker = monologue.speakerId || monologue.speaker_id || 'speaker';
      return (monologue.sentences ?? [])
        .map((sentence) => {
          const text = typeof sentence.text === 'string' ? sentence.text.trim() : '';
          if (!text) return '';
          const start = typeof sentence.start === 'number' ? sentence.start : null;
          const end = sentenceEnd(sentence);
          const timeLabel = start !== null && typeof end === 'number' ? ` (${start}-${end}ms)` : '';
          return `${speaker}${timeLabel}: ${text}`;
        })
        .filter(Boolean);
    })
    .join('\n');
}

function chunkTextByWords(text: string, wordsPerChunk: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += wordsPerChunk) {
    chunks.push(words.slice(index, index + wordsPerChunk).join(' '));
  }
  return chunks;
}

function chunkGongTranscripts(
  calls: GongCall[],
  transcripts: GongCallTranscript[]
): Array<{ content: string; metadata: Record<string, unknown> }> {
  const callsById = new Map(calls.map((call) => [call.id, call]));
  const chunks: Array<{ content: string; metadata: Record<string, unknown> }> = [];

  for (const transcript of transcripts) {
    const callId = transcript.callId || transcript.call_id || '';
    if (!callId) continue;

    const call = callsById.get(callId);
    const body = transcriptText(transcript);
    if (wordCount(body) < MIN_MESSAGE_LENGTH) continue;

    const title = call?.title || 'Gong call';
    const header = [
      `Gong call: ${title}`,
      call?.started || call?.scheduled ? `Date: ${call.started || call.scheduled}` : '',
      call?.url ? `URL: ${call.url}` : '',
    ].filter(Boolean).join('\n');

    const parts = chunkTextByWords(body, WORDS_PER_CHUNK);
    parts.forEach((part, index) => {
      chunks.push({
        content: `${header}\n\n${part}`,
        metadata: {
          provider: 'gong',
          call_id: callId,
          call_title: title,
          call_url: call?.url ?? null,
          started_at: call?.started ?? call?.scheduled ?? null,
          duration_seconds: call?.duration ?? null,
          chunk_index: index,
          chunk_count: parts.length,
        },
      });
    });
  }

  return chunks;
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

    if (source.provider !== 'slack' && source.provider !== 'gong') {
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

    if (source.provider === 'gong') {
      const credentials = await getGongCredentialsForOrganization(organizationId);

      if (!credentials) {
        log.error('sync_failed', {
          sourceId,
          channel: source.name,
          provider: source.provider,
          error: 'No active Gong credentials configured for organization owner',
          ms: elapsedMs(syncStartedAt),
        });
        await supabase
          .from('knowledge_sources')
          .update({ status: 'error', error_message: null })
          .eq('id', sourceId);
        return { ok: false, sourceId, reason: 'missing_gong_credentials' };
      }

      await supabase.from('knowledge_sources').update({ status: 'syncing', error_message: null }).eq('id', sourceId);

      log.info('sync_start', {
        sourceId,
        channel: source.name,
        provider: source.provider,
        organizationId,
      });

      try {
        const { embeddedCount } = await step.run('fetch-gong-embed-insert', async () => {
          const fetchStartedAt = Date.now();
          await assertSyncStillActive(supabase, sourceId, 'gong call fetch');
          const { calls, pagesFetched } = await fetchGongCalls(credentials);
          const callIds = calls.map((call) => call.id).filter(Boolean);
          const transcripts = await fetchGongTranscripts(credentials, callIds);

          log.info('sync_history_fetched', {
            sourceId,
            channel: source.name,
            provider: source.provider,
            rawMessages: calls.length,
            filteredMessages: callIds.length,
            enrichedMessages: transcripts.length,
            pages: pagesFetched,
            ms: elapsedMs(fetchStartedAt),
          });

          await assertSyncStillActive(supabase, sourceId, 'gong chunking');
          const chunks = chunkGongTranscripts(calls, transcripts);

          log.info('sync_chunks_ready', {
            sourceId,
            channel: source.name,
            provider: source.provider,
            chunks: chunks.length,
            messages: transcripts.length,
          });

          if (chunks.length === 0) {
            throw new NoSyncableContentError({
              rawMessages: calls.length,
              filteredMessages: callIds.length,
              enrichedMessages: transcripts.length,
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
          if (deleteError) throw deleteError;

          const { error: insertError } = await supabase.from('knowledge_chunks').insert(rows);
          if (insertError) throw insertError;

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
          channel: source.name,
          provider: source.provider,
          chunksEmbedded: embeddedCount,
          ms: elapsedMs(syncStartedAt),
        });
        return { ok: true, sourceId, chunksEmbedded: embeddedCount };
      } catch (error) {
        if (error instanceof SyncStoppedError) {
          log.info('sync_stopped', {
            sourceId,
            channel: source.name,
            provider: source.provider,
            phase: error.phase,
            ms: elapsedMs(syncStartedAt),
          });
          return { ok: true, sourceId, stopped: true, phase: error.phase };
        }

        const msg = errorMessage(error);
        if (error instanceof NoSyncableContentError) {
          log.warn('sync_no_content', {
            sourceId,
            channel: source.name,
            provider: source.provider,
            rawMessages: error.rawMessages,
            filteredMessages: error.filteredMessages,
            enrichedMessages: error.enrichedMessages,
            chunks: error.chunks,
            ms: elapsedMs(syncStartedAt),
          });
        }
        if (error instanceof GongApiError) {
          log.error('source_api_failed', {
            sourceId,
            channel: source.name,
            provider: source.provider,
            method: error.method,
            status: error.status,
            error: error.detail,
            ms: elapsedMs(syncStartedAt),
          });
        }
        log.error('sync_failed', {
          sourceId,
          channel: source.name,
          provider: source.provider,
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

        const enriched: SlackMessage[] = [];
        for (const msg of filtered) {
          enriched.push(msg);
          if (msg.reply_count && msg.reply_count > 0) {
            const replies = await fetchSlackThreadReplies(accessToken, source.slack_channel_id!, msg.ts);
            const validReplies = replies.filter((r) => !r.subtype && r.text && r.text.length >= MIN_MESSAGE_LENGTH);
            enriched.push(...validReplies.map((r) => ({ ts: r.ts, text: r.text, user: r.user })));
          }
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
