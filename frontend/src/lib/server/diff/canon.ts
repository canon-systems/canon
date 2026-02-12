import type { GitHubDiffResult, GitHubDiffEvent } from './githubDiff';
import type { JiraDiffResult, JiraTicketEvent } from './jiraDiff';

export type CanonDiff = {
  start: string;
  end: string;
  repos_touched: string[];
  prs_opened: GitHubDiffEvent[];
  prs_merged: GitHubDiffEvent[];
  prs_closed_unmerged: GitHubDiffEvent[];
  tickets_moved: JiraTicketEvent[];
  tickets_completed: JiraTicketEvent[];
  tickets_regressed: JiraTicketEvent[];
  tickets_new: JiraTicketEvent[];
};

export function buildCanonDiff(params: {
  start: string;
  end: string;
  github?: GitHubDiffResult;
  jira?: JiraDiffResult;
}): CanonDiff {
  const { start, end, github, jira } = params;

  const repos_touched = new Set<string>();
  const prs_opened = github?.prs_opened ?? [];
  const prs_merged = github?.prs_merged ?? [];
  const prs_closed_unmerged = github?.prs_closed_unmerged ?? [];

  for (const event of [...prs_opened, ...prs_merged, ...prs_closed_unmerged, ...(github?.commits ?? [])]) {
    if (event.repo) repos_touched.add(event.repo);
  }
  const jiraTouchedCount =
    (jira?.tickets_moved?.length ?? 0) +
    (jira?.tickets_completed?.length ?? 0) +
    (jira?.tickets_regressed?.length ?? 0) +
    (jira?.tickets_new?.length ?? 0);
  if (jiraTouchedCount > 0) {
    if (jira?.projectKey) {
      repos_touched.add(`Jira:${jira.projectKey}`);
    } else {
      repos_touched.add('Jira');
    }
  }

  return {
    start,
    end,
    repos_touched: Array.from(repos_touched),
    prs_opened,
    prs_merged,
    prs_closed_unmerged,
    tickets_moved: jira?.tickets_moved ?? [],
    tickets_completed: jira?.tickets_completed ?? [],
    tickets_regressed: jira?.tickets_regressed ?? [],
    tickets_new: jira?.tickets_new ?? [],
  };
}
