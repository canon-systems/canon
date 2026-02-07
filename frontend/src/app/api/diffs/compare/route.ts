import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  CanonicalDiff,
  DiffComparison,
  DiffComparisonWithSources,
  DiffDelta,
  DiffInput,
  DiffSourceInfo,
  computeBaselineWindow,
  emptyCanonicalDiff,
  diffDelta,
} from '@/lib/server/diff/contracts';
import { buildCanonDiff } from '@/lib/server/diff/canon';
import { getGitHubDiffForRepo, type GitHubDiffEvent } from '@/lib/server/diff/githubDiff';
import { getJiraDiffForProject } from '@/lib/server/diff/jiraDiff';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type RequestBody = DiffInput & {
  jira_project_key?: string;
  github_repos?: string[]; // ["owner/repo"]
  source_ids?: string[]; // workspace_sources.id — when set, use connected sources only
};

type DiffDetails = {
  jira: {
    moved: Array<{ issue_key: string | null; summary: string | null; from: string | null; to: string | null; occurred_at: string | null }>;
    completed: Array<{ issue_key: string | null; summary: string | null; status: string | null; occurred_at: string | null }>;
    regressed: Array<{ issue_key: string | null; summary: string | null; status: string | null; occurred_at: string | null }>;
    created: Array<{ issue_key: string | null; summary: string | null; status: string | null; occurred_at: string | null }>;
  };
  github: {
    commits: Array<{ sha: string | null; repo: string | null; occurred_at: string | null }>;
    prs_opened: Array<{ number: string | null; repo: string | null; occurred_at: string | null }>;
    prs_merged: Array<{ number: string | null; repo: string | null; occurred_at: string | null }>;
    prs_closed: Array<{ number: string | null; repo: string | null; occurred_at: string | null }>;
  };
};

type CanonicalEventRow = {
  provider?: string | null;
  event_kind?: string | null;
  occurred_at?: string | null;
  entity_id?: string | null;
  repo_full_name?: string | null;
  metadata?: Record<string, unknown> | null;
};

type JiraSummaryMap = Map<string, string>;

const DETAIL_LIMIT = 12;

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

function buildDetails(rows: CanonicalEventRow[] | null | undefined, jiraSummaryMap?: JiraSummaryMap): DiffDetails {
  const details = emptyDetails();
  if (!rows || rows.length === 0) return details;

  for (const row of rows) {
    const provider = (row.provider || '').toLowerCase();
    const kind = row.event_kind || '';
    const occurred_at = row.occurred_at ?? null;
    const entityId = row.entity_id ?? null;
    const repo = row.repo_full_name ?? null;
    const metadata = row.metadata || {};
    const summary =
      coerceString((metadata as Record<string, unknown>).summary) ||
      coerceString((metadata as Record<string, unknown>).title) ||
      coerceString((metadata as Record<string, unknown>).name) ||
      coerceString((metadata as Record<string, unknown>).toString) ||
      (entityId && jiraSummaryMap ? jiraSummaryMap.get(entityId) || null : null);

    if (provider === 'jira') {
      if (kind === 'ticket_moved' && details.jira.moved.length < DETAIL_LIMIT) {
        details.jira.moved.push({
          issue_key: entityId,
          summary,
          from: coerceString(metadata.from),
          to: coerceString(metadata.to),
          occurred_at,
        });
      } else if (kind === 'ticket_completed' && details.jira.completed.length < DETAIL_LIMIT) {
        details.jira.completed.push({
          issue_key: entityId,
          summary,
          status: coerceString(metadata.status),
          occurred_at,
        });
      } else if (kind === 'ticket_regressed' && details.jira.regressed.length < DETAIL_LIMIT) {
        details.jira.regressed.push({
          issue_key: entityId,
          summary,
          status: coerceString(metadata.status),
          occurred_at,
        });
      } else if (kind === 'ticket_created' && details.jira.created.length < DETAIL_LIMIT) {
        details.jira.created.push({
          issue_key: entityId,
          summary,
          status: coerceString(metadata.status),
          occurred_at,
        });
      }
      continue;
    }

    if (provider === 'github') {
      if (kind === 'commit' && details.github.commits.length < DETAIL_LIMIT) {
        details.github.commits.push({
          sha: entityId,
          repo,
          occurred_at,
        });
      } else if (kind === 'pr_opened' && details.github.prs_opened.length < DETAIL_LIMIT) {
        details.github.prs_opened.push({
          number: entityId,
          repo,
          occurred_at,
        });
      } else if (kind === 'pr_merged' && details.github.prs_merged.length < DETAIL_LIMIT) {
        details.github.prs_merged.push({
          number: entityId,
          repo,
          occurred_at,
        });
      } else if (kind === 'pr_closed' && details.github.prs_closed.length < DETAIL_LIMIT) {
        details.github.prs_closed.push({
          number: entityId,
          repo,
          occurred_at,
        });
      }
    }
  }

  return details;
}

