/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * - Server-only utilities to track GitHub code changes for document updates.
 * - Functions to get commit SHAs, file SHAs, and detect changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { parseRepoUrl } from "./github";
import type { Octokit } from "@octokit/rest";

/**
 * Get the SHA of a specific file at a specific commit/branch using Octokit
 */
async function getFileSha(
    octokit: Octokit,
    owner: string,
    repo: string,
    ref: string, // branch name or commit SHA
    path: string
): Promise<string | null> {
    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path,
            ref
        });

        if (!Array.isArray(data) && data.type === 'file' && 'sha' in data) {
            return data.sha;
        }
        return null;
    } catch (e: any) {
        if (e?.status === 404) return null; // file doesn't exist
        console.error(`Error getting file SHA for ${path}:`, e);
        return null;
    }
}

/**
 * Get commit SHA for a branch using Octokit
 */
export async function getBranchCommitSha(
    octokit: Octokit,
    repoUrl: string,
    branch: string
): Promise<string | null> {
    try {
        const parsed = parseRepoUrl(repoUrl);
        if (!parsed) return null;
        
        const { data } = await octokit.repos.getBranch({
            owner: parsed.owner,
            repo: parsed.repo,
            branch
        });
        return data.commit.sha;
    } catch {
        return null;
    }
}

/**
 * Get file SHAs for multiple files at a specific commit/branch using Octokit
 */
export async function getFileShas(
    octokit: Octokit,
    repoUrl: string,
    branch: string,
    filePaths: string[]
): Promise<Record<string, string | null>> {
    try {
        console.log('[getFileShas] Starting for', filePaths.length, 'files');
        const parsed = parseRepoUrl(repoUrl);
        if (!parsed) {
            console.error('[getFileShas] Failed to parse repo URL:', repoUrl);
            return {};
        }

        const shas: Record<string, string | null> = {};

        // Get the commit SHA for the branch
        let commitSha: string;
        try {
            console.log(`[getFileShas] Resolving branch SHA for ${parsed.owner}/${parsed.repo} branch ${branch}`);
            const { data } = await octokit.repos.getBranch({
                owner: parsed.owner,
                repo: parsed.repo,
                branch
            });
            commitSha = data.commit.sha;
            console.log(`[getFileShas] Got commit SHA: ${commitSha}`);
        } catch (e) {
            console.error(`[getFileShas] Failed to resolve branch SHA for ${parsed.owner}/${parsed.repo} branch ${branch}:`, e);
            console.error('[getFileShas] Error details:', {
                message: e instanceof Error ? e.message : String(e),
                stack: e instanceof Error ? e.stack : undefined
            });
            return {}; // Return empty object if we can't get the commit SHA
        }

        // Get SHA for each file
        console.log(`[getFileShas] Fetching SHAs for ${filePaths.length} files`);
        for (const path of filePaths) {
            shas[path] = await getFileSha(octokit, parsed.owner, parsed.repo, commitSha, path);
        }

        const successCount = Object.values(shas).filter(s => s !== null).length;
        console.log(`[getFileShas] Completed: ${successCount}/${filePaths.length} files got SHAs`);
        return shas;
    } catch (e) {
        console.error('[getFileShas] Unexpected error:', e);
        console.error('[getFileShas] Error details:', {
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined
        });
        return {};
    }
}

/**
 * Check if files have changed by comparing current SHAs with stored SHAs using Octokit
 */
export async function checkForChanges(
    octokit: Octokit,
    repoUrl: string,
    branch: string,
    filePaths: string[],
    storedShas: Record<string, string>
): Promise<{ changed: boolean; changedFiles: string[]; currentShas: Record<string, string | null> }> {
    const currentShas = await getFileShas(octokit, repoUrl, branch, filePaths);
    const changedFiles: string[] = [];

    for (const path of filePaths) {
        const storedSha = storedShas[path];
        const currentSha = currentShas[path];

        // File changed if SHA is different, or file was deleted (currentSha is null but storedSha exists)
        if (storedSha && currentSha !== storedSha) {
            changedFiles.push(path);
        }
    }

    return {
        changed: changedFiles.length > 0,
        changedFiles,
        currentShas
    };
}

/**
 * Get the latest commit SHA for a branch (to track branch-level changes) using Octokit
 */
export async function getLatestCommitSha(
    octokit: Octokit,
    repoUrl: string,
    branch: string
): Promise<string | null> {
    return getBranchCommitSha(octokit, repoUrl, branch);
}

