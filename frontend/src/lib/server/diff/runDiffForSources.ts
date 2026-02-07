import type { CanonicalDiff, DiffSourceInfo } from '@/lib/server/diff/contracts';
import { emptyCanonicalDiff } from '@/lib/server/diff/contracts';
import { buildCanonDiff } from '@/lib/server/diff/canon';
import type { GitHubDiffEvent } from '@/lib/server/diff/githubDiff';
import { getGitHubDiffForRepo } from '@/lib/server/diff/githubDiff';
import { getJiraDiffForProject } from '@/lib/server/diff/jiraDiff';
import type { SupabaseClient } from '@supabase/supabase-js';

type CanonDiffWithCommits = ReturnType<typeof buildCanonDiff> & { commits_default?: number };

type DiffInputForSource = {
  start_timestamp: string;
  end_timestamp: string;
  sources: ('jira' | 'github')[];
  scope: 'org';
  jira_project_key?: string;
  github_repos?: string[];
};

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
  input: DiffInputForSource;
  window: { start: string; end: string };
  userId: string;
}): Promise<CanonicalDiff> {
  const { input, window, userId } = params;
  const useJira = input.sources.includes('jira') && input.jira_project_key;
  const useGitHub = input.sources.includes('github') && Array.isArray(input.github_repos) && input.github_repos.length > 0;

  let jiraResult = undefined;
  if (useJira) {
    try {
      jiraResult = await getJiraDiffForProject({
        userId,
        projectKey: input.jira_project_key!,
        start: window.start,
        end: window.end,
      });
    } catch (err) {
      console.warn('[diff] Jira diff skipped (connection missing or fetch failed)', {
        project: input.jira_project_key,
        error: err instanceof Error ? err.message : String(err),
      });
      jiraResult = undefined;
    }
  }

  const githubEvents: Awaited<ReturnType<typeof getGitHubDiffForRepo>>[] = [];
  if (useGitHub) {
    for (const repo of input.github_repos!) {
      const [owner, name] = repo.split('/');
      if (!owner || !name) continue;
      try {
        const res = await getGitHubDiffForRepo({ owner, repo: name, start: window.start, end: window.end });
        githubEvents.push(res);
      } catch (err) {
        console.warn('[diff] GitHub diff skipped for repo', {
          repo,
          error: err instanceof Error ? err.message : String(err),
        });
      }
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
  const commitsCount = combinedGithub ? combinedGithub.commits.length : 0;
  const canonWithCommits: CanonDiffWithCommits = { ...canon, commits_default: commitsCount };
  return canonToCounts(canonWithCommits);
}

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
  const input: DiffInputForSource = {
    start_timestamp: window.start,
    end_timestamp: window.end,
    sources: [source.provider as 'jira' | 'github'],
    scope: 'org',
  };
  if (source.provider === 'github') {
    input.github_repos = [source.display_name];
  } else {
    const projectKey = source.display_name.startsWith('jira/') ? source.display_name.slice(5) : source.display_name;
    input.jira_project_key = projectKey;
  }
  return computeCanonicalDiff({ input, window, userId });
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

  const primaryAgg = emptyCanonicalDiff(window);
  const bySource: Record<string, CanonicalDiff> = {};

  for (const source of sources) {
    const primary = await computeCanonicalDiffForOneSource({ source, window, userId });
    bySource[source.id] = primary;
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
  }
  return { aggregate: primaryAgg, bySource, sources };
}
