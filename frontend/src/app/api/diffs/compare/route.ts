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

async function computeCanonicalDiffForOneSource(params: {
  source: DiffSourceInfo;
  window: { start: string; end: string };
  userId: string;
}): Promise<CanonicalDiff> {
  const { source, window, userId } = params;
  const input: RequestBody = {
    start_timestamp: window.start,
    end_timestamp: window.end,
    sources: [source.provider as 'jira' | 'github'],
    scope: 'org',
  };
  if (source.provider === 'github') {
    // display_name for github is "owner/repo"
    input.github_repos = [source.display_name];
  } else {
    const projectKey = source.display_name.startsWith('jira/') ? source.display_name.slice(5) : source.display_name;
    input.jira_project_key = projectKey;
  }
  return computeCanonicalDiff({ input, window, userId });
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

    try {
      console.log('[diffs/compare] baselineWindow', baselineWindow.start, '→', baselineWindow.end);
      for (const source of sources) {
        const primary = await computeCanonicalDiffForOneSource({
          source,
          window: primaryWindow,
          userId: user.id,
        });
        const baseline = await computeCanonicalDiffForOneSource({
          source,
          window: baselineWindow,
          userId: user.id,
        });
        console.log('[diffs/compare] baseline', source.display_name, 'tickets_moved=', baseline.tickets_moved, 'prs_merged=', baseline.prs_merged, 'commits_default=', baseline.commits_default);
        const delta = diffDelta(primary, baseline);
        by_source[source.display_name] = { primary, baseline, delta };

        // Aggregate
        primaryAgg.tickets_moved += primary.tickets_moved;
        primaryAgg.tickets_completed += primary.tickets_completed;
        primaryAgg.tickets_regressed += primary.tickets_regressed;
        primaryAgg.tickets_created += primary.tickets_created;
        primaryAgg.prs_opened += primary.prs_opened;
        primaryAgg.prs_merged += primary.prs_merged;
        primaryAgg.prs_closed += primary.prs_closed;
        primaryAgg.commits_default += primary.commits_default;
        const repoSet = new Set([...primaryAgg.repos_touched, ...primary.repos_touched]);
        primaryAgg.repos_touched = Array.from(repoSet);

        baselineAgg.tickets_moved += baseline.tickets_moved;
        baselineAgg.tickets_completed += baseline.tickets_completed;
        baselineAgg.tickets_regressed += baseline.tickets_regressed;
        baselineAgg.tickets_created += baseline.tickets_created;
        baselineAgg.prs_opened += baseline.prs_opened;
        baselineAgg.prs_merged += baseline.prs_merged;
        baselineAgg.prs_closed += baseline.prs_closed;
        baselineAgg.commits_default += baseline.commits_default;
        const baseRepos = new Set([...baselineAgg.repos_touched, ...baseline.repos_touched]);
        baselineAgg.repos_touched = Array.from(baseRepos);
      }
    } catch (err) {
      console.error('[diffs/compare] compute by-source error', err);
      return NextResponse.json(
        { error: 'Failed to compute diff', detail: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }

    const delta = diffDelta(primaryAgg, baselineAgg);
    const comparison: DiffComparisonWithSources = {
      primary: primaryAgg,
      baseline: baselineAgg,
      delta,
      by_source,
      sources,
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
