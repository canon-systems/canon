// Shared diff contracts and helpers for Jira + GitHub timeboxed diffs.

export type DiffSource = 'jira' | 'github';
export type DiffScope = 'repo' | 'project' | 'org';

export type DiffInput = {
  start_timestamp: string;
  end_timestamp: string;
  sources: DiffSource[];
  scope: DiffScope;
  // Optional manual overrides; normally we compute baseline automatically.
  compare_start_timestamp?: string;
  compare_end_timestamp?: string;
};

export type CanonicalDiff = {
  window: { start: string; end: string };
  tickets_moved: number;
  tickets_completed: number;
  tickets_regressed: number;
  tickets_created: number;
  prs_opened: number;
  prs_merged: number;
  prs_closed: number;
  commits_default: number;
  repos_touched: string[];
};

export type DiffDelta = {
  tickets_moved: number;
  tickets_completed: number;
  tickets_regressed: number;
  tickets_created: number;
  prs_opened: number;
  prs_merged: number;
  prs_closed: number;
  commits_default: number;
  repos_added: string[];
  repos_removed: string[];
};

export type DiffComparison = {
  primary: CanonicalDiff;
  baseline: CanonicalDiff;
  delta: DiffDelta;
  metadata?: Record<string, unknown>;
};

/** Per-source breakdown when diff is run with source_ids */
export type DiffComparisonBySource = {
  primary: CanonicalDiff;
  baseline: CanonicalDiff;
  delta: DiffDelta;
};

export type DiffSourceInfo = {
  id: string;
  name: string;
  display_name: string; // e.g. "canon/repo1", "jira/PROJ"
  provider: string;
};

export type DiffComparisonWithSources = DiffComparison & {
  by_source?: Record<string, DiffComparisonBySource>;
  sources?: DiffSourceInfo[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Baseline = previous N full UTC calendar days. End baseline 1ms before primary
 * starts so the displayed end date is the last day of the baseline (e.g.
 * 1/30 → 1/30 for primary 1/31), not the first day of primary.
 */
export function computeBaselineWindow(start: string, end: string): { start: string; end: string } {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error('Invalid start/end timestamps');
  }
  const durationMs = endMs - startMs + 1;
  const numDays = Math.max(1, Math.round(durationMs / MS_PER_DAY));
  const baselineEndMs = startMs - 1;
  const baselineStartMs = startMs - numDays * MS_PER_DAY;
  return {
    start: new Date(baselineStartMs).toISOString(),
    end: new Date(baselineEndMs).toISOString(),
  };
}

export function emptyCanonicalDiff(window: { start: string; end: string }): CanonicalDiff {
  return {
    window,
    tickets_moved: 0,
    tickets_completed: 0,
    tickets_regressed: 0,
    tickets_created: 0,
    prs_opened: 0,
    prs_merged: 0,
    prs_closed: 0,
    commits_default: 0,
    repos_touched: [],
  };
}

export function diffDelta(primary: CanonicalDiff, baseline: CanonicalDiff): DiffDelta {
  const reposPrimary = new Set(primary.repos_touched);
  const reposBaseline = new Set(baseline.repos_touched);
  const repos_added: string[] = [];
  const repos_removed: string[] = [];

  for (const r of reposPrimary) {
    if (!reposBaseline.has(r)) repos_added.push(r);
  }
  for (const r of reposBaseline) {
    if (!reposPrimary.has(r)) repos_removed.push(r);
  }

  return {
    tickets_moved: primary.tickets_moved - baseline.tickets_moved,
    tickets_completed: primary.tickets_completed - baseline.tickets_completed,
    tickets_regressed: primary.tickets_regressed - baseline.tickets_regressed,
    tickets_created: primary.tickets_created - baseline.tickets_created,
    prs_opened: primary.prs_opened - baseline.prs_opened,
    prs_merged: primary.prs_merged - baseline.prs_merged,
    prs_closed: primary.prs_closed - baseline.prs_closed,
    commits_default: primary.commits_default - baseline.commits_default,
    repos_added,
    repos_removed,
  };
}
