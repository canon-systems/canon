/**
 * Batch file fetching utilities for GitHub
 * Uses ZIP download to fetch multiple files in a single API call
 * This dramatically reduces rate limit consumption
 */

import type { Octokit } from '@octokit/rest';
import JSZip from 'jszip';

/**
 * Fetch multiple files from a GitHub repo using ZIP archive download
 * This uses only 1 API call regardless of how many files you need
 * 
 * @param octokit - Octokit instance (authenticated or anonymous)
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param ref - Branch name or commit SHA
 * @param paths - Array of file paths to extract (if empty, returns all files)
 * @param options - Additional options
 * @returns Array of files with path and content
 */
export async function fetchFilesViaZip(
	octokit: Octokit,
	owner: string,
	repo: string,
	ref: string,
	paths?: string[],
	options?: {
		maxFileSize?: number; // Skip files larger than this (bytes)
		maxFiles?: number; // Maximum number of files to return
		filterFn?: (path: string) => boolean; // Custom filter function
	}
): Promise<Array<{ path: string; content: string; size: number }>> {
	const { maxFileSize = 1024 * 1024, maxFiles = 500, filterFn } = options || {};

	// Download repo as ZIP (1 API call)
	const response = await octokit.repos.downloadZipballArchive({
		owner,
		repo,
		ref,
	});

	const zip = await JSZip.loadAsync(response.data as ArrayBuffer);
	const files: Array<{ path: string; content: string; size: number }> = [];

	// Build a set of normalized paths for faster lookup
	const pathSet = paths && paths.length > 0
		? new Set(paths.map(p => normalizePath(p)))
		: null;

	// Find the root folder name (GitHub adds owner-repo-sha/ prefix)
	let rootPrefix = '';
	for (const zipPath of Object.keys(zip.files)) {
		if (zipPath.endsWith('/')) {
			rootPrefix = zipPath;
			break;
		}
	}

	for (const [zipPath, zipEntry] of Object.entries(zip.files)) {
		if (zipEntry.dir) continue;
		if (files.length >= maxFiles) break;

		// Strip the root folder GitHub adds (e.g., "owner-repo-sha/")
		const relativePath = zipPath.startsWith(rootPrefix)
			? zipPath.slice(rootPrefix.length)
			: zipPath.split('/').slice(1).join('/');

		if (!relativePath) continue;

		// Check if this file is in our requested paths
		if (pathSet && !pathSet.has(normalizePath(relativePath))) {
			continue;
		}

		// Apply custom filter if provided
		if (filterFn && !filterFn(relativePath)) {
			continue;
		}

		// We'll check file size after reading content since JSZip doesn't expose uncompressed size directly

		try {
			const content = await zipEntry.async('string');

			// Check file size after reading
			if (content.length > maxFileSize) {
				console.log(`Skipping large file: ${relativePath} (${content.length} bytes)`);
				continue;
			}

			files.push({
				path: relativePath,
				content,
				size: content.length,
			});
		} catch (error) {
			// Skip binary files or files that can't be read as text
			console.warn(`Skipping file ${relativePath}: could not read as text`);
		}
	}

	return files;
}

/**
 * Fetch files using the most efficient method based on count
 * - Few files (< 10): Individual API calls
 * - Many files (>= 10): ZIP download
 */
export async function fetchFilesSmart(
	octokit: Octokit,
	owner: string,
	repo: string,
	ref: string,
	paths: string[],
	options?: {
		maxFileSize?: number;
		threshold?: number; // Number of files before switching to ZIP
	}
): Promise<Array<{ path: string; content: string; size: number }>> {
	const { threshold = 15 } = options || {};

	if (paths.length < threshold) {
		// Use individual API calls for small batches
		return fetchFilesIndividually(octokit, owner, repo, ref, paths);
	}

	// Use ZIP for larger batches
	return fetchFilesViaZip(octokit, owner, repo, ref, paths, options);
}

/**
 * Fetch files individually (for small batches)
 */
async function fetchFilesIndividually(
	octokit: Octokit,
	owner: string,
	repo: string,
	ref: string,
	paths: string[]
): Promise<Array<{ path: string; content: string; size: number }>> {
	const files: Array<{ path: string; content: string; size: number }> = [];

	// Process in parallel with concurrency limit
	const concurrency = 5;
	for (let i = 0; i < paths.length; i += concurrency) {
		const batch = paths.slice(i, i + concurrency);
		const results = await Promise.allSettled(
			batch.map(async (path) => {
				const { data } = await octokit.repos.getContent({
					owner,
					repo,
					path,
					ref,
				});

				if (!Array.isArray(data) && data.type === 'file' && data.content) {
					const content = Buffer.from(data.content, 'base64').toString('utf-8');
					return {
						path,
						content,
						size: data.size || content.length,
					};
				}
				return null;
			})
		);

		for (const result of results) {
			if (result.status === 'fulfilled' && result.value) {
				files.push(result.value);
			}
		}
	}

	return files;
}

/**
 * Normalize path for comparison (remove leading ./ and /)
 */
function normalizePath(path: string): string {
	return path
		.replace(/^\.\//, '')
		.replace(/^\//, '')
		.toLowerCase();
}

/**
 * Get file SHAs from the tree API (single API call for all files)
 * This is much more efficient than calling getContent for each file
 */
export async function getFileShasFromTree(
	octokit: Octokit,
	owner: string,
	repo: string,
	treeSha: string
): Promise<Map<string, string>> {
	const { data } = await octokit.git.getTree({
		owner,
		repo,
		tree_sha: treeSha,
		recursive: '1',
	});

	const shaMap = new Map<string, string>();
	for (const item of data.tree) {
		if (item.type === 'blob' && item.path && item.sha) {
			shaMap.set(item.path, item.sha);
		}
	}

	return shaMap;
}

