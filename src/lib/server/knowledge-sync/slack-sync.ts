import { createServiceRoleClient } from '@/lib/supabase/server';
import { embedAndReplaceKnowledgeChunks } from '@/lib/server/knowledge-sync/chunk-writer';
import {
  enrichSlackMessagesWithReplies,
  fetchSlackHistory,
} from '@/lib/server/knowledge-sync/slack-client';
import { chunkSlackMessages } from '@/lib/server/knowledge-sync/slack-chunking';
import { syncableSlackMessages } from '@/lib/server/knowledge-sync/slack-filtering';
import { upsertReadinessSourceEvents } from '@/lib/server/readiness/source-events';

type SupabaseServiceClient = ReturnType<typeof createServiceRoleClient>;

type SlackSyncLogger = {
  info(event: string, metadata?: Record<string, unknown>): void;
  error(event: string, metadata?: Record<string, unknown>): void;
};

const MIN_MESSAGE_LENGTH = 20;

export class NoSyncableContentError extends Error {
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

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function slackTsToIso(ts: string) {
  const seconds = Number(ts.split('.')[0]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

export async function fetchEmbedPersistSlackSource(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
  sourceId: string;
  channelId: string;
  channelName: string;
  accessToken: string;
  log: SlackSyncLogger;
  assertActive: (phase: string) => Promise<void>;
}): Promise<{ embeddedCount: number }> {
  const fetchStartedAt = Date.now();
  await params.assertActive('history fetch');
  const history = await fetchSlackHistory(params.accessToken, params.channelId);
  const rawMessages = history.messages;

  const filtered = syncableSlackMessages(rawMessages, MIN_MESSAGE_LENGTH);

  const enriched = await enrichSlackMessagesWithReplies({
    botToken: params.accessToken,
    channelId: params.channelId,
    messages: filtered,
    minMessageLength: MIN_MESSAGE_LENGTH,
  });
  const syncableEnriched = syncableSlackMessages(enriched, MIN_MESSAGE_LENGTH);

  params.log.info('sync_history_fetched', {
    sourceId: params.sourceId,
    channel: params.channelName,
    rawMessages: rawMessages.length,
    filteredMessages: filtered.length,
    enrichedMessages: syncableEnriched.length,
    pages: history.pagesFetched,
    ms: elapsedMs(fetchStartedAt),
  });

  await params.assertActive('chunking');
  await upsertReadinessSourceEvents({
    supabase: params.supabase,
    events: syncableEnriched.map((message) => ({
      organizationId: params.organizationId,
      provider: 'slack',
      sourceType: 'team_chat',
      sourceId: params.sourceId,
      externalId: `${params.channelId}:${message.ts}`,
      content: message.text,
      occurredAt: slackTsToIso(message.ts),
      metadata: {
        channel_id: params.channelId,
        channel_name: params.channelName,
        message_ts: message.ts,
        thread_ts: message.thread_ts ?? null,
        user: message.user ?? null,
        author_type: 'human',
      },
    })),
  });

  const chunks = chunkSlackMessages(syncableEnriched, params.channelId, params.channelName);

  params.log.info('sync_chunks_ready', {
    sourceId: params.sourceId,
    channel: params.channelName,
    chunks: chunks.length,
    messages: syncableEnriched.length,
  });

  if (chunks.length === 0) {
    throw new NoSyncableContentError({
      rawMessages: rawMessages.length,
      filteredMessages: filtered.length,
      enrichedMessages: syncableEnriched.length,
      chunks: chunks.length,
    });
  }

  return embedAndReplaceKnowledgeChunks({
    supabase: params.supabase,
    organizationId: params.organizationId,
    sourceId: params.sourceId,
    chunks,
    embeddingPhase: 'embedding',
    replacePhase: 'replace chunks',
    beforePhase: params.assertActive,
    log: params.log,
    logMetadata: { sourceId: params.sourceId, channel: params.channelName },
  });
}