function buildJiraSummaryMap(rows: Array<{ payload?: Record<string, unknown> | null }>): JiraSummaryMap {
  const map: JiraSummaryMap = new Map();
  for (const row of rows) {
    const payload = row.payload || {};
    const issue = (payload as { issue?: { key?: string; fields?: { summary?: unknown } } }).issue;
    const key = typeof issue?.key === 'string' ? issue.key : null;
    const summary = typeof issue?.fields?.summary === 'string' ? issue.fields.summary : null;
    if (key && summary && !map.has(key)) {
      map.set(key, summary);
    }
  }
  return map;
}

function validateInput(body: Record<string, unknown> | null): { ok: boolean; value?: RequestBody; error?: string } {
  const { start_timestamp, end_timestamp, sources, scope, compare_start_timestamp, compare_end_timestamp, jira_project_key, github_repos, source_ids } = body || {};
  if (typeof start_timestamp !== 'string' || typeof end_timestamp !== 'string' || !start_timestamp || !end_timestamp) {
    return { ok: false, error: 'start_timestamp and end_timestamp are required' };
  }
  const scopeValue = scope === 'repo' || scope === 'project' || scope === 'org' ? scope : 'org';
  const sourceList =
    Array.isArray(sources) && sources.length
      ? sources.filter((s) => s === 'jira' || s === 'github')
      : (['jira', 'github'] as DiffInput['sources']);
  const hasSourceIds = Array.isArray(source_ids) && source_ids.length > 0;
  if (!sourceList.length && !hasSourceIds) return { ok: false, error: 'sources must include jira and/or github, or provide source_ids' };

  return {
    ok: true,
    value: {
      start_timestamp,
      end_timestamp,
      sources: sourceList,
      scope: scopeValue,
      compare_start_timestamp: typeof compare_start_timestamp === 'string' ? compare_start_timestamp : undefined,
      compare_end_timestamp: typeof compare_end_timestamp === 'string' ? compare_end_timestamp : undefined,
      jira_project_key: typeof jira_project_key === 'string' ? jira_project_key : undefined,
      github_repos: Array.isArray(github_repos) ? github_repos.filter((r) => typeof r === 'string') : undefined,
      source_ids: Array.isArray(source_ids) ? source_ids.filter((id) => typeof id === 'string') : undefined,
    },
  };
}

type CanonDiffWithCommits = ReturnType<typeof buildCanonDiff> & { commits_default?: number };

function canonToCounts(diff: CanonDiffWithCommits): CanonicalDiff {
  const window = { start: diff.start, end: diff.end };
  const repos = new Set(diff.repos_touched);
  const commitsDefault = diff.commits_default ?? 0;

  return {
    window,
    tickets_moved: diff.tickets_moved.length,
    tickets_completed: diff.tickets_completed.length,
    tickets_regressed: diff.tickets_regressed.length,
    tickets_created: diff.tickets_new.length,
    prs_opened: diff.prs_opened.length,
    prs_merged: diff.prs_merged.length,
    prs_closed: diff.prs_closed_unmerged.length,
    commits_default: commitsDefault,
    repos_touched: Array.from(repos),
  };
}

function toUtcDay(value: string): string | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

function mergeRepos(base: string[], extra: unknown): string[] {
  const repos = new Set(base);
  if (Array.isArray(extra)) {
    for (const r of extra) {
      if (typeof r === 'string' && r.trim().length > 0) repos.add(r);
    }
  }
  return Array.from(repos);
}

function addRollupToDiff(diff: CanonicalDiff, row: Record<string, unknown>) {
  diff.tickets_moved += Number(row.tickets_moved ?? 0);
  diff.tickets_completed += Number(row.tickets_completed ?? 0);
  diff.tickets_regressed += Number(row.tickets_regressed ?? 0);
  diff.tickets_created += Number(row.tickets_created ?? 0);
  diff.prs_opened += Number(row.prs_opened ?? 0);
  diff.prs_merged += Number(row.prs_merged ?? 0);
  diff.prs_closed += Number(row.prs_closed ?? 0);
  diff.commits_default += Number(row.commits_default ?? 0);
  diff.repos_touched = mergeRepos(diff.repos_touched, row.repos_touched);
}

