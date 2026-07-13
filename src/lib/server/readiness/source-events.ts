import { createHash } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { KnowledgeProvider, ReadinessSourceType } from '@/types/onboarding';

type SupabaseServiceClient = ReturnType<typeof createServiceRoleClient>;

export type ReadinessSourceEventInput = {
  organizationId: string;
  provider: KnowledgeProvider;
  sourceType: ReadinessSourceType;
  sourceId?: string | null;
  externalId: string;
  content: string;
  occurredAt?: string | null;
  status?: 'pending' | 'ignored';
  metadata?: Record<string, unknown>;
};

export type ReadinessSourceEventRow = {
  id: string;
  organization_id: string;
  provider: KnowledgeProvider;
  source_type: ReadinessSourceType;
  source_id: string | null;
  external_id: string;
  content_hash: string;
  content: string;
  occurred_at: string | null;
  processed_at: string | null;
  status: 'pending' | 'processed' | 'ignored' | 'error';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type KnowledgeChunkSourceEventSeed = {
  id: string;
  source_id: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export function readinessContentHash(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

function compactContent(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function isKnowledgeProvider(value: unknown): value is KnowledgeProvider {
  return value === 'slack' ||
    value === 'granola' ||
    value === 'teams' ||
    value === 'google_chat' ||
    value === 'gmail' ||
    value === 'google_calendar' ||
    value === 'outlook';
}

function isReadinessSourceType(value: unknown): value is ReadinessSourceType {
  return value === 'team_chat' || value === 'transcript' || value === 'email' || value === 'calendar';
}

function fallbackSourceType(provider: KnowledgeProvider): ReadinessSourceType {
  if (provider === 'granola') return 'transcript';
  if (provider === 'gmail') return 'email';
  if (provider === 'google_calendar' || provider === 'outlook') return 'calendar';
  return 'team_chat';
}

function slackTsToIso(value: unknown) {
  if (typeof value !== 'string') return null;
  const seconds = Number(value.split('.')[0]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

export function readinessSourceEventsFromKnowledgeChunks(params: {
  organizationId: string;
  chunks: KnowledgeChunkSourceEventSeed[];
}): ReadinessSourceEventInput[] {
  return params.chunks.flatMap((chunk) => {
    const metadata = chunk.metadata && typeof chunk.metadata === 'object' && !Array.isArray(chunk.metadata)
      ? chunk.metadata
      : {};
    const provider = isKnowledgeProvider(metadata.provider) ? metadata.provider : null;
    if (!provider) return [];

    const sourceType = isReadinessSourceType(metadata.source_type)
      ? metadata.source_type
      : fallbackSourceType(provider);
    const externalId = typeof metadata.external_id === 'string' && metadata.external_id.trim().length > 0
      ? metadata.external_id
      : typeof metadata.note_id === 'string' && metadata.note_id.trim().length > 0
        ? metadata.note_id
        : typeof metadata.chunk_id === 'string' && metadata.chunk_id.trim().length > 0
          ? metadata.chunk_id
          : chunk.id;
    const occurredAt = typeof metadata.meeting_date === 'string'
      ? metadata.meeting_date
      : slackTsToIso(metadata.latest_ts) ?? chunk.created_at;

    return [{
      organizationId: params.organizationId,
      provider,
      sourceType,
      sourceId: chunk.source_id,
      externalId,
      content: chunk.content,
      occurredAt,
      metadata: {
        ...metadata,
        source_chunk_id: chunk.id,
        backfilled_from: 'knowledge_chunks',
      },
    }];
  });
}

export async function upsertReadinessSourceEvents(params: {
  supabase: SupabaseServiceClient;
  events: ReadinessSourceEventInput[];
}) {
  const now = new Date().toISOString();
  const rows = params.events.flatMap((event) => {
    const content = compactContent(event.content);
    if (!content) return [];

    return [{
      organization_id: event.organizationId,
      provider: event.provider,
      source_type: event.sourceType,
      source_id: event.sourceId ?? null,
      external_id: event.externalId,
      content_hash: readinessContentHash(content),
      content,
      occurred_at: event.occurredAt ?? null,
      status: event.status ?? 'pending',
      metadata: event.metadata ?? {},
      updated_at: now,
    }];
  });

  if (rows.length === 0) return { upserted: 0 };

  const { error } = await params.supabase
    .from('readiness_source_events')
    .upsert(rows, { onConflict: 'organization_id,provider,external_id,content_hash' });

  if (error) throw error;
  return { upserted: rows.length };
}

export async function markReadinessSourceEventsProcessed(params: {
  supabase: SupabaseServiceClient;
  ids: string[];
  status?: 'processed' | 'ignored' | 'error';
}) {
  const ids = Array.from(new Set(params.ids.filter(Boolean)));
  if (ids.length === 0) return;

  const now = new Date().toISOString();
  const { error } = await params.supabase
    .from('readiness_source_events')
    .update({
      status: params.status ?? 'processed',
      processed_at: now,
      updated_at: now,
    })
    .in('id', ids);

  if (error) throw error;
}
