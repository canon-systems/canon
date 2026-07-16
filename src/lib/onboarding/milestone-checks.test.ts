import { describe, expect, it } from 'vitest';
import {
  milestoneCheckLabel,
  milestoneEvidenceLabel,
  milestoneProofLabel,
  milestoneSourceLabel,
} from './milestone-checks';

describe('milestone check presentation', () => {
  it('uses plain labels for stored check outcomes and sources', () => {
    expect(milestoneCheckLabel('needs_review')).toBe('Needs Review');
    expect(milestoneCheckLabel('no_proof')).toBe('No Proof Yet');
    expect(milestoneSourceLabel('slack')).toBe('Slack');
    expect(milestoneSourceLabel('granola')).toBe('Meeting notes');
  });

  it('describes proof without exposing trust or confidence jargon', () => {
    expect(milestoneEvidenceLabel('customer_exposure')).toBe('Customer work found');
    expect(milestoneEvidenceLabel('manager_reopened')).toBe('Learning step reopened');
    expect(milestoneProofLabel({
      evidenceType: 'customer_exposure',
      confidence: 0.72,
      needsManagerReview: true,
    })).toBe('Needs manager review');
    expect(milestoneProofLabel({
      evidenceType: 'access_readiness',
      confidence: 0.9,
    })).toBe('Confirmed automatically');
    expect(milestoneProofLabel({
      evidenceType: 'manager_reopened',
      confidence: 0.95,
    })).toBe('Reopened by manager');
  });
});
