/**
 * Shared types for repository provider abstraction
 */

export interface RepoInfo {
    owner: string;
    repo: string;
    branch?: string;
    subdir?: string;
}

export interface WebhookResult {
    repoUrl: string;
    branch: string;
    changedFiles: string[];
    latestCommitSha: string;
}

export interface ChangedFile {
    file_path: string;
    old_hash: string;
    new_hash: string;
}

