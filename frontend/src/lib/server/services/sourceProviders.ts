/**
 * Source provider classification: repos (GitHub/GitLab) vs issue sources (Jira/Linear/Asana).
 * Jira and Confluence are not repos; they are classified as issue/KB providers.
 */

export const REPO_PROVIDERS = ['github', 'gitlab'] as const;
export const ISSUE_PROVIDERS = ['jira', 'linear', 'asana'] as const;

export type RepoProvider = (typeof REPO_PROVIDERS)[number];
export type IssueProvider = (typeof ISSUE_PROVIDERS)[number];

export function isRepoProvider(provider: string): boolean {
  return REPO_PROVIDERS.includes(provider.toLowerCase() as RepoProvider);
}

export function isIssueProvider(provider: string): boolean {
  return ISSUE_PROVIDERS.includes(provider.toLowerCase() as IssueProvider);
}
