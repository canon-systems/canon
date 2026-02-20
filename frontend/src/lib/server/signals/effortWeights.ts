export const EFFORT_WEIGHTS = {
  prs_merged: 3,
  prs_opened: 2,
  tickets_completed: 2,
  tickets_regressed: 1,
  commits_default: 1,
} as const;

export type EffortCounts = Partial<Record<keyof typeof EFFORT_WEIGHTS, number>>;

export function computeWeightedEffort(counts: EffortCounts): number {
  return (Object.keys(EFFORT_WEIGHTS) as Array<keyof typeof EFFORT_WEIGHTS>).reduce((total, key) => {
    const weight = EFFORT_WEIGHTS[key];
    const count = Number(counts[key] || 0);
    if (!Number.isFinite(count)) return total;
    return total + count * weight;
  }, 0);
}
