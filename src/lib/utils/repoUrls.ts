/**
 * Utility functions for building repository URLs
 * Supports GitHub, GitLab, Bitbucket, etc.
 */

export type GitHubRepoParts = {
  owner: string;
  repo: string;
  branch?: string;
  subdir?: string;
};

/**
 * Parse a GitHub repository URL (optionally including /tree/<branch>/<subdir>)
 * Accepts URLs with or without protocol.
 */
export function parseGitHubRepoUrl(input: string): GitHubRepoParts | null {
  const normalized = input.startsWith('http') ? input : `https://${input}`;

  try {
    const u = new URL(normalized);
    if (!u.hostname.includes('github.com')) return null;

    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    const [owner, rawRepo, maybeTree, maybeBranch, ...rest] = parts;
    const repo = rawRepo.replace(/\.git$/, '');

    if (maybeTree === 'tree' && maybeBranch) {
      return {
        owner,
        repo,
        branch: maybeBranch,
        subdir: rest.length > 0 ? rest.join('/') : undefined,
      };
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

/**
 * Detect repository provider from URL
 * Returns 'github', 'gitlab', 'bitbucket', etc., or null if unknown
 */
export function detectRepoProvider(repoUrl: string): string | null {
  if (!repoUrl) return null;
  try {
    const url = new URL(repoUrl);
    if (url.hostname === 'github.com' || url.hostname.includes('github.com')) {
      return 'github';
    }
    if (url.hostname === 'gitlab.com' || url.hostname.includes('gitlab.com')) {
      return 'gitlab';
    }
    if (url.hostname === 'bitbucket.org' || url.hostname.includes('bitbucket.org')) {
      return 'bitbucket';
    }
  } catch {
    return null;
  }
  return null;
}

export interface RepoFileUrls {
    view: string;
    compare?: string;
    history?: string;
    fileDiff?: string; // Direct link to file diff between commits
}

/**
 * Build URLs for viewing and comparing files in a repository
 */
export function buildFileChangeUrl(
    filePath: string,
    repoUrl: string,
    branch: string,
    oldCommitSha?: string
): RepoFileUrls {
    try {
        const url = new URL(repoUrl);
        
        // GitHub URLs
        if (url.hostname === 'github.com' || url.hostname.includes('github.com')) {
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts.length >= 2) {
                const owner = pathParts[0];
                const repo = pathParts[1];
                const encodedPath = encodeURIComponent(filePath);
                
                return {
                    // View file at current branch
                    view: `https://github.com/${owner}/${repo}/blob/${branch}/${encodedPath}`,
                    // Compare between old commit and current branch (if old commit available)
                    compare: oldCommitSha 
                        ? `https://github.com/${owner}/${repo}/compare/${oldCommitSha}...${branch}`
                        : undefined,
                    // View commit history for this file
                    history: `https://github.com/${owner}/${repo}/commits/${branch}/${encodedPath}`,
                    // Direct link to file diff between commits
                    // For GitHub, we use the compare view which shows all changed files
                    // If oldCommitSha is available, show diff between old and new
                    // Otherwise, show the file's commit history (which includes diffs)
                    fileDiff: oldCommitSha
                        ? `https://github.com/${owner}/${repo}/compare/${oldCommitSha}...${branch}`
                        : `https://github.com/${owner}/${repo}/commits/${branch}/${encodedPath}`
                };
            }
        }
        
        // GitLab URLs (future)
        if (url.hostname === 'gitlab.com' || url.hostname.includes('gitlab.com')) {
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts.length >= 2) {
                const owner = pathParts[0];
                const repo = pathParts[1];
                const encodedPath = encodeURIComponent(filePath);
                
                return {
                    view: `https://gitlab.com/${owner}/${repo}/-/blob/${branch}/${encodedPath}`,
                    compare: oldCommitSha 
                        ? `https://gitlab.com/${owner}/${repo}/-/compare/${oldCommitSha}...${branch}`
                        : undefined,
                    history: `https://gitlab.com/${owner}/${repo}/-/commits/${branch}/${encodedPath}`,
                    // GitLab file diff URL
                    fileDiff: oldCommitSha
                        ? `https://gitlab.com/${owner}/${repo}/-/compare/${oldCommitSha}...${branch}#${encodedPath}`
                        : undefined
                };
            }
        }
        
        // Bitbucket URLs (future)
        if (url.hostname === 'bitbucket.org' || url.hostname.includes('bitbucket.org')) {
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts.length >= 2) {
                const owner = pathParts[0];
                const repo = pathParts[1];
                const encodedPath = encodeURIComponent(filePath);
                
                return {
                    view: `https://bitbucket.org/${owner}/${repo}/src/${branch}/${encodedPath}`,
                    compare: oldCommitSha 
                        ? `https://bitbucket.org/${owner}/${repo}/compare/${oldCommitSha}..${branch}`
                        : undefined,
                    history: `https://bitbucket.org/${owner}/${repo}/commits/branch/${branch}#${encodedPath}`,
                    // Bitbucket file diff URL (compare view)
                    fileDiff: oldCommitSha
                        ? `https://bitbucket.org/${owner}/${repo}/compare/${oldCommitSha}..${branch}#chg-${encodedPath}`
                        : undefined
                };
            }
        }
        
        // Fallback: return the repo URL
        return { view: repoUrl };
    } catch {
        return { view: repoUrl };
    }
}
