/**
 * GitHub repository provider implementation
 * Uses GitHub API with Tree API for efficient batch SHA fetching
 */

import { env } from '$env/dynamic/private';
import { Octokit } from '@octokit/rest';
import type { RepoProvider } from './base';
import type { RepoInfo, WebhookResult } from '../types';

const GH_TOKEN = env.GITHUB_TOKEN || '';

export class GitHubProvider implements RepoProvider {
    private octokit: Octokit;

    constructor() {
        this.octokit = new Octokit({
            auth: GH_TOKEN || undefined
        });
    }

    getName(): string {
        return 'github';
    }

    canHandle(repoUrl: string): boolean {
        try {
            const url = new URL(repoUrl);
            return url.hostname === 'github.com' || url.hostname.includes('github.com');
        } catch {
            return false;
        }
    }

    parseRepoUrl(repoUrl: string): RepoInfo | null {
        try {
            const u = new URL(repoUrl);
            if (u.hostname !== 'github.com' && !u.hostname.includes('github.com')) {
                return null;
            }

            const parts = u.pathname.split('/').filter(Boolean);
            if (parts.length < 2) return null;

            const [owner, repo, maybeTree, maybeBranch, ...rest] = parts;

            // Case 1: a /tree URL
            if (maybeTree === 'tree' && maybeBranch) {
                return {
                    owner,
                    repo,
                    branch: maybeBranch,
                    subdir: rest.length > 0 ? rest.join('/') : undefined
                };
            }

            // Case 2: plain owner/repo URL
            return { owner, repo };
        } catch {
            return null;
        }
    }

    async getBranchCommitSha(repoInfo: RepoInfo, branch: string): Promise<string | null> {
        try {
            const { data } = await this.octokit.repos.getBranch({
                owner: repoInfo.owner,
                repo: repoInfo.repo,
                branch
            });
            return data.commit.sha;
        } catch (error) {
            console.error(`Error getting branch commit SHA for ${repoInfo.owner}/${repoInfo.repo}/${branch}:`, error);
            return null;
        }
    }

    /**
     * Batch fetch file SHAs using GitHub Tree API
     * This is much more efficient than individual getContent calls
     */
    async fetchFileShas(
        repoInfo: RepoInfo,
        branch: string,
        filePaths: string[]
    ): Promise<Record<string, string | null>> {
        if (filePaths.length === 0) {
            return {};
        }

        try {
            // First, get the commit SHA for the branch
            const commitSha = await this.getBranchCommitSha(repoInfo, branch);
            if (!commitSha) {
                // If we can't get the commit SHA, fall back to individual calls
                return await this.fetchFileShasIndividual(repoInfo, branch, filePaths);
            }

            // Get the tree recursively for the commit
            const { data: treeData } = await this.octokit.git.getTree({
                owner: repoInfo.owner,
                repo: repoInfo.repo,
                tree_sha: commitSha,
                recursive: '1'
            });

            // Build a map of path -> sha from the tree
            const treeMap = new Map<string, string>();
            if (treeData.tree) {
                for (const item of treeData.tree) {
                    if (item.type === 'blob' && item.path && item.sha) {
                        treeMap.set(item.path, item.sha);
                    }
                }
            }

            // Extract SHAs for requested file paths
            const result: Record<string, string | null> = {};
            for (const path of filePaths) {
                result[path] = treeMap.get(path) || null;
            }

            return result;
        } catch (error) {
            console.error(
                `Error fetching file SHAs via Tree API for ${repoInfo.owner}/${repoInfo.repo}/${branch}:`,
                error
            );
            // Fall back to individual calls if tree API fails
            return await this.fetchFileShasIndividual(repoInfo, branch, filePaths);
        }
    }

    /**
     * Fallback: fetch file SHAs individually (slower but more reliable)
     */
    private async fetchFileShasIndividual(
        repoInfo: RepoInfo,
        branch: string,
        filePaths: string[]
    ): Promise<Record<string, string | null>> {
        const result: Record<string, string | null> = {};

        // Get commit SHA first
        const commitSha = await this.getBranchCommitSha(repoInfo, branch);
        if (!commitSha) {
            // If we can't get commit SHA, return all nulls
            for (const path of filePaths) {
                result[path] = null;
            }
            return result;
        }

        // Fetch each file individually
        for (const path of filePaths) {
            try {
                const { data } = await this.octokit.repos.getContent({
                    owner: repoInfo.owner,
                    repo: repoInfo.repo,
                    path,
                    ref: commitSha
                });

                if (!Array.isArray(data) && data.type === 'file' && data.sha) {
                    result[path] = data.sha;
                } else {
                    result[path] = null;
                }
            } catch (error: any) {
                if (error.status === 404) {
                    result[path] = null; // File doesn't exist
                } else {
                    console.error(`Error getting file SHA for ${path}:`, error);
                    result[path] = null;
                }
            }
        }

        return result;
    }

    async fetchFileContent(repoInfo: RepoInfo, branch: string, path: string): Promise<string | null> {
        try {
            const res = await fetch(
                `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
                {
                    headers: {
                        accept: 'application/vnd.github+json',
                        ...(GH_TOKEN ? { authorization: `Bearer ${GH_TOKEN}` } : {})
                    }
                }
            );

            if (!res.ok) return null;
            const data = (await res.json()) as { content: string; encoding: string };

            if (data.encoding === 'base64') {
                return Buffer.from(data.content, 'base64').toString('utf-8');
            }
            return data.content;
        } catch (error) {
            console.error(`Error fetching file content for ${path}:`, error);
            return null;
        }
    }

    handleWebhook(payload: unknown): WebhookResult | null {
        try {
            const p = payload as any;

            // Check if this is a GitHub push event
            if (!p.repository || !p.ref || !p.commits) {
                return null;
            }

            const repoUrl = p.repository.html_url || p.repository.url;
            if (!repoUrl || !this.canHandle(repoUrl)) {
                return null;
            }

            const branch = p.ref.replace('refs/heads/', '');
            const latestCommitSha = p.after || p.head_commit?.id || '';

            // Extract changed files from commits
            const changedFiles = new Set<string>();
            if (Array.isArray(p.commits)) {
                for (const commit of p.commits) {
                    if (commit.added) {
                        commit.added.forEach((f: string) => changedFiles.add(f));
                    }
                    if (commit.modified) {
                        commit.modified.forEach((f: string) => changedFiles.add(f));
                    }
                    if (commit.removed) {
                        commit.removed.forEach((f: string) => changedFiles.add(f));
                    }
                }
            }

            return {
                repoUrl,
                branch,
                changedFiles: Array.from(changedFiles),
                latestCommitSha
            };
        } catch (error) {
            console.error('Error handling GitHub webhook:', error);
            return null;
        }
    }
}

