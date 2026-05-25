import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { embed } from 'ai';
import { embeddingModel } from '@/lib/ai';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';

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
  metadata: {
    channel_id: string;
    channel_name: string;
    earliest_ts: string;
    latest_ts: string;
    message_count: number;
  };
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

    const { data: source, error: slackError } = await supabase
      .from('knowledge_sources')
      .select('id, organization_id, provider, name, slack_channel_id, slack_channel_name, status')
      .eq('id', sourceId)
      .single();

    if (slackError || !source) {
      log.info('sync_skipped', { sourceId, reason: 'source_not_found' });
      return { skipped: true, reason: 'source_not_found' };
    }

    if (source.provider !== 'slack' || !source.slack_channel_id) {
      log.info('sync_skipped', { sourceId, reason: 'not_supported_source' });
      return { skipped: true, reason: 'not_supported_source' };
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
