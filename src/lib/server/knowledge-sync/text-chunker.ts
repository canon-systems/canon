import { createHash } from 'crypto';

export type KnowledgeTextChunk = {
  content: string;
  metadata: Record<string, unknown>;
};

export type TextDocument = {
  content: string;
  metadata?: Record<string, unknown>;
};

export const DEFAULT_KNOWLEDGE_CHUNK_MAX_WORDS = 400;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function createStableChunkId(parts: Array<string | number | null | undefined>): string {
  return createHash('sha256')
    .update(parts.filter((part) => part !== null && part !== undefined).join(':'))
    .digest('hex')
    .slice(0, 24);
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function createKnowledgeTextChunk(params: {
  content: string;
  metadata?: Record<string, unknown>;
  identityParts: Array<string | number | null | undefined>;
}): KnowledgeTextChunk {
  const hash = contentHash(params.content);

  return {
    content: params.content,
    metadata: {
      ...(params.metadata ?? {}),
      content_hash: hash,
      chunk_id: createStableChunkId([...params.identityParts, hash]),
    },
  };
}

export function chunkTextDocument(params: {
  document: TextDocument;
  maxWords?: number;
  overlapWords?: number;
  identityParts: Array<string | number | null | undefined>;
}): KnowledgeTextChunk[] {
  const maxWords = params.maxWords ?? DEFAULT_KNOWLEDGE_CHUNK_MAX_WORDS;
  const overlapWords = params.overlapWords ?? 0;
  const words = params.document.content.split(/\s+/).filter(Boolean);

  if (words.length <= maxWords) {
    return [
      createKnowledgeTextChunk({
        content: params.document.content,
        metadata: params.document.metadata,
        identityParts: [...params.identityParts, 0],
      }),
    ];
  }

  const chunks: KnowledgeTextChunk[] = [];
  const stride = Math.max(1, maxWords - overlapWords);

  for (let index = 0; index < words.length; index += stride) {
    const chunkIndex = chunks.length;
    const content = words.slice(index, index + maxWords).join(' ');
    chunks.push(
      createKnowledgeTextChunk({
        content,
        metadata: {
          ...(params.document.metadata ?? {}),
          chunk_index: chunkIndex,
        },
        identityParts: [...params.identityParts, chunkIndex],
      })
    );

    if (index + maxWords >= words.length) break;
  }

  return chunks;
}
