import { createServiceRoleClient } from '@/lib/supabase/server';
import { fetchGranolaNotes, type NormalizedGranolaNote } from '@/lib/server/integrations/granola';
import { embedAndReplaceKnowledgeChunks } from '@/lib/server/knowledge-sync/chunk-writer';
import { logGranolaDiagnostics } from '@/lib/server/knowledge-sync/granola-diagnostics';
import { chunkTextDocument, type KnowledgeTextChunk } from '@/lib/server/knowledge-sync/text-chunker';
import { upsertReadinessSourceEvents } from '@/lib/server/readiness/source-events';

type SupabaseServiceClient = ReturnType<typeof createServiceRoleClient>;

type GranolaSyncLogger = {
  info(event: string, metadata?: Record<string, unknown>): void;
  warn(event: string, metadata?: Record<string, unknown>): void;
  error(event: string, metadata?: Record<string, unknown>): void;
};

export type GranolaSyncStats = {
  embeddedCount: number;
  noteCount: number;
  rawNoteCount: number;
  detailsFetched: number;
  transcriptItems: number;
  transcriptTextChars: number;
};

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
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

export async function fetchEmbedPersistGranolaSource(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
  sourceId: string;
  sourceName: string;
  connectionId: string;
  syncWindowDays: number;
  syncItemLimit: number;
  log: GranolaSyncLogger;
  assertActive: (phase: string) => Promise<void>;
}): Promise<GranolaSyncStats> {
  const fetchStartedAt = Date.now();
  await params.assertActive('granola notes fetch');
  const granolaResult = await fetchGranolaNotes(params.connectionId, {
    windowDays: params.syncWindowDays,
    maxNotes: params.syncItemLimit,
  });
  const notes = granolaResult.notes;
  logGranolaDiagnostics({
    log: params.log,
    sourceId: params.sourceId,
    sourceName: params.sourceName,
    diagnostics: granolaResult.diagnostics,
  });

  params.log.info('sync_history_fetched', {
    sourceId: params.sourceId,
    source: params.sourceName,
    provider: 'granola',
    rawMessages: granolaResult.rawCount,
    filteredMessages: notes.length,
    enrichedMessages: notes.length,
    pages: granolaResult.pagesFetched,
    detailsFetched: granolaResult.detailsFetched,
    transcriptItems: granolaResult.transcriptItems,
    transcriptTextChars: granolaResult.transcriptTextChars,
    windowDays: params.syncWindowDays,
    itemLimit: params.syncItemLimit,
    ms: elapsedMs(fetchStartedAt),
  });

  await params.assertActive('granola chunking');
  await upsertReadinessSourceEvents({
    supabase: params.supabase,
    events: notes.map((note) => ({
      organizationId: params.organizationId,
      provider: 'granola',
      sourceType: 'transcript',
      sourceId: params.sourceId,
      externalId: note.id,
      content: note.content,
      occurredAt: note.meetingDate,
      metadata: {
        ...note.metadata,
        source_name: note.title,
        source_url: note.url,
        note_id: note.id,
      },
    })),
  });

  const chunks = chunkGranolaNotes(notes);

  params.log.info('sync_chunks_ready', {
    sourceId: params.sourceId,
    source: params.sourceName,
    provider: 'granola',
    chunks: chunks.length,
    messages: notes.length,
  });

  const { embeddedCount } = await embedAndReplaceKnowledgeChunks({
    supabase: params.supabase,
    organizationId: params.organizationId,
    sourceId: params.sourceId,
    chunks,
    embeddingPhase: 'granola embedding',
    replacePhase: 'replace granola chunks',
    beforePhase: params.assertActive,
    log: params.log,
    logMetadata: { sourceId: params.sourceId, source: params.sourceName },
  });

  return {
    embeddedCount,
    noteCount: notes.length,
    rawNoteCount: granolaResult.rawCount,
    detailsFetched: granolaResult.detailsFetched,
    transcriptItems: granolaResult.transcriptItems,
    transcriptTextChars: granolaResult.transcriptTextChars,
  };
}
