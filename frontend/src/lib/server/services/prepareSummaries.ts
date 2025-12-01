import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { getUserOctokit } from '../github/getUserOctokit';
import { parseRepoUrl } from '../github/github';
import { generateFileSummary } from './fileSummarizer';

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
 * Prepare file summaries for a submission
 * Returns counts of files prepared, updated, and skipped
 */
export async function prepareFileSummaries(
	supabase: SupabaseClient,
	submissionId: string,
	regenerateAll: boolean = false,
	userId?: string | null,
	onFileProgress?: (filePath: string, status: 'processing' | 'completed' | 'skipped' | 'failed', error?: string) => void
): Promise<{ filesPrepared: number; filesUpdated: number; filesSkipped: number }> {
	// Load submission
	const { data: submission, error: subError } = await supabase
		.from('submissions')
		.select('*')
		.eq('id', submissionId)
		.single();

	if (subError || !submission) {
		throw new Error(`Submission not found: ${submissionId}`);
	}

	const sourceMeta = submission.source_meta || {};
	const repoUrl = sourceMeta.repoUrl;

	if (!repoUrl) {
		throw new Error('Submission must have a repoUrl in source_meta');
	}

	const repoId = normalizeRepoId(repoUrl);
	const branch = sourceMeta.branch || 'main';

	// Load tracked files from submission_files
	const { data: submissionFiles, error: filesError } = await supabase
		.from('submission_files')
		.select('file_path, file_hash')
		.eq('submission_id', submissionId);

	if (filesError) {
		throw new Error(`Failed to load submission files: ${filesError.message}`);
	}

	// If submission_files is empty, fallback to selected_files from submissions table
	let filesToProcess: Array<{ file_path: string; file_hash: string | null }> = [];

	if (!submissionFiles || submissionFiles.length === 0) {
		// Fallback: use selected_files from submissions table and code_snapshot for hashes
		const selectedFiles = submission.selected_files || [];
		const codeSnapshot = submission.code_snapshot || {};
		const fileShas = codeSnapshot.fileShas || {};

		if (selectedFiles.length === 0) {
			return { filesPrepared: 0, filesUpdated: 0, filesSkipped: 0 };
		}

		// Convert selected_files to the same format as submission_files
		filesToProcess = selectedFiles.map((filePath: string) => ({
			file_path: filePath,
			file_hash: fileShas[filePath] || null,
		}));

		console.log(
			`prepareFileSummaries: submission_files empty for ${submissionId}, using ${filesToProcess.length} files from selected_files`
		);
	} else {
		filesToProcess = submissionFiles;
	}

	// Get GitHub client
	const octokit = await getUserOctokit(supabase, userId || null);
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		throw new Error(`Invalid repo URL: ${repoUrl}`);
	}

	const { owner, repo } = parsed;

	// Try to use commit SHA from code_snapshot first, fallback to fetching branch
	let currentCommitSha: string;
	const codeSnapshot = submission.code_snapshot || {};

	if (codeSnapshot.commitSha) {
		currentCommitSha = codeSnapshot.commitSha;
		console.log(`Using commit SHA from code_snapshot: ${currentCommitSha}`);
	} else {
		try {
			// Get current commit SHA from branch
			const { data: branchData } = await octokit.repos.getBranch({
				owner,
				repo,
				branch,
			});
			currentCommitSha = branchData.commit.sha;
			console.log(`Fetched commit SHA from branch ${branch}: ${currentCommitSha}`);
		} catch (branchError: any) {
			const errorMsg = branchError?.message || String(branchError);
			const status = branchError?.status || branchError?.response?.status;
			throw new Error(
				`Failed to get commit SHA for branch ${branch} in ${repoUrl}. ` +
				`Error: ${errorMsg}${status ? ` (Status: ${status})` : ''}. ` +
				`Make sure you have GitHub connected and access to this repository.`
			);
		}
	}

	let filesUpdated = 0;
	let filesSkipped = 0;
	const failedFiles: Array<{ path: string; error: string }> = [];

	// Helper function to retry with exponential backoff and rate limit handling
	async function fetchFileWithRetry(
		filePath: string,
		maxRetries: number = 3
	): Promise<string> {
		let lastError: any = null;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				// Add delay between requests to avoid rate limits (except first attempt)
				if (attempt > 0) {
					const delay = Math.min(1000 * Math.pow(2, attempt - 1), 60000); // Max 60s
					console.log(`Retrying fetch for ${filePath} after ${delay}ms delay (attempt ${attempt + 1}/${maxRetries})`);
					await new Promise(resolve => setTimeout(resolve, delay));
				} else if (filesUpdated + filesSkipped > 0) {
					// Add small delay between files to avoid hitting rate limits
					await new Promise(resolve => setTimeout(resolve, 200));
				}

				const { data: fileData } = await octokit.repos.getContent({
					owner,
					repo,
					path: filePath,
					ref: currentCommitSha,
				});

				if (!Array.isArray(fileData) && fileData.type === 'file' && fileData.content) {
					if (fileData.encoding === 'base64') {
						return Buffer.from(fileData.content, 'base64').toString('utf-8');
					} else if (typeof fileData.content === 'string') {
						return fileData.content;
					}
				}

				throw new Error(`Invalid file data structure for ${filePath}`);
			} catch (fetchError: any) {
				lastError = fetchError;
				const status = fetchError?.status || fetchError?.response?.status;
				const isRateLimit = status === 403 || status === 429;
				const errorMessage = fetchError?.message || String(fetchError);

				// If rate limited, wait longer before retry
				if (isRateLimit && attempt < maxRetries - 1) {
					const resetTime = fetchError?.response?.headers?.['x-ratelimit-reset'];
					if (resetTime) {
						const resetDate = new Date(parseInt(resetTime) * 1000);
						const waitTime = Math.max(resetDate.getTime() - Date.now(), 60000); // At least 60s
						console.log(`Rate limit hit for ${filePath}. Waiting until ${resetDate.toISOString()} (${Math.round(waitTime / 1000)}s)`);
						await new Promise(resolve => setTimeout(resolve, waitTime));
					} else {
						// No reset time, wait exponential backoff
						const waitTime = Math.min(60000 * Math.pow(2, attempt), 300000); // Max 5 minutes
						console.log(`Rate limit hit for ${filePath}. Waiting ${Math.round(waitTime / 1000)}s before retry`);
						await new Promise(resolve => setTimeout(resolve, waitTime));
					}
					continue; // Retry
				}

				// If not rate limit or last attempt, throw
				if (!isRateLimit || attempt === maxRetries - 1) {
					throw fetchError;
				}
			}
		}

		throw lastError || new Error(`Failed to fetch ${filePath} after ${maxRetries} attempts`);
	}

	// Process each file - ENSURE ALL FILES HAVE SUMMARIES
	for (const submissionFile of filesToProcess) {
		const filePath = submissionFile.file_path;
		const currentHash = submissionFile.file_hash;

		try {
			// Log and notify that we're processing this file
			console.log(`[prepareFileSummaries] Processing file: ${filePath} (submission: ${submissionId})`);
			onFileProgress?.(filePath, 'processing');

			// Check if summary exists in repo_file_summaries
			// Use ilike for case-insensitive repo_id matching since GitHub URLs are case-insensitive
			const { data: existingSummary } = await supabase
				.from('repo_file_summaries')
				.select('file_hash')
				.ilike('repo_id', repoId)
				.eq('file_path', filePath)
				.eq('branch', branch)
				.single();

			// Skip if exists and hash matches (unless regenerateAll is true)
			if (existingSummary && existingSummary.file_hash === currentHash && !regenerateAll) {
				console.log(`[prepareFileSummaries] Skipping ${filePath} - summary already exists with matching hash`);
				filesSkipped++;
				onFileProgress?.(filePath, 'skipped');
				continue;
			}

			// Fetch file content from GitHub with retry logic
			console.log(`[prepareFileSummaries] Fetching content for ${filePath} from GitHub...`);
			let fileContent = '';
			try {
				fileContent = await fetchFileWithRetry(filePath);
				console.log(`[prepareFileSummaries] Successfully fetched ${filePath} (${fileContent.length} bytes)`);
			} catch (fetchError: any) {
				const errorMsg = `Failed to fetch file ${filePath} from GitHub: ${fetchError?.message || fetchError}`;
				const status = fetchError?.status || fetchError?.response?.status;
				const isRateLimit = status === 403 || status === 429;

				if (isRateLimit) {
					// Rate limit error - throw to stop processing and let user know
					console.error(`[prepareFileSummaries] Rate limit error for ${filePath}:`, errorMsg);
					onFileProgress?.(filePath, 'failed', errorMsg);
					throw new Error(
						`GitHub API rate limit exceeded while processing ${filePath}. ` +
						`Please wait a few minutes and try again, or reduce the batch size. ` +
						`If you have a GitHub connection, make sure it's active for higher rate limits.`
					);
				}

				console.error(`[prepareFileSummaries] Fetch error for ${filePath}:`, errorMsg);
				failedFiles.push({ path: filePath, error: errorMsg });
				onFileProgress?.(filePath, 'failed', errorMsg);
				continue; // Continue processing other files, but track failure
			}

			if (!fileContent) {
				const errorMsg = `No content found for file ${filePath}`;
				console.error(`[prepareFileSummaries] ${errorMsg}`);
				failedFiles.push({ path: filePath, error: errorMsg });
				onFileProgress?.(filePath, 'failed', errorMsg);
				continue; // Continue processing other files, but track failure
			}

			// Generate summary - REQUIRED, no skipping
			console.log(`[prepareFileSummaries] Generating summary for ${filePath}...`);
			const summary = await generateFileSummary(fileContent, filePath, 'gpt-4o-mini');
			console.log(`[prepareFileSummaries] Successfully generated summary for ${filePath}`);

			// Upsert into repo_file_summaries using RPC function to bypass RLS
			// This ensures the operation succeeds even if RLS policies have issues
			// Pass submissionId to verify access directly
			const { error: upsertError } = await supabase.rpc('upsert_repo_file_summary', {
				p_repo_id: repoId,
				p_file_path: filePath,
				p_file_hash: currentHash,
				p_summary_text: summary.summary_text,
				p_summary_json: summary.summary_json,
				p_summary_model: 'gpt-4o-mini',
				p_user_id: userId || null,
				p_submission_id: submissionId || null,
				p_branch: branch,
			});

			if (upsertError) {
				const errorMsg = `Failed to upsert summary for ${filePath}: ${upsertError.message}`;
				console.error(`[prepareFileSummaries] ${errorMsg}`);
				failedFiles.push({ path: filePath, error: errorMsg });
				onFileProgress?.(filePath, 'failed', errorMsg);
				continue; // Continue processing other files, but track failure
			}

			console.log(`[prepareFileSummaries] Successfully saved summary for ${filePath}`);
			filesUpdated++;
			onFileProgress?.(filePath, 'completed');
		} catch (error: any) {
			const errorMsg = `Error processing file ${filePath}: ${error?.message || error}`;
			console.error(`[prepareFileSummaries] ${errorMsg}`, error);
			failedFiles.push({ path: filePath, error: errorMsg });
			onFileProgress?.(filePath, 'failed', errorMsg);
			// Continue processing other files, but track failure
		}
	}

	// Verify ALL files have summaries - if any are missing, generate them
	// Use ilike for case-insensitive repo_id matching
	const { data: allSummaries } = await supabase
		.from('repo_file_summaries')
		.select('file_path')
		.ilike('repo_id', repoId)
		.eq('branch', branch)
		.in('file_path', filesToProcess.map(f => f.file_path));

	const filesWithSummaries = new Set((allSummaries || []).map(s => s.file_path));
	const missingSummaries = filesToProcess
		.map(f => f.file_path)
		.filter(path => !filesWithSummaries.has(path));

	// If any files are missing summaries, generate them now
	if (missingSummaries.length > 0) {
		console.log(`Generating summaries for ${missingSummaries.length} missing file(s): ${missingSummaries.join(', ')}`);

		// Retry generating summaries for missing files
		for (const filePath of missingSummaries) {
			const submissionFile = filesToProcess.find(f => f.file_path === filePath);
			if (!submissionFile) continue;

			const currentHash = submissionFile.file_hash;

			try {
				// Fetch file content from GitHub with retry logic
				let fileContent = '';
				try {
					fileContent = await fetchFileWithRetry(filePath);
				} catch (fetchError: any) {
					const status = fetchError?.status || fetchError?.response?.status;
					const isRateLimit = status === 403 || status === 429;

					if (isRateLimit) {
						console.error(`Rate limit hit while retrying ${filePath}, skipping for now`);
						continue; // Skip this file but continue with others
					}

					console.error(`Failed to fetch file ${filePath} from GitHub:`, fetchError);
					continue; // Skip this file but continue with others
				}

				if (!fileContent) {
					console.error(`No content found for file ${filePath}`);
					continue; // Skip this file but continue with others
				}

				// Generate summary
				const summary = await generateFileSummary(fileContent, filePath, 'gpt-4o-mini');

				// Upsert into repo_file_summaries using RPC function to bypass RLS
				const { error: upsertError } = await supabase.rpc('upsert_repo_file_summary', {
					p_repo_id: repoId,
					p_file_path: filePath,
					p_file_hash: currentHash,
					p_summary_text: summary.summary_text,
					p_summary_json: summary.summary_json,
					p_summary_model: 'gpt-4o-mini',
					p_user_id: userId || null,
					p_submission_id: submissionId || null,
					p_branch: branch,
				});

				if (upsertError) {
					console.error(`Failed to upsert summary for ${filePath}:`, upsertError);
					continue; // Skip this file but continue with others
				}

				filesUpdated++;
				// Remove from failed files if it was there
				const failedIndex = failedFiles.findIndex(f => f.path === filePath);
				if (failedIndex >= 0) {
					failedFiles.splice(failedIndex, 1);
				}
			} catch (error: any) {
				console.error(`Error generating summary for ${filePath}:`, error);
				// Continue with next file
			}
		}

		// Final verification - check again after retry
		// Use ilike for case-insensitive repo_id matching
		const { data: finalSummaries } = await supabase
			.from('repo_file_summaries')
			.select('file_path')
			.ilike('repo_id', repoId)
			.eq('branch', branch)
			.in('file_path', filesToProcess.map(f => f.file_path));

		const finalFilesWithSummaries = new Set((finalSummaries || []).map(s => s.file_path));
		const stillMissing = filesToProcess
			.map(f => f.file_path)
			.filter(path => !finalFilesWithSummaries.has(path));

		if (stillMissing.length > 0) {
			// Log warning but don't throw - we'll let docGenerator handle it
			console.warn(
				`Unable to generate summaries for ${stillMissing.length} file(s) after retry: ${stillMissing.join(', ')}`
			);
		}
	}

	return {
		filesPrepared: filesToProcess.length,
		filesUpdated,
		filesSkipped,
	};
}

