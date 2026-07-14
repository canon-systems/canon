import { describe, expect, it } from 'vitest';

import { citedEventsForSignal, sourceEvidenceFromEvents } from './evidence';
import type { ReadinessSourceEventRow } from './source-events';

function event(overrides: Partial<ReadinessSourceEventRow>): ReadinessSourceEventRow {
  return {
    id: 'event_1',
    organization_id: 'org_123',
    provider: 'granola',
    source_type: 'transcript',
    source_id: 'source_1',
    external_id: 'external_1',
    content_hash: 'hash_1',
    content: 'Customer asked for SOC 2 proof before rollout.',
    occurred_at: '2026-07-13T12:00:00.000Z',
    processed_at: null,
    status: 'pending',
    metadata: {},
    created_at: '2026-07-13T12:00:00.000Z',
    updated_at: '2026-07-13T12:00:00.000Z',
    ...overrides,
  };
}

describe('readiness evidence selection', () => {
  it('keeps evidence limited to the source indexes cited by the signal', () => {
    const events = [
      event({
        id: 'event_1',
        external_id: 'note_1',
        content_hash: 'hash_1',
        metadata: {
          source_name: 'Acme security review',
          source_url: 'https://app.granola.ai/notes/note_1',
          note_id: 'note_1',
        },
      }),
      event({
        id: 'event_2',
        external_id: 'note_2',
        content_hash: 'hash_2',
        content: 'Unrelated implementation status update.',
        metadata: {
          source_name: 'Beta implementation sync',
          source_url: 'https://app.granola.ai/notes/note_2',
          note_id: 'note_2',
        },
      }),
    ];

    const citedEvents = citedEventsForSignal({ source_indexes: [1] }, events);
    const evidence = sourceEvidenceFromEvents(citedEvents);

    expect(citedEvents.map((sourceEvent) => sourceEvent.id)).toEqual(['event_1']);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      provider: 'granola',
      source_name: 'Acme security review',
      note_id: 'note_1',
      url: 'https://app.granola.ai/notes/note_1',
      source_event_id: 'event_1',
    });
  });

  it('drops invalid source indexes instead of attaching the whole reviewed batch', () => {
    const events = [event({ id: 'event_1' })];

    expect(citedEventsForSignal({ source_indexes: [4] }, events)).toEqual([]);
  });

  it('allows multiple cited sources when they support the same signal', () => {
    const events = [
      event({
        id: 'event_1',
        provider: 'granola',
        external_id: 'note_1',
        content_hash: 'hash_1',
        metadata: {
          source_name: 'Acme renewal call',
          source_url: 'https://app.granola.ai/notes/note_1',
        },
      }),
      event({
        id: 'event_2',
        provider: 'slack',
        source_type: 'team_chat',
        external_id: 'slack_1',
        content_hash: 'hash_2',
        metadata: {
          channel_id: 'C123',
          channel_name: 'sales-engineering',
          message_ts: '1783963200.000000',
        },
      }),
      event({
        id: 'event_3',
        provider: 'google_calendar',
        source_type: 'calendar',
        external_id: 'calendar_1',
        content_hash: 'hash_3',
        metadata: {
          source_name: 'Unrelated customer sync',
        },
      }),
    ];

    const citedEvents = citedEventsForSignal({ source_indexes: [1, 2] }, events);
    const evidence = sourceEvidenceFromEvents(citedEvents);

    expect(citedEvents.map((sourceEvent) => sourceEvent.id)).toEqual(['event_1', 'event_2']);
    expect(evidence.map((source) => source.source_event_id)).toEqual(['event_1', 'event_2']);
    expect(evidence.map((source) => source.provider)).toEqual(['granola', 'slack']);
  });
});
