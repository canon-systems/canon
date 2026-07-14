import { embed } from 'ai';
import { embeddingModel } from '@/lib/ai';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { KnowledgeTextChunk } from '@/lib/server/knowledge-sync/text-chunker';

type SupabaseServiceClient = ReturnType<typeof createServiceRoleClient>;

type KnowledgeChunkInsert = {
  organization_id: string;
  source_id: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: string;
};

type KnowledgeChunkWriterLogger = {
  error(event: string, metadata?: Record<string, unknown>): void;
};

export async function embedAndReplaceKnowledgeChunks(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
  sourceId: string;
  chunks: KnowledgeTextChunk[];
  embeddingPhase: string;
  replacePhase: string;
  beforePhase?: (phase: string) => Promise<void>;
  log?: KnowledgeChunkWriterLogger;
  logMetadata?: Record<string, unknown>;
}): Promise<{ embeddedCount: number }> {
  const rows: KnowledgeChunkInsert[] = [];

  for (const chunk of params.chunks) {
    await params.beforePhase?.(params.embeddingPhase);
    const { embedding } = await embed({ model: embeddingModel, value: chunk.content });
    rows.push({
      organization_id: params.organizationId,
      source_id: params.sourceId,
      content: chunk.content,
      metadata: chunk.metadata,
      embedding: JSON.stringify(embedding),
    });
  }

  await params.beforePhase?.(params.replacePhase);
  const { error: deleteError } = await params.supabase
    .from('knowledge_chunks')
    .delete()
    .eq('source_id', params.sourceId);

  if (deleteError) {
    params.log?.error('sync_db_write_failed', {
      ...(params.logMetadata ?? {}),
      operation: 'delete_existing_chunks',
      error: deleteError.message,
    });
    throw deleteError;
  }

  if (rows.length > 0) {
    const { error: insertError } = await params.supabase.from('knowledge_chunks').insert(rows);
    if (insertError) {
      params.log?.error('sync_db_write_failed', {
        ...(params.logMetadata ?? {}),
        operation: 'insert_chunks',
        chunks: rows.length,
        error: insertError.message,
      });
      throw insertError;
    }
  }

  return { embeddedCount: rows.length };
}
