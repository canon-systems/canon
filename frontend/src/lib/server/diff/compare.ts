import {
  CanonicalDiff,
  DiffComparisonWithSources,
  DiffDelta,
  DiffSourceInfo,
  computeBaselineWindow,
  diffDelta,
  emptyCanonicalDiff,
} from '@/lib/server/diff/contracts';
import { computeCanonicalDiffFromEvents } from '@/lib/server/diff/aggregateFromEvents';
import { createClient } from '@/lib/supabase/server';

export type DiffDetails = {
  jira: {
    moved: Array<{
      issue_key: string | null;
      summary: string | null;
      space: string | null;
      from: string | null;
      to: string | null;
      occurred_at: string | null;
    }>;
    completed: Array<{
      issue_key: string | null;
      summary: string | null;
      space: string | null;
      status: string | null;
      occurred_at: string | null;
    }>;
    regressed: Array<{
      issue_key: string | null;
      summary: string | null;
      space: string | null;
      status: string | null;
      occurred_at: string | null;
    }>;
    created: Array<{
      issue_key: string | null;
      summary: string | null;
      space: string | null;
      status: string | null;
      occurred_at: string | null;
    }>;
  };
  github: {
    commits: Array<{ sha: string | null; repo: string | null; message: string | null; occurred_at: string | null }>;
    prs_opened: Array<{
      number: string | null;
      repo: string | null;
      title: string | null;
      from: string | null;
      to: string | null;
      status: string | null;
      occurred_at: string | null;
    }>;
    prs_merged: Array<{
      number: string | null;
      repo: string | null;
      title: string | null;
      from: string | null;
      to: string | null;
      status: string | null;
      occurred_at: string | null;
    }>;
    prs_closed: Array<{
      number: string | null;
      repo: string | null;
      title: string | null;
      from: string | null;
      to: string | null;
      status: string | null;
      occurred_at: string | null;
    }>;
  };
};

type CanonicalEventRow = {
  source_id?: string | null;
  provider?: string | null;
  event_kind?: string | null;
  occurred_at?: string | null;
  entity_id?: string | null;
  source_full_name?: string | null;
  metadata?: Record<string, unknown> | null;
};

type SourceIssueSummaryMap = Map<string, string>;

export type WorkspaceSourceRow = {
  id: string;
  name: string;
  provider: string;
  scope: Record<string, unknown> | null;
};

export type ComputeDiffComparisonInput = {
  userId: string;
  sourceIds: string[];
  startTimestamp: string;
  endTimestamp: string;
  compareStartTimestamp?: string;
  compareEndTimestamp?: string;
  sourceRows?: WorkspaceSourceRow[];
};

export type CompareResponse = DiffComparisonWithSources & { details?: DiffDetails | null };

export class DiffCompareInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiffCompareInputError';
  }
}

function emptyDetails(): DiffDetails {
  return {
    jira: { moved: [], completed: [], regressed: [], created: [] },
    github: { commits: [], prs_opened: [], prs_merged: [], prs_closed: [] },
  };
}

function coerceString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return null;
}

function sourceIssueKey(sourceId: string | null | undefined, issueKey: string | null | undefined): string | null {
  const normalizedIssueKey = typeof issueKey === 'string' && issueKey.trim().length > 0 ? issueKey.trim() : null;
  if (!normalizedIssueKey) return null;
  const normalizedSourceId = typeof sourceId === 'string' && sourceId.trim().length > 0 ? sourceId.trim() : null;
  return `${normalizedSourceId || '*'}::${normalizedIssueKey}`;
}

function resolveIssueValue(
  map: Map<string, string> | undefined,
  sourceId: string | null | undefined,
  issueKey: string | null | undefined
): string | null {
  if (!map) return null;
  const sourceScopedKey = sourceIssueKey(sourceId, issueKey);
  if (sourceScopedKey) {
    const exact = map.get(sourceScopedKey);
    if (exact) return exact;
  }
  const fallbackKey = sourceIssueKey('*', issueKey);
  if (!fallbackKey) return null;
  return map.get(fallbackKey) || null;
}