/**
 * Generate and save file summaries directly from file paths and content
 * This function doesn't require submission_files to be populated first
 * It's designed to be called during documentation generation to ensure
 * summaries are saved for all files used in the documentation
 */
export async function generateAndSaveFileSummaries(
	supabase: SupabaseClient,
	repoUrl: string,
	files: Array<{ path: string; content: string; hash?: string | null }>,
	userId?: string | null,
	model: string = 'gpt-4o-mini',
	submissionId?: string | null,
	branch: string = 'main'
): Promise<{ filesProcessed: number; filesUpdated: number; filesSkipped: number }> {
	if (!repoUrl) {
		throw new Error('repoUrl is required');
	}

	if (!files || files.length === 0) {
		return { filesProcessed: 0, filesUpdated: 0, filesSkipped: 0 };
	}

	const repoId = normalizeRepoId(repoUrl);
	let filesUpdated = 0;
	let filesSkipped = 0;

	// Process files in parallel batches to avoid blocking, but limit concurrency
	const BATCH_SIZE = 5;
	const batches: Array<Array<{ path: string; content: string; hash?: string | null }>> = [];
	for (let i = 0; i < files.length; i += BATCH_SIZE) {
		batches.push(files.slice(i, i + BATCH_SIZE));
	}

	// Process batches sequentially, but files within each batch in parallel
	for (const batch of batches) {
		await Promise.all(
			batch.map(async (file) => {
				const filePath = file.path;
				const fileContent = file.content;
				const fileHash = file.hash || null;

				if (!fileContent) {
					console.warn(`No content provided for file ${filePath}, skipping summary generation`);
					return;
				}

				try {
					// Check if summary exists and hash matches
					// Use ilike for case-insensitive repo_id matching
					if (fileHash) {
						const { data: existingSummary } = await supabase
							.from('repo_file_summaries')
							.select('file_hash')
							.ilike('repo_id', repoId)
							.eq('file_path', filePath)
							.eq('branch', branch)
							.single();

						// Skip if exists and hash matches
						if (existingSummary && existingSummary.file_hash === fileHash) {
							filesSkipped++;
							return;
						}
					}

					// Generate summary
					const summary = await generateFileSummary(fileContent, filePath, model);

					// Calculate hash if not provided using SHA-256
					const finalHash = fileHash || createHash('sha256').update(fileContent).digest('hex');

					// Upsert into repo_file_summaries using RPC function to bypass RLS
					const { error: upsertError } = await supabase.rpc('upsert_repo_file_summary', {
						p_repo_id: repoId,
						p_file_path: filePath,
						p_file_hash: finalHash,
						p_summary_text: summary.summary_text,
						p_summary_json: summary.summary_json,
						p_summary_model: model,
						p_user_id: userId || null,
						p_submission_id: submissionId || null,
						p_branch: branch,
					});

					if (upsertError) {
						console.error(`Failed to upsert summary for ${filePath}:`, upsertError);
						return;
					}

					filesUpdated++;
				} catch (error: any) {
					console.error(`Error generating summary for ${filePath}:`, error);
					// Continue processing other files
				}
			})
		);
	}

	return {
		filesProcessed: files.length,
		filesUpdated,
		filesSkipped,
	};
}

