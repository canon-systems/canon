import { describe, expect, it } from 'vitest';

import {
  readinessContentHash,
  readinessSourceEventsFromKnowledgeChunks,
  upsertReadinessSourceEvents,
} from './source-events';

type QueryCall =
  | { method: 'from'; table: string }
  | { method: 'upsert'; rows: unknown[]; options: unknown };

function createSupabaseSpy() {
  const calls: QueryCall[] = [];
  const query = {
    upsert(rows: unknown[], options: unknown) {
      calls.push({ method: 'upsert', rows, options });
      return Promise.resolve({ error: null });
    },
  };
  const supabase = {
    from(table: string) {
      calls.push({ method: 'from', table });
      return query;
    },
  };
  return { supabase, calls };
}

describe('readiness source events', () => {
  it('hashes content deterministically', () => {
    expect(readinessContentHash('same')).toBe(readinessContentHash('same'));
    expect(readinessContentHash('same')).not.toBe(readinessContentHash('different'));
  });

  it('upserts source events on provider, external id, and content hash', async () => {
    const { supabase, calls } = createSupabaseSpy();

    await upsertReadinessSourceEvents({
      // The helper only needs the small query surface above for this test.
      supabase: supabase as never,
      events: [{
        organizationId: 'org_123',
        provider: 'slack',
        sourceType: 'team_chat',
        sourceId: 'source_123',
        externalId: 'C123:1710000000.000100',
        content: '  Customer asked about audit logs.  ',
        occurredAt: '2026-07-13T13:00:00.000Z',
        metadata: { channel_id: 'C123' },
      }],
    });

    expect(calls).toContainEqual({ method: 'from', table: 'readiness_source_events' });
    const upsert = calls.find((call): call is Extract<QueryCall, { method: 'upsert' }> => call.method === 'upsert');
    expect(upsert?.options).toEqual({ onConflict: 'organization_id,provider,external_id,content_hash' });
    expect(upsert?.rows[0]).toMatchObject({
      organization_id: 'org_123',
      provider: 'slack',
      source_type: 'team_chat',
      source_id: 'source_123',
      external_id: 'C123:1710000000.000100',
      content: 'Customer asked about audit logs.',
      status: 'pending',
      metadata: { channel_id: 'C123' },
    });
    expect((upsert?.rows[0] as { content_hash?: string }).content_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('maps existing knowledge chunks into readiness source events for migration backfill', () => {
    const events = readinessSourceEventsFromKnowledgeChunks({
      organizationId: 'org_123',
      chunks: [
        {
          id: 'chunk_slack',
          source_id: 'source_slack',
          content: 'Customer asked whether SSO audit logs are ready.',
          created_at: '2026-07-13T13:00:00.000Z',
          metadata: {
            provider: 'slack',
            source_type: 'team_chat',
            channel_id: 'C123',
            channel_name: 'sales-engineering',
            latest_ts: '1783940400.000100',
            external_id: 'C123:1783940000.000100:1783940400.000100',
          },
        },
        {
          id: 'chunk_granola',
          source_id: 'source_granola',
          content: 'Meeting transcript: customer needs admin reporting before launch.',
          created_at: '2026-07-13T14:00:00.000Z',
          metadata: {
            provider: 'granola',
            source_name: 'Acme kickoff',
            source_url: 'https://app.granola.ai/notes/note_123',
            note_id: 'note_123',
            meeting_date: '2026-07-13T12:00:00.000Z',
          },
        },
        {
          id: 'chunk_unknown',
          source_id: 'source_unknown',
          content: 'No provider metadata.',
          created_at: '2026-07-13T15:00:00.000Z',
          metadata: {},
        },
      ],
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      organizationId: 'org_123',
      provider: 'slack',
      sourceType: 'team_chat',
      sourceId: 'source_slack',
      externalId: 'C123:1783940000.000100:1783940400.000100',
      occurredAt: '2026-07-13T11:00:00.000Z',
      metadata: {
        source_chunk_id: 'chunk_slack',
        backfilled_from: 'knowledge_chunks',
      },
    });
    expect(events[1]).toMatchObject({
      organizationId: 'org_123',
      provider: 'granola',
      sourceType: 'transcript',
      sourceId: 'source_granola',
      externalId: 'note_123',
      occurredAt: '2026-07-13T12:00:00.000Z',
    });
  });
});