async function computeCanonicalDiffFromRollups(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  sourceIds: string[];
  window: { start: string; end: string };
}): Promise<{ agg: CanonicalDiff; bySource: Record<string, CanonicalDiff>; hasRows: boolean }> {
  const { supabase, sourceIds, window } = params;
  const startDay = toUtcDay(window.start);
  const endDay = toUtcDay(window.end);
  const agg = emptyCanonicalDiff(window);
  const bySource: Record<string, CanonicalDiff> = {};

  if (!startDay || !endDay || sourceIds.length === 0) {
    return { agg, bySource, hasRows: false };
  }

  const { data: rows, error } = await supabase
    .from('diff_daily_metrics')
    .select('source_id, day, prs_opened, prs_merged, prs_closed, commits_default, tickets_moved, tickets_completed, tickets_regressed, tickets_created, repos_touched')
    .in('source_id', sourceIds)
    .gte('day', startDay)
    .lte('day', endDay);

  if (error || !rows?.length) {
    return { agg, bySource, hasRows: false };
  }

  for (const row of rows) {
    const sourceId = String(row.source_id);
    if (!bySource[sourceId]) {
      bySource[sourceId] = emptyCanonicalDiff(window);
    }
    addRollupToDiff(bySource[sourceId], row as Record<string, unknown>);
    addRollupToDiff(agg, row as Record<string, unknown>);
  }

  return { agg, bySource, hasRows: true };
}

async function computeCanonicalDiff(params: {
  input: RequestBody;
  window: { start: string; end: string };
  userId: string;
}): Promise<CanonicalDiff> {
  const { input, window } = params;
  const useJira = input.sources.includes('jira') && input.jira_project_key;
  const useGitHub = input.sources.includes('github') && Array.isArray(input.github_repos) && input.github_repos.length > 0;

  let jiraResult = undefined;
  if (useJira) {
    jiraResult = await getJiraDiffForProject({
      userId: params.userId,
      projectKey: input.jira_project_key,
      start: window.start,
      end: window.end,
    });
  }

  const githubEvents: Awaited<ReturnType<typeof getGitHubDiffForRepo>>[] = [];
  if (useGitHub) {
    for (const repo of input.github_repos!) {
      const [owner, name] = repo.split('/');
      if (!owner || !name) continue;
      const res = await getGitHubDiffForRepo({ owner, repo: name, start: window.start, end: window.end });
      githubEvents.push(res);
    }
  }

  const combinedGithub = githubEvents.length
    ? githubEvents.reduce(
        (acc, cur) => ({
          repo: '',
          start: window.start,
          end: window.end,
          prs_opened: [...acc.prs_opened, ...cur.prs_opened],
          prs_merged: [...acc.prs_merged, ...cur.prs_merged],
          prs_closed_unmerged: [...acc.prs_closed_unmerged, ...cur.prs_closed_unmerged],
          commits: [...acc.commits, ...cur.commits],
        }),
        {
          repo: '',
          start: window.start,
          end: window.end,
          prs_opened: [] as GitHubDiffEvent[],
          prs_merged: [] as GitHubDiffEvent[],
          prs_closed_unmerged: [] as GitHubDiffEvent[],
          commits: [] as GitHubDiffEvent[],
        }
      )
    : undefined;

  const canon = buildCanonDiff({
    start: window.start,
    end: window.end,
    github: combinedGithub,
    jira: jiraResult,
  });

  // Add commit count to match CanonicalDiff shape
  const commitsCount = combinedGithub ? combinedGithub.commits.length : 0;
  const canonWithCommits: CanonDiffWithCommits = { ...canon, commits_default: commitsCount };

  return canonToCounts(canonWithCommits);
}

/** Resolve workspace_sources to diff targets (display_name + scope for API). */
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

