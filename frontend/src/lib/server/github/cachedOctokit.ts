/**
 * Cached Octokit wrapper
 * Wraps common Octokit operations with caching and rate limit tracking
 */

import type { Octokit } from '@octokit/rest';
import { getCached, setCache, cacheKey, TTL } from './cache';
import { updateRateLimitFromHeaders, waitIfRateLimited } from './rateLimiter';

type BranchData = {
	name: string;
	commit: {
		sha: string;
		url: string;
	};
	protected: boolean;
};

type TreeData = {
	sha: string;
	url?: string;
	tree: Array<{
		path?: string;
		mode?: string;
		type?: string;
		sha?: string;
		size?: number;
		url?: string;
	}>;
	truncated: boolean;
};

/**
 * Get branch info with caching
 * Uses short TTL since branch refs can change
 */
export async function getCachedBranch(
	octokit: Octokit,
	owner: string,
	repo: string,
	branch: string
): Promise<BranchData> {
	const key = cacheKey.branch(owner, repo, branch);

	// Check cache first
	const cached = getCached<BranchData>(key);
	if (cached) {
		return cached;
	}

	// Wait if rate limited
	await waitIfRateLimited();

	// Fetch from API
	const { data, headers } = await octokit.repos.getBranch({
		owner,
		repo,
		branch,
	});

	// Update rate limit state
	updateRateLimitFromHeaders(headers as Record<string, string>);

	// Cache the result
	setCache(key, data, TTL.BRANCH);

	return data;
}

/**
 * Get tree with caching
 * Tree data at a specific SHA is immutable, so can use longer TTL
 */
export async function getCachedTree(
	octokit: Octokit,
	owner: string,
	repo: string,
	treeSha: string,
	recursive: boolean = true
): Promise<TreeData> {
	const key = cacheKey.tree(owner, repo, treeSha);

	// Check cache first
	const cached = getCached<TreeData>(key);
	if (cached) {
		return cached;
	}

	// Wait if rate limited
	await waitIfRateLimited();

	// Fetch from API
	const { data, headers } = await octokit.git.getTree({
		owner,
		repo,
		tree_sha: treeSha,
		recursive: recursive ? '1' : undefined,
	});

	// Update rate limit state
	updateRateLimitFromHeaders(headers as Record<string, string>);

	// Cache the result (tree data is immutable for a given SHA)
	setCache(key, data, TTL.TREE);

	return data;
}

/**
 * Get file content with caching
 * File content at a specific ref/SHA is immutable
 */
export async function getCachedFileContent(
	octokit: Octokit,
	owner: string,
	repo: string,
	path: string,
	ref: string
): Promise<{ content: string; sha: string; size: number } | null> {
	const key = cacheKey.fileContent(owner, repo, path, ref);

	// Check cache first
	const cached = getCached<{ content: string; sha: string; size: number }>(key);
	if (cached) {
		return cached;
	}

	// Wait if rate limited
	await waitIfRateLimited();

	try {
		const { data, headers } = await octokit.repos.getContent({
			owner,
			repo,
			path,
			ref,
		});

		// Update rate limit state
		updateRateLimitFromHeaders(headers as Record<string, string>);

		if (Array.isArray(data) || data.type !== 'file') {
			return null;
		}

		let content = '';
		if (data.encoding === 'base64' && data.content) {
			content = Buffer.from(data.content, 'base64').toString('utf-8');
		} else if (typeof data.content === 'string') {
			content = data.content;
		}

		const result = {
			content,
			sha: data.sha,
			size: data.size || content.length,
		};

		// Cache the result
		setCache(key, result, TTL.FILE_CONTENT);

		return result;
	} catch (error) {
		return null;
	}
}

/**
 * Get all file SHAs from tree (single API call)
 * Much more efficient than fetching each file individually
 */
export async function getCachedFileShas(
	octokit: Octokit,
	owner: string,
	repo: string,
	treeSha: string
): Promise<Map<string, { sha: string; size: number }>> {
	const key = cacheKey.fileShas(owner, repo, treeSha);

	// Check cache first
	const cached = getCached<Map<string, { sha: string; size: number }>>(key);
	if (cached) {
		return cached;
	}

	// Get tree data (may be cached)
	const tree = await getCachedTree(octokit, owner, repo, treeSha);

	// Build SHA map
	const shaMap = new Map<string, { sha: string; size: number }>();
	for (const item of tree.tree) {
		if (item.type === 'blob' && item.path && item.sha) {
			shaMap.set(item.path, {
				sha: item.sha,
				size: item.size || 0,
			});
		}
	}

	// Cache the result
	setCache(key, shaMap, TTL.FILE_SHA);

	return shaMap;
}

/**
 * Compare commits with caching
 * Useful for detecting changes between two commits
 */
export async function getCachedCompareCommits(
	octokit: Octokit,
	owner: string,
	repo: string,
	base: string,
	head: string
): Promise<{
	files: Array<{
		filename: string;
		status: string;
		previous_filename?: string;
		sha?: string;
	}>;
	commits: Array<{ sha: string }>;
	total_commits: number;
}> {
	// Compare results can change if commits are amended, but that's rare
	// Use short cache TTL
	const key = `compare:${owner}/${repo}/${base}...${head}`;

	const cached = getCached<{
		files: Array<{
			filename: string;
			status: string;
			previous_filename?: string;
			sha?: string;
		}>;
		commits: Array<{ sha: string }>;
		total_commits: number;
	}>(key);
	if (cached) {
		return cached;
	}

	// Wait if rate limited
	await waitIfRateLimited();

	const { data, headers } = await octokit.repos.compareCommits({
		owner,
		repo,
		base,
		head,
	});

	// Update rate limit state
	updateRateLimitFromHeaders(headers as Record<string, string>);

	const result = {
		files: (data.files || []).map(f => ({
			filename: f.filename,
			status: f.status || 'modified',
			previous_filename: f.previous_filename,
			sha: f.sha || undefined,
		})),
		commits: data.commits.map(c => ({ sha: c.sha })),
		total_commits: data.total_commits || data.commits.length,
	};

	// Cache for 1 minute
	setCache(key, result, 60_000);

	return result;
}

