import { getGitHubAppOctokitForRepo } from '@/lib/server/github/appAuth';

export type GitHubDiffEvent = {
  repo: string;
  pr_number: number | null;
  action: 'opened' | 'merged' | 'closed_unmerged' | 'commit';
  timestamp: string;
};

export type GitHubDiffResult = {
  repo: string;
  start: string;
  end: string;
  prs_opened: GitHubDiffEvent[];
  prs_merged: GitHubDiffEvent[];
  prs_closed_unmerged: GitHubDiffEvent[];
  commits: GitHubDiffEvent[];
};

type DiffParams = {
  owner: string;
  repo: string;
  start: string;
  end: string;
};

function inWindow(ts: string | null | undefined, start: number, end: number): boolean {
  if (!ts) return false;
  const t = Date.parse(ts);
  return Number.isFinite(t) && t >= start && t <= end;
}

export async function getGitHubDiffForRepo(params: DiffParams): Promise<GitHubDiffResult> {
  const { owner, repo, start, end } = params;
  console.log('[github/diff] start', { repo: `${owner}/${repo}`, start, end });
  const octokit = await getGitHubAppOctokitForRepo(owner, repo);

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error('Invalid start/end timestamps.');
  }

  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch || 'main';

  const prs_opened: GitHubDiffEvent[] = [];
  const prs_merged: GitHubDiffEvent[] = [];
  const prs_closed_unmerged: GitHubDiffEvent[] = [];
  const commits: GitHubDiffEvent[] = [];

  // PRs: list by updated time and filter by window; paginate enough to reach baseline-day PRs
  let page = 1;
  const perPage = 100;
  const maxPages = 50;
  let prPageCount = 0;
  while (page <= maxPages) {
    const { data: prs } = await octokit.pulls.list({
      owner,
      repo,
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: perPage,
      page,
    });

    if (!prs.length) break;
    prPageCount += 1;

    let shouldContinue = false;
    for (const pr of prs) {
      if (pr.updated_at) {
        const updatedMs = Date.parse(pr.updated_at);
        if (Number.isFinite(updatedMs) && updatedMs >= startMs) {
          shouldContinue = true;
        }
      }

      if (inWindow(pr.created_at, startMs, endMs)) {
        prs_opened.push({
          repo: `${owner}/${repo}`,
          pr_number: pr.number,
          action: 'opened',
          timestamp: pr.created_at,
        });
      }
      if (inWindow(pr.merged_at, startMs, endMs)) {
        prs_merged.push({
          repo: `${owner}/${repo}`,
          pr_number: pr.number,
          action: 'merged',
          timestamp: pr.merged_at!,
        });
      }
      if (inWindow(pr.closed_at, startMs, endMs) && !pr.merged_at) {
        prs_closed_unmerged.push({
          repo: `${owner}/${repo}`,
          pr_number: pr.number,
          action: 'closed_unmerged',
          timestamp: pr.closed_at!,
        });
      }
    }

    if (!shouldContinue) break;
    page += 1;
  }

  // Commits: use start of next UTC day for until so API includes full window; paginate to get all in range.
  const untilDate = new Date(end);
  untilDate.setUTCDate(untilDate.getUTCDate() + 1);
  untilDate.setUTCHours(0, 0, 0, 0);
  const untilIso = untilDate.toISOString();

  let commitPage = 1;
  const commitsPerPage = 100;
  const maxCommitPages = 50;
  let commitPageCount = 0;
  while (commitPage <= maxCommitPages) {
    const { data: commitData } = await octokit.repos.listCommits({
      owner,
      repo,
      sha: defaultBranch,
      since: start,
      until: untilIso,
      per_page: commitsPerPage,
      page: commitPage,
    });

    if (!commitData?.length) break;
    commitPageCount += 1;

    for (const commit of commitData) {
      const ts = commit.commit?.author?.date || commit.commit?.committer?.date;
      if (!ts || !inWindow(ts, startMs, endMs)) continue;
      commits.push({
        repo: `${owner}/${repo}`,
        pr_number: null,
        action: 'commit',
        timestamp: ts,
      });
    }

    if (commitData.length < commitsPerPage) break;
    commitPage += 1;
  }

  console.log('[github/diff] done', {
    repo: `${owner}/${repo}`,
    pr_pages: prPageCount,
    commit_pages: commitPageCount,
    prs_opened: prs_opened.length,
    prs_merged: prs_merged.length,
    prs_closed_unmerged: prs_closed_unmerged.length,
    commits: commits.length,
  });

  return {
    repo: `${owner}/${repo}`,
    start,
    end,
    prs_opened,
    prs_merged,
    prs_closed_unmerged,
    commits,
  };
}
