import { createServiceRoleClient } from '@/lib/supabase/server';
import { embedAndReplaceKnowledgeChunks } from '@/lib/server/knowledge-sync/chunk-writer';
import {
  enrichSlackMessagesWithReplies,
  fetchSlackHistory,
} from '@/lib/server/knowledge-sync/slack-client';
import { chunkSlackMessages } from '@/lib/server/knowledge-sync/slack-chunking';

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

  const filtered = rawMessages.filter(
    (message) => !message.subtype && message.text && message.text.length >= MIN_MESSAGE_LENGTH
  );

  const enriched = await enrichSlackMessagesWithReplies({
    botToken: params.accessToken,
    channelId: params.channelId,
    messages: filtered,
    minMessageLength: MIN_MESSAGE_LENGTH,
  });

  params.log.info('sync_history_fetched', {
    sourceId: params.sourceId,
    channel: params.channelName,
    rawMessages: rawMessages.length,
    filteredMessages: filtered.length,
    enrichedMessages: enriched.length,
    pages: history.pagesFetched,
    ms: elapsedMs(fetchStartedAt),
  });

  await params.assertActive('chunking');
  const chunks = chunkSlackMessages(enriched, params.channelId, params.channelName);

  params.log.info('sync_chunks_ready', {
    sourceId: params.sourceId,
    channel: params.channelName,
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
