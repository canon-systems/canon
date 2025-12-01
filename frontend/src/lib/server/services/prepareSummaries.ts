import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { getUserOctokit } from '../github/getUserOctokit';
import { parseRepoUrl } from '../github/github';
import { generateFileSummary } from './fileSummarizer';
import { createServiceRoleClient } from '../../supabase/server';

/**
 * Normalize repo URL to repo_id format: "github.com/owner/repo"
 * Preserves original case to match existing records in the database.
 * Queries use ilike for case-insensitive matching.
 */
function normalizeRepoId(repoUrl: string): string {
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		throw new Error(`Invalid repo URL: ${repoUrl}`);
	}
	return `github.com/${parsed.owner}/${parsed.repo}`;
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
 * Prepare file summaries for a submission
 * Returns counts of files prepared, updated, and skipped
 * 
 * OPTIMIZED: Uses bulk queries and parallel processing for speed
 */
export async function prepareFileSummaries(
	supabase: SupabaseClient,
	submissionId: string,
	regenerateAll: boolean = false,
	userId?: string | null,
	onFileProgress?: (filePath: string, status: 'processing' | 'completed' | 'skipped' | 'failed', error?: string) => void
): Promise<{ filesPrepared: number; filesUpdated: number; filesSkipped: number }> {
	const startTime = Date.now();
	
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
			`[prepareFileSummaries] Using ${filesToProcess.length} files from selected_files`
		);
	} else {
		filesToProcess = submissionFiles;
	}

	// OPTIMIZATION: Bulk load ALL existing summaries in ONE query
	console.log(`[prepareFileSummaries] Bulk loading existing summaries for ${filesToProcess.length} files...`);
	const { data: existingSummaries } = await supabase
		.from('repo_file_summaries')
		.select('file_path, file_hash')
		.ilike('repo_id', repoId)
		.eq('branch', branch)
		.in('file_path', filesToProcess.map(f => f.file_path));

	const existingSummaryMap = new Map<string, string | null>();
	for (const s of existingSummaries || []) {
		existingSummaryMap.set(s.file_path, s.file_hash);
	}

	// Determine which files need processing
	const filesToGenerate: Array<{ file_path: string; file_hash: string | null }> = [];
	let filesSkipped = 0;

	for (const submissionFile of filesToProcess) {
		const existingHash = existingSummaryMap.get(submissionFile.file_path);
		
		if (!regenerateAll && existingHash !== undefined && existingHash === submissionFile.file_hash) {
			// Summary exists with matching hash - skip
			filesSkipped++;
			onFileProgress?.(submissionFile.file_path, 'skipped');
		} else {
			// Needs to be generated
			filesToGenerate.push(submissionFile);
			onFileProgress?.(submissionFile.file_path, 'processing');
		}
	}

	console.log(`[prepareFileSummaries] ========== SUMMARY ANALYSIS ==========`);
	console.log(`[prepareFileSummaries] Total tracked files: ${filesToProcess.length}`);
	console.log(`[prepareFileSummaries] Already cached (unchanged): ${filesSkipped}`);
	console.log(`[prepareFileSummaries] Need generation (new/changed): ${filesToGenerate.length}`);
	if (filesToGenerate.length > 0) {
		console.log(`[prepareFileSummaries] Files to generate: ${filesToGenerate.map(f => f.file_path).join(', ')}`);
	}
	console.log(`[prepareFileSummaries] ======================================`);

	if (filesToGenerate.length === 0) {
		console.log(`[prepareFileSummaries] ✓ All files already have up-to-date summaries - no generation needed`);
		console.log(`[prepareFileSummaries] Total time: ${Date.now() - startTime}ms`);
		return {
			filesPrepared: filesToProcess.length,
			filesUpdated: 0,
			filesSkipped,
		};
	}

	// Get GitHub client
	const octokit = await getUserOctokit(supabase, userId || null);
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		throw new Error(`Invalid repo URL: ${repoUrl}`);
	}

	const { owner, repo } = parsed;

	// Get commit SHA
	let currentCommitSha: string;
	const codeSnapshot = submission.code_snapshot || {};

	if (codeSnapshot.commitSha) {
		currentCommitSha = codeSnapshot.commitSha;
	} else {
		const { data: branchData } = await octokit.repos.getBranch({ owner, repo, branch });
		currentCommitSha = branchData.commit.sha;
	}

	let filesUpdated = 0;
	const failedFiles: Array<{ path: string; error: string }> = [];

	// OPTIMIZATION: Process files in parallel batches
	const PARALLEL_BATCH_SIZE = 5; // Process 5 files at a time
	const batches: Array<Array<{ file_path: string; file_hash: string | null }>> = [];
	
	for (let i = 0; i < filesToGenerate.length; i += PARALLEL_BATCH_SIZE) {
		batches.push(filesToGenerate.slice(i, i + PARALLEL_BATCH_SIZE));
	}

	console.log(`[prepareFileSummaries] Processing ${filesToGenerate.length} files in ${batches.length} parallel batches...`);

	let batchIndex = 0;
	for (const batch of batches) {
		batchIndex++;
		console.log(`[prepareFileSummaries] Processing batch ${batchIndex}/${batches.length} (${batch.length} files)...`);
		
		const batchResults = await Promise.allSettled(
			batch.map(async (submissionFile) => {
				const filePath = submissionFile.file_path;
				const currentHash = submissionFile.file_hash;

				try {
					// Fetch file content from GitHub
					const { data: fileData } = await octokit.repos.getContent({
						owner,
						repo,
						path: filePath,
						ref: currentCommitSha,
					});

					let fileContent = '';
					if (!Array.isArray(fileData) && fileData.type === 'file' && fileData.content) {
						fileContent = fileData.encoding === 'base64'
							? Buffer.from(fileData.content, 'base64').toString('utf-8')
							: fileData.content;
					}

					if (!fileContent) {
						throw new Error(`No content found for file ${filePath}`);
					}

					// Generate summary
					const summary = await generateFileSummary(fileContent, filePath, 'gpt-4o-mini');

					// Upsert into repo_file_summaries
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
						throw new Error(`Failed to upsert: ${upsertError.message}`);
					}

					return { filePath, success: true };
				} catch (error: any) {
					return { filePath, success: false, error: error?.message || String(error) };
				}
			})
		);

		// Process batch results
		for (const result of batchResults) {
			if (result.status === 'fulfilled') {
				const { filePath, success, error } = result.value;
				if (success) {
					filesUpdated++;
					console.log(`[prepareFileSummaries] ✓ Generated summary for ${filePath}`);
					onFileProgress?.(filePath, 'completed');
				} else {
					failedFiles.push({ path: filePath, error: error || 'Unknown error' });
					console.error(`[prepareFileSummaries] ✗ Failed to generate summary for ${filePath}: ${error}`);
					onFileProgress?.(filePath, 'failed', error);
				}
			} else {
				// Promise rejected
				console.error('[prepareFileSummaries] Batch item rejected:', result.reason);
			}
		}
	}

	console.log(`[prepareFileSummaries] Completed. Updated: ${filesUpdated}, Skipped: ${filesSkipped}, Failed: ${failedFiles.length}. Total time: ${Date.now() - startTime}ms`);

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
	console.log(`[generateAndSaveFileSummaries] CALLED: repoUrl="${repoUrl}", branch="${branch}", files=${files?.length || 0}`);

	if (!repoUrl) {
		throw new Error('repoUrl is required');
	}

	if (!files || files.length === 0) {
		console.log(`[generateAndSaveFileSummaries] EARLY RETURN: no files to process`);
		return { filesProcessed: 0, filesUpdated: 0, filesSkipped: 0 };
	}

	const repoId = normalizeRepoId(repoUrl);
	console.log(`[generateAndSaveFileSummaries] Normalized repoId="${repoId}" from repoUrl="${repoUrl}"`);
	let filesUpdated = 0;
	let filesSkipped = 0;
	let filesProcessed = 0;

	// BULK LOAD all existing summaries for this repo/branch at once
	// Use service role client to bypass RLS policies
	const serviceClient = createServiceRoleClient();
	console.log(`[generateAndSaveFileSummaries] DEBUG: Loading summaries for repoId="${repoId}", branch="${branch}"`);
	let { data: existingSummaries } = await serviceClient
		.from('repo_file_summaries')
		.select('file_path, file_hash')
		.ilike('repo_id', repoId)
		.eq('branch', branch);

	console.log(`[generateAndSaveFileSummaries] DEBUG: Found ${existingSummaries?.length || 0} existing summaries for branch "${branch}"`);

	// If no summaries found for the current branch, try to find summaries from any branch
	// This handles cases where repo.default_branch changed or summaries were created with different branches
	if ((!existingSummaries || existingSummaries.length === 0) && branch !== 'main') {
		console.log(`[generateAndSaveFileSummaries] DEBUG: No summaries found for branch "${branch}", trying any branch...`);
		const { data: fallbackSummaries } = await serviceClient
			.from('repo_file_summaries')
			.select('file_path, file_hash')
			.ilike('repo_id', repoId);

		if (fallbackSummaries && fallbackSummaries.length > 0) {
			console.log(`[generateAndSaveFileSummaries] DEBUG: Found ${fallbackSummaries.length} summaries from any branch, using them`);
			existingSummaries = fallbackSummaries;
		}
	}

	if (existingSummaries && existingSummaries.length > 0) {
		console.log(`[generateAndSaveFileSummaries] DEBUG: Sample existing paths:`, existingSummaries.slice(0, 3).map(s => s.file_path));
	}

	// Create a lookup map for fast checking (normalize paths for consistent matching)
	const existingSummaryMap = new Map<string, string | null>();
	for (const summary of existingSummaries || []) {
		const normalizedPath = normalizeFilePath(summary.file_path);
		existingSummaryMap.set(normalizedPath, summary.file_hash);
	}

	console.log(`[generateAndSaveFileSummaries] DEBUG: Created lookup map with ${existingSummaryMap.size} entries`);

	// Process files in parallel batches to avoid blocking, but limit concurrency
	console.log(`[generateAndSaveFileSummaries] Starting to process ${files.length} files...`);
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

				filesProcessed++;

				try {
					// Check if summary exists and hash matches using bulk-loaded map
					const normalizedFilePath = normalizeFilePath(filePath);
					const existingHash = existingSummaryMap.get(normalizedFilePath);

					if (filesProcessed <= 5) { // Debug first 5 files
						console.log(`[generateAndSaveFileSummaries] DEBUG: File "${filePath}" -> normalized "${normalizedFilePath}", currentHash="${fileHash?.substring(0, 8)}...", existingHash="${existingHash?.substring(0, 8)}..."`);
					}

					if (existingHash !== undefined && existingHash === fileHash) {
						filesSkipped++;
						if (filesProcessed <= 5) {
							console.log(`[generateAndSaveFileSummaries] DEBUG: SKIPPING ${filePath} - hash matches`);
						}
						return;
					}

					if (filesProcessed <= 5) {
						console.log(`[generateAndSaveFileSummaries] DEBUG: GENERATING ${filePath} - ${existingHash === undefined ? 'no existing summary' : 'hash mismatch'}`);
					}

					// Generate summary
					const summary = await generateFileSummary(fileContent, filePath, model);

					// Calculate hash if not provided using SHA-256
					const finalHash = fileHash || createHash('sha256').update(fileContent).digest('hex');

					// Upsert into repo_file_summaries using RPC function to bypass RLS
					const { error: upsertError } = await serviceClient.rpc('upsert_repo_file_summary', {
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

	console.log(`[generateAndSaveFileSummaries] COMPLETED: processed=${files.length}, updated=${filesUpdated}, skipped=${filesSkipped}`);

	return {
		filesProcessed: files.length,
		filesUpdated,
		filesSkipped,
	};
}