function buildDetails(
  rows: CanonicalEventRow[] | null | undefined,
  jiraSummaryMap?: SourceIssueSummaryMap
): DiffDetails {
  const details = emptyDetails();
  if (!rows || rows.length === 0) return details;

  for (const row of rows) {
    const sourceId = row.source_id ?? null;
    const provider = (row.provider || '').toLowerCase();
    const kind = row.event_kind || '';
    const occurred_at = row.occurred_at ?? null;
    const entityId = row.entity_id ?? null;
    const repo = row.source_full_name ?? null;
    const metadata = row.metadata || {};
    const summary =
      coerceString((metadata as Record<string, unknown>).summary) ||
      coerceString((metadata as Record<string, unknown>).title) ||
      coerceString((metadata as Record<string, unknown>).name) ||
      coerceString((metadata as Record<string, unknown>).toString) ||
      resolveIssueValue(jiraSummaryMap, sourceId, entityId);

    if (provider === 'jira') {
      if (kind === 'ticket_moved') {
        details.jira.moved.push({
          issue_key: entityId,
          summary,
          space: repo,
          from: coerceString(metadata.from),
          to: coerceString(metadata.to),
          occurred_at,
        });
      } else if (kind === 'ticket_completed') {
        details.jira.completed.push({
          issue_key: entityId,
          summary,
          space: repo,
          status: coerceString(metadata.status),
          occurred_at,
        });
      } else if (kind === 'ticket_regressed') {
        details.jira.regressed.push({
          issue_key: entityId,
          summary,
          space: repo,
          status: coerceString(metadata.status),
          occurred_at,
        });
      } else if (kind === 'ticket_created') {
        details.jira.created.push({
          issue_key: entityId,
          summary,
          space: repo,
          status: coerceString(metadata.status),
          occurred_at,
        });
      }
      continue;
    }

    if (provider === 'github') {
      if (kind === 'commit') {
        details.github.commits.push({
          sha: entityId,
          repo,
          message: coerceString(metadata.message) || summary,
          occurred_at,
        });
      } else if (kind === 'pr_opened') {
        details.github.prs_opened.push({
          number: entityId,
          repo,
          title: summary,
          from: coerceString(metadata.from),
          to: coerceString(metadata.to),
          status: coerceString(metadata.status),
          occurred_at,
        });
      } else if (kind === 'pr_merged') {
        details.github.prs_merged.push({
          number: entityId,
          repo,
          title: summary,
          from: coerceString(metadata.from),
          to: coerceString(metadata.to),
          status: coerceString(metadata.status),
          occurred_at,
        });
      } else if (kind === 'pr_closed') {
        details.github.prs_closed.push({
          number: entityId,
          repo,
          title: summary,
          from: coerceString(metadata.from),
          to: coerceString(metadata.to),
          status: coerceString(metadata.status),
          occurred_at,
        });
      }
    }
  }

  return details;
}

