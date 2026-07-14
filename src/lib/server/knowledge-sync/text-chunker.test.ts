import { describe, expect, it } from 'vitest';

import {
  chunkTextDocument,
  countWords,
  createKnowledgeTextChunk,
  createStableChunkId,
} from './text-chunker';

describe('text chunker', () => {
  it('counts words across mixed whitespace', () => {
    expect(countWords(' one\n two\t\tthree  ')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });

  it('creates stable chunk ids and content hashes', () => {
    const first = createKnowledgeTextChunk({
      content: 'same content',
      metadata: { source_id: 'source_1' },
      identityParts: ['source_1', 0],
    });
    const second = createKnowledgeTextChunk({
      content: 'same content',
      metadata: { source_id: 'source_1' },
      identityParts: ['source_1', 0],
    });

    expect(first.metadata.source_id).toBe('source_1');
    expect(first.metadata.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.metadata.chunk_id).toMatch(/^[a-f0-9]{24}$/);
    expect(first.metadata.chunk_id).toBe(second.metadata.chunk_id);
  });

  it('skips null identity parts when creating stable ids', () => {
    expect(createStableChunkId(['source', null, undefined, 1])).toBe(createStableChunkId(['source', 1]));
  });

  it('chunks long documents with overlap and inherited metadata', () => {
    const chunks = chunkTextDocument({
      document: {
        content: 'one two three four five six',
        metadata: { source_id: 'source_1' },
      },
      maxWords: 3,
      overlapWords: 1,
      identityParts: ['source_1'],
    });

    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.content)).toEqual([
      'one two three',
      'three four five',
      'five six',
    ]);
    expect(chunks.map((chunk) => chunk.metadata.chunk_index)).toEqual([0, 1, 2]);
    expect(chunks.every((chunk) => chunk.metadata.source_id === 'source_1')).toBe(true);
  });
});
