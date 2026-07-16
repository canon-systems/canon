import { describe, expect, it } from 'vitest';
import { excludeReviewedSourceEvents } from './milestoneEvidenceScanner';
import type { ReadinessSourceEventRow } from '@/lib/server/readiness/source-events';

function sourceEvent(id: string): ReadinessSourceEventRow {
  return {
    id,
    organization_id: 'org_123',
    provider: 'slack',
    source_type: 'team_chat',
    source_id: 'source_123',
    external_id: id,
    content_hash: `hash_${id}`,
    content: `Activity ${id}`,
    occurred_at: '2026-07-15T12:00:00.000Z',
    processed_at: null,
    status: 'pending',
    metadata: {},
    created_at: '2026-07-15T12:00:00.000Z',
    updated_at: '2026-07-15T12:00:00.000Z',
  };
}

describe('milestone evidence scan history', () => {
  it('does not review matched or previously checked activity again', () => {
    const remaining = excludeReviewedSourceEvents({
      events: [sourceEvent('matched'), sourceEvent('no_match'), sourceEvent('new')],
      evidenceSourceEventIds: ['readiness-source-event:matched'],
      checkedSourceEventIds: ['no_match'],
    });

    expect(remaining.map((event) => event.id)).toEqual(['new']);
  });
});
