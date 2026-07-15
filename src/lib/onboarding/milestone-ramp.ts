import type {
  MilestoneEvidenceRequirement,
  MilestoneEvidenceTrustLevel,
  MilestoneEvidenceType,
  MilestoneProgressStatus,
  RampMilestone,
} from '@/types/onboarding';

export const DEFAULT_BASELINE_RAMP_DAYS = 90;
export const DEFAULT_TARGET_RAMP_DAYS = 45;

export type CanonicalMilestoneProgressStatus =
  | 'not_started'
  | 'briefed'
  | 'needs_review'
  | 'blocked'
  | 'verified';

export type ProgressLike = {
  milestone_id: string;
  status: MilestoneProgressStatus | string | null;
};

export type DeliveryLike = {
  milestone_id: string | null;
};

const canonicalStatuses = new Set<CanonicalMilestoneProgressStatus>([
  'not_started',
  'briefed',
  'needs_review',
  'blocked',
  'verified',
]);

export function normalizeMilestoneProgressStatus(
  status: MilestoneProgressStatus | string | null | undefined
): CanonicalMilestoneProgressStatus {
  if (status === 'evidence_detected') return 'needs_review';
  return canonicalStatuses.has(status as CanonicalMilestoneProgressStatus)
    ? status as CanonicalMilestoneProgressStatus
    : 'not_started';
}

export function progressStatusForEvidence(params: {
  currentStatus?: MilestoneProgressStatus | string | null;
  evidenceType: MilestoneEvidenceType;
  trustLevel: MilestoneEvidenceTrustLevel;
  confidence: number;
}): CanonicalMilestoneProgressStatus {
  const current = normalizeMilestoneProgressStatus(params.currentStatus);
  if (current === 'verified') return 'verified';
  if (params.evidenceType === 'new_hire_blocker') return 'blocked';
  if (params.evidenceType === 'manager_verification') return 'verified';

  const deterministicType = params.evidenceType === 'access_readiness' || params.evidenceType === 'tool_activity';
  if (deterministicType && params.trustLevel === 'high' && params.confidence >= 0.8) {
    return 'verified';
  }

  return 'needs_review';
}

export function normalizeToolName(value: string) {
  return value.trim().toLowerCase();
}

function metadataStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

export function requiredToolsForEvidence(requirements: MilestoneEvidenceRequirement[]) {
  const tools = new Set<string>();
  for (const requirement of requirements) {
    if (requirement.type !== 'access_readiness') continue;
    const metadata = requirement.metadata ?? {};
    for (const tool of metadataStringArray(metadata.tools)) tools.add(tool.trim());
    if (typeof metadata.tool === 'string' && metadata.tool.trim()) tools.add(metadata.tool.trim());
  }
  return Array.from(tools);
}

export function isAccessStatusGranted(status: string | null | undefined) {
  return status === 'granted' || status === 'confirmed';
}

export function isAccessStatusConfirmed(status: string | null | undefined) {
  return status === 'confirmed';
}

export function normalizeRampTargets(params?: {
  baselineRampDays?: number | null;
  targetRampDays?: number | null;
}) {
  const baseline = Number.isInteger(params?.baselineRampDays)
    ? Math.max(1, Math.min(365, params!.baselineRampDays!))
    : DEFAULT_BASELINE_RAMP_DAYS;
  const targetInput = Number.isInteger(params?.targetRampDays)
    ? Math.max(1, Math.min(365, params!.targetRampDays!))
    : Math.ceil(baseline / 2);

  return {
    baselineRampDays: baseline,
    targetRampDays: Math.min(targetInput, baseline),
  };
}

export function clampMilestoneDayToTarget(day: number, targetRampDays: number) {
  if (!Number.isFinite(day)) return 0;
  return Math.max(0, Math.min(Math.round(day), Math.max(0, targetRampDays)));
}

export function findAvailableMilestoneDay(params: {
  preferredDay: number;
  targetRampDays: number;
  occupiedDays: Iterable<number>;
  earliestDay?: number;
  minimumSpacingDays?: number;
}) {
  const target = Math.max(0, Math.round(params.targetRampDays));
  const earliest = clampMilestoneDayToTarget(params.earliestDay ?? 0, target);
  const preferred = Math.max(earliest, clampMilestoneDayToTarget(params.preferredDay, target));
  const minimumSpacingDays = Math.max(1, Math.round(params.minimumSpacingDays ?? 1));
  const occupied = new Set(
    Array.from(params.occupiedDays)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= target)
  );
  const hasSpacingConflict = (candidate: number) => (
    Array.from(occupied).some((day) => Math.abs(day - candidate) < minimumSpacingDays)
  );

  for (let day = preferred; day <= target; day += 1) {
    if (!occupied.has(day) && !hasSpacingConflict(day)) return day;
  }

  for (let day = preferred - 1; day >= earliest; day -= 1) {
    if (!occupied.has(day) && !hasSpacingConflict(day)) return day;
  }

  return null;
}

export function generatedMilestoneSpacingDays(targetRampDays: number) {
  if (targetRampDays >= 45) return 3;
  if (targetRampDays >= 21) return 2;
  return 1;
}

export function pickNextActionableMilestone<T extends Pick<RampMilestone, 'id' | 'day_trigger'>>(
  milestones: T[],
  progressRows: ProgressLike[],
  deliveries: DeliveryLike[]
): T | null {
  const sorted = [...milestones].sort((a, b) => a.day_trigger - b.day_trigger);
  const progressByMilestone = new Map(
    progressRows.map((row) => [row.milestone_id, normalizeMilestoneProgressStatus(row.status)])
  );
  const deliveredIds = new Set(deliveries.flatMap((delivery) => (
    delivery.milestone_id ? [delivery.milestone_id] : []
  )));

  for (const milestone of sorted) {
    const status = progressByMilestone.get(milestone.id) ?? 'not_started';
    if (status === 'verified') continue;
    if (status === 'blocked' || status === 'needs_review') return null;
    if (deliveredIds.has(milestone.id) || status === 'briefed') return null;
    return milestone;
  }

  return null;
}

export function pickCurrentMilestoneForEvidenceScan<T extends Pick<RampMilestone, 'id' | 'day_trigger'>>(
  milestones: T[],
  progressRows: ProgressLike[],
  deliveries: DeliveryLike[]
): T | null {
  const sorted = [...milestones].sort((a, b) => a.day_trigger - b.day_trigger);
  const progressByMilestone = new Map(
    progressRows.map((row) => [row.milestone_id, normalizeMilestoneProgressStatus(row.status)])
  );
  const deliveredIds = new Set(deliveries.flatMap((delivery) => (
    delivery.milestone_id ? [delivery.milestone_id] : []
  )));

  for (const milestone of sorted) {
    const status = progressByMilestone.get(milestone.id) ?? 'not_started';
    if (status === 'verified') continue;
    if (status === 'blocked' || status === 'needs_review') return null;
    return status === 'briefed' || deliveredIds.has(milestone.id) ? milestone : null;
  }

  return null;
}
