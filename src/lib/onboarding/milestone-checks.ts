import type { MilestoneEvidenceType } from '@/types/onboarding';

export type MilestoneCheckTrigger = 'scheduled' | 'source_sync' | 'manual';
export type MilestoneCheckOutcome = 'waiting' | 'no_proof' | 'needs_review' | 'verified' | 'failed';

export type MilestoneCheckRun = {
  id: string;
  organization_id: string;
  new_hire_id: string;
  milestone_id: string | null;
  trigger_type: MilestoneCheckTrigger;
  outcome: MilestoneCheckOutcome;
  sources_checked: string[];
  source_event_ids: string[];
  activity_checked: number;
  summary: string;
  started_at: string;
  completed_at: string;
  created_at: string;
};

const sourceLabels: Record<string, string> = {
  access_requests: 'Tool access',
  granola: 'Meeting notes',
  manager_review: 'Manager review',
  manager_slack_review: 'Manager review',
  slack: 'Slack',
};

const evidenceLabels: Record<MilestoneEvidenceType, string> = {
  access_readiness: 'Tool access confirmed',
  communication_activity: 'Work message found',
  customer_exposure: 'Customer work found',
  manager_reopened: 'Learning step reopened',
  manager_verification: 'Manager confirmed',
  new_hire_blocker: 'Blocker reported',
  tool_activity: 'Tool activity found',
};

export function milestoneSourceLabel(source: string) {
  return sourceLabels[source] ?? source.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function milestoneEvidenceLabel(evidenceType: MilestoneEvidenceType) {
  return evidenceLabels[evidenceType];
}

export function milestoneProofLabel(params: {
  evidenceType: MilestoneEvidenceType;
  confidence: number;
  needsManagerReview?: boolean;
}) {
  if (params.evidenceType === 'manager_verification') return 'Verified by manager';
  if (params.evidenceType === 'manager_reopened') return 'Reopened by manager';
  if (params.evidenceType === 'access_readiness' && params.confidence >= 0.8) return 'Confirmed automatically';
  if (params.evidenceType === 'new_hire_blocker') return 'Needs support';
  if (params.needsManagerReview) return 'Needs manager review';
  return params.confidence >= 0.75 ? 'Strong proof' : 'Possible proof';
}

export function milestoneCheckLabel(outcome: MilestoneCheckOutcome) {
  if (outcome === 'needs_review') return 'Needs Review';
  if (outcome === 'verified') return 'Verified';
  if (outcome === 'no_proof') return 'No Proof Yet';
  if (outcome === 'failed') return 'Check Failed';
  return 'Still Watching';
}