function buildJiraSummaryMap(
  rows: Array<{ source_id?: string | null; payload?: Record<string, unknown> | null }>
): SourceIssueSummaryMap {
  const map: SourceIssueSummaryMap = new Map();
  for (const row of rows) {
    const sourceId = typeof row.source_id === 'string' ? row.source_id : null;
    const payload = row.payload || {};
    const issue = (payload as { issue?: { key?: string; fields?: { summary?: unknown } } }).issue;
    const key = typeof issue?.key === 'string' ? issue.key : null;
    const summary = typeof issue?.fields?.summary === 'string' ? issue.fields.summary : null;
    const scopedKey = sourceIssueKey(sourceId, key);
    if (scopedKey && summary && !map.has(scopedKey)) {
      map.set(scopedKey, summary);
    }
    const unscopedKey = sourceIssueKey('*', key);
    if (unscopedKey && summary && !map.has(unscopedKey)) {
      map.set(unscopedKey, summary);
    }
  }
  return map;
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

function resolveSourceIdsToTargets(rows: WorkspaceSourceRow[]): DiffSourceInfo[] {
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

function enrichAggregateReposFromSources(params: {
  aggregate: CanonicalDiff;
  bySource: Record<string, CanonicalDiff>;
  sources: DiffSourceInfo[];
}): void {
  const { aggregate, bySource, sources } = params;
  const repos = new Set(aggregate.repos_touched);
  for (const source of sources) {
    const sourceDiff = bySource[source.id];
    if (!sourceDiff) continue;
    addJiraWorkspaceTouch(sourceDiff, source);
    for (const repo of sourceDiff.repos_touched) {
      repos.add(repo);
    }
  }
  aggregate.repos_touched = Array.from(repos);
}

export async function computeDiffComparison(input: ComputeDiffComparisonInput): Promise<CompareResponse> {
  if (!Array.isArray(input.sourceIds) || input.sourceIds.length === 0) {
    throw new DiffCompareInputError('No connected sources found for the given source_ids');
  }

  const primaryWindow = { start: input.startTimestamp, end: input.endTimestamp };
  const baselineWindow =
    input.compareStartTimestamp && input.compareEndTimestamp
      ? { start: input.compareStartTimestamp, end: input.compareEndTimestamp }
      : computeBaselineWindow(primaryWindow.start, primaryWindow.end);

  const userSupabase = await createClient();
  const selectedSourceIds = new Set(input.sourceIds);

  let sourceRows: WorkspaceSourceRow[];
  if (input.sourceRows) {
    sourceRows = input.sourceRows.filter((row) => selectedSourceIds.has(row.id));
  } else {
    const { data, error } = await userSupabase
      .from('workspace_sources')
      .select('id, name, provider, scope')
      .eq('user_id', input.userId)
      .in('id', input.sourceIds);

    if (error || !data?.length) {
      throw new DiffCompareInputError('No connected sources found for the given source_ids');
    }
    sourceRows = data as WorkspaceSourceRow[];
  }

  const sources = resolveSourceIdsToTargets(sourceRows);
  if (sources.length === 0) {
    throw new DiffCompareInputError('No sources in selection');
  }

  const by_source: Record<string, { primary: CanonicalDiff; baseline: CanonicalDiff; delta: DiffDelta }> = {};
  const primaryAgg: CanonicalDiff = emptyCanonicalDiff(primaryWindow);
  const baselineAgg: CanonicalDiff = emptyCanonicalDiff(baselineWindow);

  const sourceIds = sources.map((source) => source.id);
  const { data: detailRows } = await userSupabase
    .from('diff_event_canonical')
    .select('source_id, provider, event_kind, occurred_at, entity_id, source_full_name, metadata')
    .in('source_id', sourceIds)
    .gte('occurred_at', primaryWindow.start)
    .lte('occurred_at', primaryWindow.end)
    .order('occurred_at', { ascending: false });

  let jiraSummaryMap: SourceIssueSummaryMap | undefined;
  const jiraEventRows = (detailRows || []).filter(
    (row) => (row as CanonicalEventRow).provider === 'jira' && typeof (row as CanonicalEventRow).entity_id === 'string'
  ) as CanonicalEventRow[];

  if (jiraEventRows.length > 0) {
    const jiraSourceIds = Array.from(
      new Set(
        jiraEventRows
          .map((row) => (typeof row.source_id === 'string' ? row.source_id : null))
          .filter((sourceId): sourceId is string => Boolean(sourceId))
      )
    );
    const { data: rawRows } = await userSupabase
      .from('diff_event_raw')
      .select('source_id, payload')
      .in('source_id', jiraSourceIds)
      .eq('provider', 'jira')
      .gte('event_time', primaryWindow.start)
      .lte('event_time', primaryWindow.end);
    jiraSummaryMap = buildJiraSummaryMap(
      (rawRows || []) as Array<{ source_id?: string | null; payload?: Record<string, unknown> | null }>
    );
  }

  const details = buildDetails(detailRows as CanonicalEventRow[], jiraSummaryMap);

  const primaryEvents = await computeCanonicalDiffFromEvents({
    supabase: userSupabase,
    sourceIds,
    window: primaryWindow,
  });
  const baselineEvents = await computeCanonicalDiffFromEvents({
    supabase: userSupabase,
    sourceIds,
    window: baselineWindow,
  });

  if (primaryEvents.hasRows || baselineEvents.hasRows) {
    for (const source of sources) {
      const primary = primaryEvents.bySource[source.id] ?? emptyCanonicalDiff(primaryWindow);
      const baseline = baselineEvents.bySource[source.id] ?? emptyCanonicalDiff(baselineWindow);
      addJiraWorkspaceTouch(primary, source);
      addJiraWorkspaceTouch(baseline, source);
      const delta = diffDelta(primary, baseline);
      by_source[source.display_name] = { primary, baseline, delta };
    }

    Object.assign(primaryAgg, primaryEvents.agg);
    Object.assign(baselineAgg, baselineEvents.agg);
    enrichAggregateReposFromSources({
      aggregate: primaryAgg,
      bySource: primaryEvents.bySource,
      sources,
    });
    enrichAggregateReposFromSources({
      aggregate: baselineAgg,
      bySource: baselineEvents.bySource,
      sources,
    });
  }

  const delta = diffDelta(primaryAgg, baselineAgg);
  return {
    primary: primaryAgg,
    baseline: baselineAgg,
    delta,
    by_source,
    sources,
    details,
    metadata: {
      source_ids: input.sourceIds,
      baseline_strategy: input.compareStartTimestamp ? 'manual' : 'auto_previous_window',
    },
  };
}
