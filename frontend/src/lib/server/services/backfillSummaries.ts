import type { SupabaseClient } from '@supabase/supabase-js';
import { prepareFileSummaries } from './prepareSummaries';
import { parseRepoUrl } from '../github/github';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Normalize repo URL to repo_id format: "github.com/owner/repo" (lowercase)
 * GitHub URLs are case-insensitive, so we normalize to lowercase for consistent matching
 */
function normalizeRepoId(repoUrl: string): string {
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		throw new Error(`Invalid repo URL: ${repoUrl}`);
	}
	return `github.com/${parsed.owner}/${parsed.repo}`.toLowerCase();
}

/**
 * Normalize branch names so "Refs/Heads/Main" and "main" match.
 */
function normalizeBranchName(branch?: string | null): string {
	if (!branch) return '';
	return branch.trim().replace(/^refs\/heads\//i, '').toLowerCase();
}

/**
 * Normalize file paths so "./foo.ts" and "foo.ts" are treated the same.
 */
function normalizeFilePath(filePath?: string | null): string {
	if (!filePath) return '';
	let normalized = filePath.trim().replace(/\\/g, '/');

	// Remove duplicated slashes
	normalized = normalized.replace(/\/+/g, '/');

	// Remove leading ./ or /
	while (normalized.startsWith('./')) {
		normalized = normalized.slice(2);
	}
	while (normalized.startsWith('/')) {
		normalized = normalized.slice(1);
	}

	return normalized;
}

/**
 * Find all submissions with missing summaries
 */
export async function findSubmissionsWithMissingSummaries(
	supabase: SupabaseClient,
	options?: {
		limit?: number;
		userId?: string;
		repoUrl?: string;
	}
): Promise<Array<{
	submissionId: string;
	repoId: string;
	repoUrl: string;
	missingFiles: string[];
	totalFiles: number;
}>> {
	const { limit = 100, userId, repoUrl } = options || {};

	// Query for repository-based submissions
	let query = supabase
		.from('submissions')
		.select('id, source_meta, selected_files, created_by')
		.in('input_type', ['github_repo', 'github_repo_directory'])
		.eq('status', 'completed')
		.not('selected_files', 'is', null);

	if (userId) {
		query = query.eq('created_by', userId);
	}

	if (limit) {
		query = query.limit(limit);
	}

	const { data: submissions, error } = await query;

	if (error || !submissions) {
		throw new Error(`Failed to fetch submissions: ${error?.message || 'Unknown error'}`);
	}

	// Load actual files tracked for each submission from submission_files to avoid stale selected_files
	const submissionIds = submissions.map((s) => s.id);
	const submissionFilesMap = new Map<string, string[]>();

	if (submissionIds.length > 0) {
		const { data: submissionFiles, error: submissionFilesError } = await supabase
			.from('submission_files')
			.select('submission_id, file_path')
			.in('submission_id', submissionIds);

		if (submissionFilesError) {
			throw new Error(`Failed to load submission files: ${submissionFilesError.message}`);
		}

		(submissionFiles || []).forEach((row) => {
			const list = submissionFilesMap.get(row.submission_id) || [];
			if (row.file_path) {
				list.push(row.file_path);
			}
			submissionFilesMap.set(row.submission_id, list);
		});
	}

	const results: Array<{
		submissionId: string;
		repoId: string;
		repoUrl: string;
		missingFiles: string[];
		totalFiles: number;
	}> = [];

	for (const submission of submissions) {
		const sourceMeta = submission.source_meta || {};
		const submissionRepoUrl = sourceMeta.repoUrl?.trim();

		if (!submissionRepoUrl) continue;
		if (repoUrl && submissionRepoUrl !== repoUrl) continue;

		try {
			const repoId = normalizeRepoId(submissionRepoUrl);
			const branch = (sourceMeta.branch || 'main').trim();
			const normalizedBranch = normalizeBranchName(branch);
			const submissionFilePaths = submissionFilesMap.get(submission.id) || [];
			const trackedFilesRaw =
				submissionFilePaths.length > 0
					? Array.from(new Set(submissionFilePaths.filter(Boolean)))
					: Array.from(new Set((submission.selected_files || []).filter(Boolean)));

			if (trackedFilesRaw.length === 0) continue;

			// Normalize file paths for comparison while keeping original value for display
			const trackedFileDisplayMap = new Map<string, string>();
			for (const filePath of trackedFilesRaw) {
				const normalizedPath = normalizeFilePath(filePath);
				if (!normalizedPath) continue;
				if (!trackedFileDisplayMap.has(normalizedPath)) {
					trackedFileDisplayMap.set(normalizedPath, filePath);
				}
			}

			const normalizedTrackedFiles = Array.from(trackedFileDisplayMap.keys());
			if (normalizedTrackedFiles.length === 0) continue;
			const totalFiles = normalizedTrackedFiles.length;

			// Check which files have summaries
			// IMPORTANT: Do NOT filter by file_path here, because paths in repo_file_summaries
			// may differ by leading segments (e.g. \"frontend/src/...\" vs \"src/...\").
			
			// Use service role client to bypass RLS for reading summaries
			const serviceClient = createServiceRoleClient();
			
			// Query for summaries with case-insensitive repo_id matching
			// First try exact lowercase match, then try with original case patterns
			const { data: existingSummaries, error: summariesError } = await serviceClient
				.from('repo_file_summaries')
				.select('file_path, branch, repo_id')
				.ilike('repo_id', `%${repoId.split('/').pop()}`); // Match by repo name suffix
			
			// Filter to only include summaries that match our repo (case-insensitive)
			const repoSummaries = (existingSummaries || []).filter(
				(s) => s.repo_id?.toLowerCase() === repoId.toLowerCase()
			);

			if (summariesError) {
				console.warn(`[findMissingSummaries] Error querying summaries for ${repoId}:`, summariesError.message);
			}

			// Build a set of normalized tracked file paths that already have summaries.
			// We consider a summary to match a tracked file if:
			// - The normalized paths are exactly equal, OR
			// - One path ends with the other (to handle cases like "frontend/src/..." vs "src/...")
			const filesWithSummaries = new Set<string>();

			const summariesForBranch = repoSummaries.filter((summary) => {
				const summaryBranch = normalizeBranchName(summary.branch);
				if (!summaryBranch) {
					// Rows created before branch tracking should count for all branches
					return true;
				}
				return summaryBranch === normalizedBranch;
			});

			for (const summary of summariesForBranch) {
				const summaryPath = normalizeFilePath(summary.file_path);
				if (!summaryPath) continue;

				for (const normalizedPath of normalizedTrackedFiles) {
					if (!normalizedPath) continue;

					if (
						summaryPath === normalizedPath ||
						summaryPath.endsWith('/' + normalizedPath) ||
						normalizedPath.endsWith('/' + summaryPath)
					) {
						filesWithSummaries.add(normalizedPath);
					}
				}
			}

			const missingFiles = normalizedTrackedFiles
				.filter((normalizedPath) => !filesWithSummaries.has(normalizedPath))
				.map((normalizedPath) => trackedFileDisplayMap.get(normalizedPath) || normalizedPath);

			if (missingFiles.length > 0) {
				results.push({
					submissionId: submission.id,
					repoId,
					repoUrl: submissionRepoUrl,
					missingFiles,
					totalFiles,
				});
			}
		} catch (error) {
			// Skip submissions with invalid repo URLs
			console.warn(`Skipping submission ${submission.id}: Invalid repo URL`, error);
			continue;
		}
	}

	return results;
}

/**
 * Backfill summaries for a specific submission
 */
export async function backfillSubmissionSummaries(
	supabase: SupabaseClient,
	submissionId: string,
	userId?: string | null,
	onFileProgress?: (filePath: string, status: 'processing' | 'completed' | 'skipped' | 'failed', error?: string) => void
): Promise<{
	success: boolean;
	filesProcessed: number;
	filesUpdated: number;
	filesSkipped: number;
	errors: string[];
}> {
	const errors: string[] = [];

	try {
		console.log(`[backfillSubmissionSummaries] Starting backfill for submission ${submissionId}`);
		const result = await prepareFileSummaries(
			supabase,
			submissionId,
			false, // Don't regenerate existing summaries
			userId || null,
			onFileProgress
		);
		console.log(`[backfillSubmissionSummaries] Completed backfill for submission ${submissionId}: ${result.filesUpdated} updated, ${result.filesSkipped} skipped`);

		return {
			success: true,
			filesProcessed: result.filesPrepared,
			filesUpdated: result.filesUpdated,
			filesSkipped: result.filesSkipped,
			errors: [],
		};
	} catch (error: any) {
		const errorMessage = error?.message || String(error);
		const errorStatus = error?.status || error?.response?.status;
		const fullError = errorStatus 
			? `${errorMessage} (Status: ${errorStatus})`
			: errorMessage;
		
		console.error(`backfillSubmissionSummaries failed for ${submissionId}:`, {
			error: fullError,
			status: errorStatus,
			stack: error?.stack,
		});
		
		errors.push(fullError);
		return {
			success: false,
			filesProcessed: 0,
			filesUpdated: 0,
			filesSkipped: 0,
			errors,
		};
	}
}

/**
 * Backfill summaries for multiple submissions (batch processing)
 */
export async function backfillSummariesBatch(
	supabase: SupabaseClient,
	options?: {
		limit?: number;
		batchSize?: number;
		userId?: string;
		repoUrl?: string;
		onProgress?: (progress: {
			processed: number;
			total: number;
			updated: number;
			failed: number;
		}) => void;
		onFileProgress?: (filePath: string, status: 'processing' | 'completed' | 'skipped' | 'failed', error?: string) => void;
	}
): Promise<{
	totalProcessed: number;
	totalUpdated: number;
	totalFailed: number;
	results: Array<{
		submissionId: string;
		success: boolean;
		filesUpdated: number;
		error?: string;
	}>;
}> {
	const { limit = 100, batchSize = 10, userId, repoUrl, onProgress, onFileProgress } = options || {};

	// Find submissions with missing summaries
	const submissionsToBackfill = await findSubmissionsWithMissingSummaries(
		supabase,
		{ limit, userId, repoUrl }
	);

	const total = submissionsToBackfill.length;
	let processed = 0;
	let totalUpdated = 0;
	let totalFailed = 0;
	const results: Array<{
		submissionId: string;
		success: boolean;
		filesUpdated: number;
		error?: string;
	}> = [];

	// Process in batches to avoid overwhelming the system and hitting rate limits
	for (let i = 0; i < submissionsToBackfill.length; i += batchSize) {
		const batch = submissionsToBackfill.slice(i, i + batchSize);
		
		// Add delay between batches to avoid rate limits (except first batch)
		if (i > 0) {
			const delay = 2000; // 2 second delay between batches
			console.log(`Waiting ${delay}ms before processing next batch to avoid rate limits...`);
			await new Promise(resolve => setTimeout(resolve, delay));
		}

		// Get user IDs for each submission in the batch
		const { data: submissionsData } = await supabase
			.from('submissions')
			.select('id, created_by')
			.in(
				'id',
				batch.map((s) => s.submissionId)
			);

		const userIdMap = new Map(
			(submissionsData || []).map((s) => [s.id, s.created_by])
		);

		await Promise.allSettled(
			batch.map(async (submission) => {
				try {
					// Get userId from submission if not provided
					const submissionUserId =
						userId || userIdMap.get(submission.submissionId) || null;

					console.log(`[backfillSummariesBatch] Processing submission ${submission.submissionId} (${submission.missingFiles.length} files to process)`);
					const result = await backfillSubmissionSummaries(
						supabase,
						submission.submissionId,
						submissionUserId,
						onFileProgress
					);

					processed++;
					if (result.success) {
						totalUpdated += result.filesUpdated;
						results.push({
							submissionId: submission.submissionId,
							success: true,
							filesUpdated: result.filesUpdated,
						});
					} else {
						totalFailed++;
						results.push({
							submissionId: submission.submissionId,
							success: false,
							filesUpdated: 0,
							error: result.errors.join('; '),
						});
					}

					if (onProgress) {
						onProgress({
							processed,
							total,
							updated: totalUpdated,
							failed: totalFailed,
						});
					}
				} catch (error: any) {
					processed++;
					totalFailed++;
					results.push({
						submissionId: submission.submissionId,
						success: false,
						filesUpdated: 0,
						error: error.message || String(error),
					});

					if (onProgress) {
						onProgress({
							processed,
							total,
							updated: totalUpdated,
							failed: totalFailed,
						});
					}
				}
			})
		);
	}

	return {
		totalProcessed: processed,
		totalUpdated,
		totalFailed,
		results,
	};
}
