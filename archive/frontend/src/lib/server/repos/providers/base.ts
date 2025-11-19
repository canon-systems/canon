/**
 * Base interface for repository providers
 * All providers (GitHub, GitLab, Bitbucket, etc.) must implement this interface
 */

import type { RepoInfo, WebhookResult } from '../types';

export interface RepoProvider {
    /**
     * Detect if this provider can handle the given repository URL
     */
    canHandle(repoUrl: string): boolean;

    /**
     * Parse repository URL into standardized format
     */
    parseRepoUrl(repoUrl: string): RepoInfo | null;

    /**
     * Get the latest commit SHA for a branch
     */
    getBranchCommitSha(repoInfo: RepoInfo, branch: string): Promise<string | null>;

    /**
     * Batch fetch file SHAs for multiple files at once
     * This should use the provider's most efficient batch API (e.g., Tree API for GitHub)
     */
    fetchFileShas(
        repoInfo: RepoInfo,
        branch: string,
        filePaths: string[]
    ): Promise<Record<string, string | null>>;

    /**
     * Fetch the content of a single file
     */
    fetchFileContent(repoInfo: RepoInfo, branch: string, path: string): Promise<string | null>;

    /**
     * Handle webhook payload and extract repository information
     * Returns null if the payload is not for this provider or is not a push event
     */
    handleWebhook(payload: unknown): WebhookResult | null;

    /**
     * Get the provider name (e.g., 'github', 'gitlab', 'bitbucket')
     */
    getName(): string;
}

