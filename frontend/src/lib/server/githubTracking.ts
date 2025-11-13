/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * - Server-only utilities to track GitHub code changes for document updates.
 * - Functions to get commit SHAs, file SHAs, and detect changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { env } from "$env/dynamic/private";
import { parseRepoUrl, resolveBranchSha } from "./github";

const GH_TOKEN = env.GITHUB_TOKEN || "";

/**
 * Get the SHA of a specific file at a specific commit/branch
 */
async function getFileSha(
    owner: string,
    repo: string,
    ref: string, // branch name or commit SHA
    path: string
): Promise<string | null> {
    try {
        const res = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
            {
                headers: {
                    accept: "application/vnd.github+json",
                    ...(GH_TOKEN ? { authorization: `Bearer ${GH_TOKEN}` } : {})
                }
            }
        );

        if (!res.ok) {
            if (res.status === 404) return null; // file doesn't exist
            throw new Error(`GitHub GET failed ${res.status}`);
        }

        const data = (await res.json()) as { sha: string };
        return data.sha;
    } catch (e) {
        console.error(`Error getting file SHA for ${path}:`, e);
        return null;
    }
}

/**
 * Get commit SHA for a branch
 */
export async function getBranchCommitSha(
    repoUrl: string,
    branch: string
): Promise<string | null> {
    try {
        const parsed = parseRepoUrl(repoUrl);
        if (!parsed) return null;
        return await resolveBranchSha(parsed.owner, parsed.repo, branch);
    } catch {
        return null;
    }
}

/**
 * Get file SHAs for multiple files at a specific commit/branch
 */
export async function getFileShas(
    repoUrl: string,
    branch: string,
    filePaths: string[]
): Promise<Record<string, string | null>> {
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) return {};

    const shas: Record<string, string | null> = {};

    // Get the commit SHA for the branch
    const commitSha = await resolveBranchSha(parsed.owner, parsed.repo, branch);

    // Get SHA for each file
    for (const path of filePaths) {
        shas[path] = await getFileSha(parsed.owner, parsed.repo, commitSha, path);
    }

    return shas;
}

/**
 * Check if files have changed by comparing current SHAs with stored SHAs
 */
export async function checkForChanges(
    repoUrl: string,
    branch: string,
    filePaths: string[],
    storedShas: Record<string, string>
): Promise<{ changed: boolean; changedFiles: string[]; currentShas: Record<string, string | null> }> {
    const currentShas = await getFileShas(repoUrl, branch, filePaths);
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
 * Get the latest commit SHA for a branch (to track branch-level changes)
 */
export async function getLatestCommitSha(
    repoUrl: string,
    branch: string
): Promise<string | null> {
    return getBranchCommitSha(repoUrl, branch);
}