export async function POST(req: NextRequest) {
  const { user } = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const validation = validateInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const input = validation.value!;
  const primaryWindow = { start: input.start_timestamp, end: input.end_timestamp };
  const baselineWindow =
    input.compare_start_timestamp && input.compare_end_timestamp
      ? { start: input.compare_start_timestamp, end: input.compare_end_timestamp }
      : computeBaselineWindow(primaryWindow.start, primaryWindow.end);

  const useSourceIds = Array.isArray(input.source_ids) && input.source_ids.length > 0;

  if (useSourceIds) {
    // Resolve connected sources and compute per-source + aggregated diff
    const userSupabase = await createClient();
    const { data: sourceRows, error: srcErr } = await userSupabase
      .from('workspace_sources')
      .select('id, name, provider, scope')
      .eq('user_id', user.id)
      .in('id', input.source_ids!);

    if (srcErr || !sourceRows?.length) {
      return NextResponse.json(
        { error: 'No connected sources found for the given source_ids' },
        { status: 400 }
      );
    }

    const sources = resolveSourceIdsToTargets(
      sourceRows as Array<{ id: string; name: string; provider: string; scope: Record<string, unknown> | null }>
    );
    if (sources.length === 0) {
      return NextResponse.json(
        { error: 'No jira or github sources in selection' },
        { status: 400 }
      );
    }

    const by_source: Record<string, { primary: CanonicalDiff; baseline: CanonicalDiff; delta: DiffDelta }> = {};
    const primaryAgg: CanonicalDiff = emptyCanonicalDiff(primaryWindow);
    const baselineAgg: CanonicalDiff = emptyCanonicalDiff(baselineWindow);
    let details: DiffDetails | null = null;

    try {
      const sourceIds = sources.map((s) => s.id);
      const { data: detailRows } = await userSupabase
        .from('diff_event_canonical')
        .select('provider, event_kind, occurred_at, entity_id, repo_full_name, metadata')
        .in('source_id', sourceIds)
        .gte('occurred_at', primaryWindow.start)
        .lte('occurred_at', primaryWindow.end)
        .order('occurred_at', { ascending: false })
        .limit(200);

      let jiraSummaryMap: JiraSummaryMap | undefined;
      if ((detailRows || []).some((row) => (row as CanonicalEventRow).provider === 'jira')) {
        const { data: rawRows } = await userSupabase
          .from('diff_event_raw')
          .select('payload')
          .in('source_id', sourceIds)
          .eq('provider', 'jira')
          .gte('event_time', primaryWindow.start)
          .lte('event_time', primaryWindow.end)
          .limit(400);
        jiraSummaryMap = buildJiraSummaryMap((rawRows || []) as Array<{ payload?: Record<string, unknown> | null }>);
      }

      details = buildDetails(detailRows as CanonicalEventRow[], jiraSummaryMap);

      const primaryRollups = await computeCanonicalDiffFromRollups({
        supabase: userSupabase,
        sourceIds,
        window: primaryWindow,
      });
      const baselineRollups = await computeCanonicalDiffFromRollups({
        supabase: userSupabase,
        sourceIds,
        window: baselineWindow,
      });

      if (primaryRollups.hasRows || baselineRollups.hasRows) {
        for (const source of sources) {
          const primary = primaryRollups.bySource[source.id] ?? emptyCanonicalDiff(primaryWindow);
          const baseline = baselineRollups.bySource[source.id] ?? emptyCanonicalDiff(baselineWindow);
          const delta = diffDelta(primary, baseline);
          by_source[source.display_name] = { primary, baseline, delta };
        }

        Object.assign(primaryAgg, primaryRollups.agg);
        Object.assign(baselineAgg, baselineRollups.agg);
      }
    } catch (err) {
      console.error('[diffs/compare] compute by-source error', err);
      return NextResponse.json(
        { error: 'Failed to compute diff', detail: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }

    const delta = diffDelta(primaryAgg, baselineAgg);
    const comparison: DiffComparisonWithSources & { details?: DiffDetails | null } = {
      primary: primaryAgg,
      baseline: baselineAgg,
      delta,
      by_source,
      sources,
      details,
      metadata: {
        source_ids: input.source_ids,
        baseline_strategy: input.compare_start_timestamp ? 'manual' : 'auto_previous_window',
      },
    };
    return NextResponse.json(comparison);
  }

  // Original path: no source_ids, use jira_project_key / github_repos
  let primaryDiff: CanonicalDiff = emptyCanonicalDiff(primaryWindow);
  let baselineDiff: CanonicalDiff = emptyCanonicalDiff(baselineWindow);

  try {
    primaryDiff = await computeCanonicalDiff({ input, window: primaryWindow, userId: user.id });
    baselineDiff = await computeCanonicalDiff({ input, window: baselineWindow, userId: user.id });
  } catch (err) {
    console.error('[diffs/compare] compute error', err);
    return NextResponse.json({ error: 'Failed to compute diff', detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const delta = diffDelta(primaryDiff, baselineDiff);
  const comparison: DiffComparison = {
    primary: primaryDiff,
    baseline: baselineDiff,
    delta,
    metadata: {
      sources: input.sources,
      scope: input.scope,
      baseline_strategy: input.compare_start_timestamp ? 'manual' : 'auto_previous_window',
    },
  };
  return NextResponse.json(comparison);
}
