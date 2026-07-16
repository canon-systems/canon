import { describe, expect, it } from 'vitest';
import {
  managerMilestoneDecisionConfig,
  managerReviewBlocks,
  managerReviewResultBlocks,
  notificationCopy,
  resolveMilestoneEvidenceProgressStatus,
  resolveMilestoneVerifiedAt,
  shouldNotifyForMilestoneEvidence,
} from './milestoneEvidence';

describe('milestone manager review communication', () => {
  it('asks for a manager decision in direct customer-facing language', () => {
    const copy = notificationCopy({
      hireName: 'Maria Chen',
      milestoneTitle: 'Handle implementation risk',
      evidenceType: 'customer_exposure',
      verified: false,
      source: 'slack',
    });

    expect(copy.title).toBe('Maria Chen may have completed "Handle implementation risk"');
    expect(copy.body).toContain('possible proof in Slack');
    expect(copy.body).not.toContain('confidence');
  });

  it('keeps all three manager decisions in the Slack message', () => {
    const blocks = managerReviewBlocks({
      title: 'Maria Chen may have completed a learning step',
      body: 'Canon found possible proof in Slack.',
      newHireId: 'hire_123',
      milestoneId: 'milestone_123',
      evidenceId: 'evidence_123',
      evidenceType: 'customer_exposure',
      verified: false,
      metadata: {
        reason: 'Maria gave the customer a clear next step.',
        excerpt: 'The auth blocker is owned by our platform team.',
      },
    });
    const rendered = JSON.stringify(blocks);

    expect(rendered).toContain('Why Canon flagged this');
    expect(rendered).toContain('manager_milestone_verify');
    expect(rendered).toContain('manager_milestone_keep_open');
    expect(rendered).toContain('manager_milestone_mark_blocked');
  });

  it('moves a kept-open step out of the manager review queue', () => {
    expect(managerMilestoneDecisionConfig('keep_open')).toMatchObject({
      progressStatusOverride: 'briefed',
      statusText: '*Learning step kept open.*',
    });
  });

  it('reopens a verified step only after an explicit manager decision', () => {
    expect(resolveMilestoneEvidenceProgressStatus({
      currentStatus: 'verified',
      evidenceType: 'communication_activity',
      trustLevel: 'low',
      confidence: 0.3,
      progressStatusOverride: 'briefed',
    })).toBe('verified');

    expect(managerMilestoneDecisionConfig('unverify')).toMatchObject({
      evidenceType: 'manager_reopened',
      progressStatusOverride: 'briefed',
      requiredCurrentStatus: 'verified',
      allowVerifiedStatusChange: true,
      clearVerifiedAt: true,
      statusText: '*Learning step reopened.*',
    });

    expect(resolveMilestoneEvidenceProgressStatus({
      currentStatus: 'verified',
      evidenceType: 'manager_reopened',
      trustLevel: 'high',
      confidence: 0.95,
      progressStatusOverride: 'briefed',
      allowVerifiedStatusChange: true,
    })).toBe('briefed');

    expect(resolveMilestoneVerifiedAt({
      resolvedStatus: 'briefed',
      currentVerifiedAt: '2026-07-15T10:00:00.000Z',
      clearVerifiedAt: true,
      now: '2026-07-15T11:00:00.000Z',
    })).toBeNull();
  });

  it('keeps a reopen action in the Slack confirmation after verification', () => {
    const blocks = managerReviewResultBlocks({
      statusText: '*Learning step verified.*',
      actor: 'Taylor',
      reopenValue: 'hire_123|milestone_123|evidence_123',
    });
    const rendered = JSON.stringify(blocks);

    expect(rendered).toContain('Reopen step');
    expect(rendered).toContain('manager_milestone_unverify');
    expect(rendered).toContain('hire_123|milestone_123|evidence_123');
  });

  it('does not notify twice for the same proof and unchanged status', () => {
    expect(shouldNotifyForMilestoneEvidence({
      evidenceExists: true,
      currentStatus: 'needs_review',
      resolvedStatus: 'needs_review',
    })).toBe(false);

    expect(shouldNotifyForMilestoneEvidence({
      evidenceExists: true,
      currentStatus: 'briefed',
      resolvedStatus: 'needs_review',
    })).toBe(true);
  });
});
