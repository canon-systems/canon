import { describe, expect, it } from 'vitest';

import { rankMilestoneEvidenceCandidates } from './milestoneEvidenceMatcher';
import type { ReadinessSourceEventRow } from '@/lib/server/readiness/source-events';
import type { RampMilestone } from '@/types/onboarding';

function event(id: string, content: string, occurredAt = '2026-07-15T12:00:00.000Z'): ReadinessSourceEventRow {
  return {
    id,
    organization_id: 'org_123',
    provider: 'slack',
    source_type: 'team_chat',
    source_id: 'source_123',
    external_id: id,
    content_hash: `hash_${id}`,
    content,
    occurred_at: occurredAt,
    processed_at: null,
    status: 'pending',
    metadata: {},
    created_at: occurredAt,
    updated_at: occurredAt,
  };
}

const milestone = {
  id: 'milestone_123',
  organization_id: 'org_123',
  role: 'Solutions Engineer',
  day_trigger: 7,
  title: 'Handle launch readiness objection',
  description: 'Show the customer how launch readiness blockers are handled.',
  knowledge_query: 'launch readiness objection customer blocker',
  capability_outcome: 'Can explain launch readiness blockers in a customer conversation.',
  briefing_goal: 'Prepare for launch readiness customer work.',
  real_work_trigger: 'Customer asks about launch readiness blockers.',
  success_signals: ['Explains blocker ownership', 'Names the next step'],
  retrieval_brief: 'launch readiness blockers',
  evidence_requirements: [{ type: 'customer_exposure', label: 'Customer conversation about launch readiness' }],
  source_evidence: [],
  confidence: 0.8,
  status: 'active',
  approved_from_proposal_id: null,
  created_at: '2026-07-15T00:00:00.000Z',
  updated_at: null,
} satisfies RampMilestone;

describe('milestone evidence matcher', () => {
  it('ranks source events by milestone terms and hire identity before model review', () => {
    const ranked = rankMilestoneEvidenceCandidates({
      hire: {
        id: 'hire_123',
        first_name: 'Avery',
        last_name: 'Seller',
        email: 'avery@example.com',
        role: 'Solutions Engineer',
        slack_user_id: 'U123',
      },
      milestone,
      events: [
        event('generic', 'The team discussed roadmap ideas and pricing packaging.'),
        event('matched', 'Avery Seller explained launch readiness blockers and named the next customer step.'),
        event('topic_only', 'Launch readiness blockers came up in a planning thread without the new hire.'),
      ],
    });

    expect(ranked.map((entry) => entry.id)).toEqual(['matched', 'topic_only']);
  });
});
