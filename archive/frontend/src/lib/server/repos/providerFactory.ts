/**
 * Factory to detect and return the appropriate repository provider
 */

import { GitHubProvider } from './providers/github';
import type { RepoProvider } from './providers/base';

// Lazy initialization of providers
let githubProvider: GitHubProvider | null = null;

function getGitHubProvider(): GitHubProvider {
    if (!githubProvider) {
        githubProvider = new GitHubProvider();
    }
    return githubProvider;
}

/**
 * Get the appropriate repository provider for a given URL
 * Returns null if no provider can handle the URL
 */
export function getRepoProvider(repoUrl: string): RepoProvider | null {
    if (!repoUrl) return null;

    // Try GitHub first
    const ghProvider = getGitHubProvider();
    if (ghProvider.canHandle(repoUrl)) {
        return ghProvider;
    }

    // Future: Add GitLab, Bitbucket, etc.
    // const glProvider = getGitLabProvider();
    // if (glProvider.canHandle(repoUrl)) return glProvider;

    return null;
}

/**
 * Detect provider name from URL (without instantiating)
 */
export function detectProvider(repoUrl: string): string | null {
    if (!repoUrl) return null;

    try {
        const url = new URL(repoUrl);
        if (url.hostname === 'github.com' || url.hostname.includes('github.com')) {
            return 'github';
        }
        // Future: Add GitLab, Bitbucket detection
    } catch {
        return null;
    }

    return null;
}

