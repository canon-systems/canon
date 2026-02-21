import type { CanonicalDiff, DiffSourceInfo } from '@/lib/server/diff/contracts';
import { emptyCanonicalDiff } from '@/lib/server/diff/contracts';
import { computeCanonicalDiffFromEvents } from '@/lib/server/diff/aggregateFromEvents';
import type { SupabaseClient } from '@supabase/supabase-js';

function resolveSourceIdsToTargets(
  rows: Array<{ id: string; name: string; provider: string; scope: Record<string, unknown> | null }>
): DiffSourceInfo[] {
  const out: DiffSourceInfo[] = [];
  for (const row of rows) {
    const provider = (row.provider || '').toLowerCase();
    if (provider !== 'github' && provider !== 'jira') continue;
    const scope = row.scope || {};
    let display_name: string;
    if (provider === 'github') {
      const repo = typeof scope.repo === 'string' ? scope.repo : row.name;
      display_name = repo || row.name;
    } else {
      const project = typeof scope.project === 'string' ? scope.project : row.name;
      display_name = project ? `jira/${project}` : row.name;
    }
    out.push({ id: row.id, name: row.name, display_name, provider });
  }
  return out;
}

function hasJiraTicketActivity(diff: CanonicalDiff): boolean {
  return diff.tickets_moved + diff.tickets_completed + diff.tickets_regressed + diff.tickets_created > 0;
}

function jiraWorkspaceLabel(source: DiffSourceInfo): string {
  const displayName = source.display_name.trim();
  if (displayName.toLowerCase().startsWith('jira/')) {
    const project = displayName.slice(5).trim();
    if (project) return `Jira:${project}`;
  }
  const name = source.name.trim();
  if (name) return `Jira:${name}`;
  return 'Jira';
}

function addJiraWorkspaceTouch(diff: CanonicalDiff, source: DiffSourceInfo): void {
  if (source.provider !== 'jira') return;
  if (!hasJiraTicketActivity(diff)) return;
  const workspace = jiraWorkspaceLabel(source);
  if (!diff.repos_touched.includes(workspace)) {
    diff.repos_touched = [...diff.repos_touched, workspace];
  }
}

/**
 * Run diff for the given user, source IDs, and time window. Returns aggregated CanonicalDiff.
 * Used by the report schedule runner and can be used by API routes.
 */
export async function runDiffForSources(
  userId: string,
  sourceIds: string[],
  window: { start: string; end: string },
  supabase: SupabaseClient
): Promise<CanonicalDiff> {
  const { aggregate } = await runDiffForSourcesWithBreakdown(userId, sourceIds, window, supabase);
  return aggregate;
}

export type DiffAggWithBreakdown = {
  aggregate: CanonicalDiff;
  bySource: Record<string, CanonicalDiff>;
  sources: DiffSourceInfo[];
};

/**
 * Run diff for the given sources and return both the aggregate and per-source breakdowns.
 */
export async function runDiffForSourcesWithBreakdown(
  userId: string,
  sourceIds: string[],
  window: { start: string; end: string },
  supabase: SupabaseClient
): Promise<DiffAggWithBreakdown> {
  if (sourceIds.length === 0) {
    return { aggregate: emptyCanonicalDiff(window), bySource: {}, sources: [] };
  }

  const { data: sourceRows, error } = await supabase
    .from('workspace_sources')
    .select('id, name, provider, scope')
    .eq('user_id', userId)
    .in('id', sourceIds);

  if (error || !sourceRows?.length) {
    return { aggregate: emptyCanonicalDiff(window), bySource: {}, sources: [] };
  }

  const sources = resolveSourceIdsToTargets(
    sourceRows as Array<{ id: string; name: string; provider: string; scope: Record<string, unknown> | null }>
  );
  if (sources.length === 0) {
    return { aggregate: emptyCanonicalDiff(window), bySource: {}, sources: [] };
  }

  const sourceIdSet = new Set(sources.map((source) => source.id));
  const eventAgg = await computeCanonicalDiffFromEvents({
    supabase,
    sourceIds: Array.from(sourceIdSet),
    window,
  });
  if (!eventAgg.hasRows) {
    return { aggregate: emptyCanonicalDiff(window), bySource: {}, sources };
  }

  const aggregate = eventAgg.agg;
  const bySource = eventAgg.bySource;

  const aggregateRepos = new Set(aggregate.repos_touched);
  for (const source of sources) {
    const sourceDiff = bySource[source.id];
    if (!sourceDiff) continue;
    addJiraWorkspaceTouch(sourceDiff, source);
    for (const repo of sourceDiff.repos_touched) {
      aggregateRepos.add(repo);
    }
  }
  aggregate.repos_touched = Array.from(aggregateRepos);

  return { aggregate, bySource, sources };
}
