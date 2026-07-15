import { nangoProxyGet } from '@/lib/server/integrations/nango';
import { embedAndReplaceKnowledgeChunks } from '@/lib/server/knowledge-sync/chunk-writer';
import { chunkTextDocument, type KnowledgeTextChunk } from '@/lib/server/knowledge-sync/text-chunker';
import { upsertReadinessSourceEvents } from '@/lib/server/readiness/source-events';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { KnowledgeProvider } from '@/lib/server/knowledge-sync/source-repository';

type SupabaseServiceClient = ReturnType<typeof createServiceRoleClient>;
type TeamChatProvider = Extract<KnowledgeProvider, 'teams'>;
type RawRecord = Record<string, unknown>;

type ChatSyncLogger = {
  info(event: string, metadata?: Record<string, unknown>): void;
  error(event: string, metadata?: Record<string, unknown>): void;
};

type NormalizedChatMessage = {
  id: string;
  targetId: string;
  targetName: string | null;
  text: string;
  occurredAt: string | null;
  authorType: 'human' | 'bot' | 'system';
  authorName: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
};

const MIN_CHAT_MESSAGE_LENGTH = 20;

function isRecord(value: unknown): value is RawRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringField(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function arrayField(response: unknown, keys: string[]) {
  if (Array.isArray(response)) return response;
  if (!isRecord(response)) return [];
  for (const key of keys) {
    const value = response[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function authorType(record: RawRecord): 'human' | 'bot' | 'system' {
  const messageType = stringField(record, ['messageType', 'type'])?.toLowerCase();
  const author = record.from ?? record.sender ?? record.creator;
  if (messageType?.includes('system')) return 'system';
  if (isRecord(author) && (author.application || author.bot)) return 'bot';
  return 'human';
}

function normalizeTeamsMessage(raw: unknown, target: { id: string; name: string | null }): NormalizedChatMessage | null {
  if (!isRecord(raw)) return null;
  const id = stringField(raw, ['id', 'etag']);
  const body = raw.body;
  const rawText = isRecord(body)
    ? stringField(body, ['content'])
    : stringField(raw, ['content', 'text', 'bodyPreview']);
  const text = rawText ? stripHtml(rawText) : '';
  if (!id || text.length < MIN_CHAT_MESSAGE_LENGTH) return null;

  const from = raw.from;
  const user = isRecord(from) && isRecord(from.user) ? from.user : null;
  return {
    id,
    targetId: target.id,
    targetName: target.name,
    text,
    occurredAt: stringField(raw, ['createdDateTime', 'lastModifiedDateTime']),
    authorType: authorType(raw),
    authorName: user ? stringField(user, ['displayName', 'userIdentityType']) : null,
    url: stringField(raw, ['webUrl']),
    metadata: raw,
  };
}

function isWithinWindow(isoDate: string | null, windowDays: number) {
  if (!isoDate) return true;
  const timestamp = new Date(isoDate).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return timestamp >= Date.now() - windowDays * 24 * 60 * 60 * 1000;
}

function chunkChatMessages(provider: TeamChatProvider, messages: NormalizedChatMessage[]): KnowledgeTextChunk[] {
  return messages.flatMap((message) => chunkTextDocument({
    document: {
      content: message.text,
      metadata: {
        provider,
        source_type: 'team_chat',
        external_id: message.id,
        target_id: message.targetId,
        target_name: message.targetName,
        author_type: message.authorType,
        author_name: message.authorName,
        occurred_at: message.occurredAt,
        source_url: message.url,
      },
    },
    identityParts: [provider, message.targetId, message.id],
  }));
}

async function fetchTeamsMessages(params: {
  connectionId: string;
  targetId: string;
  targetName: string | null;
  syncWindowDays: number;
  syncItemLimit: number;
}) {
  const [teamId, channelId] = params.targetId.includes('/')
    ? params.targetId.split('/').map((part) => part.trim()).filter(Boolean)
    : [];
  const endpoint = teamId && channelId
    ? `/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`
    : `/v1.0/chats/${encodeURIComponent(params.targetId)}/messages`;

  const response = await nangoProxyGet({
    provider: 'teams',
    connectionId: params.connectionId,
    endpoint,
    query: { '$top': params.syncItemLimit },
  });

  return arrayField(response, ['value', 'messages'])
    .map((message) => normalizeTeamsMessage(message, { id: params.targetId, name: params.targetName }))
    .filter((message): message is NormalizedChatMessage => message !== null)
    .filter((message) => message.authorType === 'human')
    .filter((message) => isWithinWindow(message.occurredAt, params.syncWindowDays))
    .slice(0, params.syncItemLimit);
}

export async function fetchEmbedPersistTeamChatSource(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
  sourceId: string;
  sourceName: string;
  provider: TeamChatProvider;
  connectionId: string;
  targetId: string;
  targetName: string | null;
  syncWindowDays: number;
  syncItemLimit: number;
  log: ChatSyncLogger;
  assertActive: (phase: string) => Promise<void>;
}): Promise<{ embeddedCount: number; messageCount: number }> {
  await params.assertActive(`${params.provider} messages fetch`);
  const messages = await fetchTeamsMessages(params);

  params.log.info('sync_history_fetched', {
    sourceId: params.sourceId,
    source: params.sourceName,
    provider: params.provider,
    messages: messages.length,
    windowDays: params.syncWindowDays,
    itemLimit: params.syncItemLimit,
  });

  await params.assertActive(`${params.provider} source events`);
  await upsertReadinessSourceEvents({
    supabase: params.supabase,
    events: messages.map((message) => ({
      organizationId: params.organizationId,
      provider: params.provider,
      sourceType: 'team_chat',
      sourceId: params.sourceId,
      externalId: `${message.targetId}:${message.id}`,
      content: message.text,
      occurredAt: message.occurredAt,
      metadata: {
        provider: params.provider,
        target_id: message.targetId,
        target_name: message.targetName,
        author_type: message.authorType,
        author_name: message.authorName,
        source_url: message.url,
      },
    })),
  });

  const chunks = chunkChatMessages(params.provider, messages);
  params.log.info('sync_chunks_ready', {
    sourceId: params.sourceId,
    source: params.sourceName,
    provider: params.provider,
    chunks: chunks.length,
    messages: messages.length,
  });

  const { embeddedCount } = await embedAndReplaceKnowledgeChunks({
    supabase: params.supabase,
    organizationId: params.organizationId,
    sourceId: params.sourceId,
    chunks,
    embeddingPhase: `${params.provider} embedding`,
    replacePhase: `${params.provider} replace chunks`,
    beforePhase: params.assertActive,
    log: params.log,
    logMetadata: { sourceId: params.sourceId, source: params.sourceName, provider: params.provider },
  });

  return { embeddedCount, messageCount: messages.length };
}
