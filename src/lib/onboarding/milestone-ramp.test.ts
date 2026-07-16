import { describe, expect, it } from 'vitest';

import {
  clampMilestoneDayToTarget,
  findAvailableMilestoneDay,
  generatedMilestoneSpacingDays,
  hasMilestoneContentOverlap,
  milestoneContentSimilarity,
  normalizeMilestoneProgressStatus,
  normalizeRampTargets,
  pickCurrentMilestoneForEvidenceScan,
  pickNextActionableMilestone,
  progressStatusForEvidence,
  requiredToolsForEvidence,
} from './milestone-ramp';

describe('milestone ramp rules', () => {
  it('maps legacy evidence_detected to needs_review', () => {
    expect(normalizeMilestoneProgressStatus('evidence_detected')).toBe('needs_review');
    expect(normalizeMilestoneProgressStatus('blocked')).toBe('blocked');
    expect(normalizeMilestoneProgressStatus('unknown')).toBe('not_started');
  });

  it('only auto-verifies high-trust deterministic or manager evidence', () => {
    expect(progressStatusForEvidence({
      evidenceType: 'access_readiness',
      trustLevel: 'high',
      confidence: 0.92,
    })).toBe('verified');
    expect(progressStatusForEvidence({
      evidenceType: 'manager_verification',
      trustLevel: 'high',
      confidence: 1,
    })).toBe('verified');
    expect(progressStatusForEvidence({
      evidenceType: 'customer_exposure',
      trustLevel: 'high',
      confidence: 0.95,
    })).toBe('needs_review');
    expect(progressStatusForEvidence({
      evidenceType: 'new_hire_blocker',
      trustLevel: 'low',
      confidence: 0.2,
    })).toBe('blocked');
  });

  it('extracts required access tools from requirement metadata', () => {
    expect(requiredToolsForEvidence([
      { type: 'access_readiness', label: 'Tools', metadata: { tools: ['Slack', ' Salesforce '], tool: 'Gong' } },
      { type: 'customer_exposure', label: 'Customer call' },
    ])).toEqual(['Slack', 'Salesforce', 'Gong']);
  });

  it('normalizes ramp target defaults and day bounds', () => {
    expect(normalizeRampTargets()).toEqual({ baselineRampDays: 90, targetRampDays: 45 });
    expect(normalizeRampTargets({ baselineRampDays: 120, targetRampDays: 60 })).toEqual({
      baselineRampDays: 120,
      targetRampDays: 60,
    });
    expect(normalizeRampTargets({ baselineRampDays: 30, targetRampDays: 90 })).toEqual({
      baselineRampDays: 30,
      targetRampDays: 30,
    });
    expect(clampMilestoneDayToTarget(75, 45)).toBe(45);
  });

  it('assigns the next open ramp day without overlapping occupied days', () => {
    expect(findAvailableMilestoneDay({
      preferredDay: 3,
      targetRampDays: 45,
      occupiedDays: [3, 4],
    })).toBe(5);

    expect(findAvailableMilestoneDay({
      preferredDay: 3,
      targetRampDays: 45,
      occupiedDays: [3, 4],
      earliestDay: 8,
    })).toBe(8);

    expect(findAvailableMilestoneDay({
      preferredDay: 2,
      targetRampDays: 2,
      occupiedDays: [0, 1, 2],
    })).toBeNull();
  });

  it('can enforce spacing between generated milestone days', () => {
    expect(generatedMilestoneSpacingDays(45)).toBe(3);
    expect(generatedMilestoneSpacingDays(30)).toBe(2);
    expect(generatedMilestoneSpacingDays(14)).toBe(1);
    expect(findAvailableMilestoneDay({
      preferredDay: 3,
      targetRampDays: 45,
      occupiedDays: [3],
      minimumSpacingDays: generatedMilestoneSpacingDays(45),
    })).toBe(6);
  });

  it('detects milestone content overlap across title, trigger, proof, and retrieval text', () => {
    const existing = {
      title: 'Resolve launch blocker handoffs',
      capability_outcome: 'Handle implementation blocker handoffs with the right owner and customer context.',
      briefing_goal: 'Explain how launch blockers move from support to implementation owners.',
      real_work_trigger: 'A customer launch blocker is handed off in Slack before go-live.',
      success_signals: ['Slack thread names the blocker, owner, and next customer step'],
      retrieval_brief: 'launch blocker handoff owner customer next step',
      evidence_requirements: [{ label: 'Slack handoff thread includes blocker owner and customer next step' }],
    };

    expect(hasMilestoneContentOverlap({
      title: 'Customer launch blocker handoff',
      capability_outcome: 'Route implementation launch blockers to the correct owner with customer context.',
      briefing_goal: 'Brief the hire on launch blocker handoffs before their first customer go-live issue.',
      real_work_trigger: 'A Slack thread assigns an owner for a customer launch blocker.',
      success_signals: ['Thread includes blocker, owner, and next step'],
      retrieval_brief: 'customer launch blocker owner next step',
      evidence_requirements: [{ label: 'Slack thread confirms blocker owner and next step' }],
    }, [existing])).toBe(true);

    expect(milestoneContentSimilarity({
      title: 'Join renewal risk review',
      capability_outcome: 'Summarize renewal risk themes after reviewing account history.',
      briefing_goal: 'Explain active renewal risk patterns.',
      real_work_trigger: 'A manager invites the hire to a renewal risk review.',
      success_signals: ['Risk note references account history'],
      retrieval_brief: 'renewal risk account history summary',
      evidence_requirements: [{ label: 'Risk review note' }],
    }, existing)).toBeLessThan(0.72);
  });

  it('picks only the next unblocked actionable milestone', () => {
    const milestones = [
      { id: 'm1', day_trigger: 1 },
      { id: 'm2', day_trigger: 3 },
      { id: 'm3', day_trigger: 7 },
    ];

    expect(pickNextActionableMilestone(milestones, [
      { milestone_id: 'm1', status: 'verified' },
    ], [])?.id).toBe('m2');

    expect(pickNextActionableMilestone(milestones, [
      { milestone_id: 'm1', status: 'verified' },
      { milestone_id: 'm2', status: 'needs_review' },
    ], [])).toBeNull();

    expect(pickNextActionableMilestone(milestones, [
      { milestone_id: 'm1', status: 'verified' },
    ], [{ milestone_id: 'm2' }])).toBeNull();
  });

  it('scans only the current briefed milestone and waits on review states', () => {
    const milestones = [
      { id: 'm1', day_trigger: 1 },
      { id: 'm2', day_trigger: 3 },
      { id: 'm3', day_trigger: 7 },
    ];

    expect(pickCurrentMilestoneForEvidenceScan(milestones, [
      { milestone_id: 'm1', status: 'verified' },
      { milestone_id: 'm2', status: 'briefed' },
    ], [])?.id).toBe('m2');

    expect(pickCurrentMilestoneForEvidenceScan(milestones, [
      { milestone_id: 'm1', status: 'verified' },
      { milestone_id: 'm2', status: 'needs_review' },
    ], [])).toBeNull();

    expect(pickCurrentMilestoneForEvidenceScan(milestones, [
      { milestone_id: 'm1', status: 'verified' },
    ], [{ milestone_id: 'm2' }])?.id).toBe('m2');

    expect(pickCurrentMilestoneForEvidenceScan(milestones, [
      { milestone_id: 'm1', status: 'verified' },
    ], [])).toBeNull();
  });
});
