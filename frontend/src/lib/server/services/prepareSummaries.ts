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
 * Prepare file summaries for a document
 * Returns counts of files prepared, updated, and skipped
 * 
 * OPTIMIZED: Uses bulk queries and parallel processing for speed
 */
export async function prepareFileSummaries(
	supabase: SupabaseClient,
	documentId: string,
	regenerateAll: boolean = false,
	userId: string,
	onFileProgress?: (filePath: string, status: 'processing' | 'completed' | 'skipped' | 'failed', error?: string) => void
): Promise<{ filesPrepared: number; filesUpdated: number; filesSkipped: number }> {
	const startTime = Date.now();

	// Load document
	const { data: document, error: docError } = await supabase
		.from('documents')
		.select('id, repo_id')
		.eq('id', documentId)
		.single();

	if (docError || !document) {
		throw new Error(`Document not found: ${documentId}`);
	}

	// Get repo details to get repo_url and branch
	const { data: repo, error: repoError } = await supabase
		.from('workspace_repos')
		.select('repo_url, default_branch')
		.eq('id', document.repo_id)
		.single();

	if (repoError || !repo) {
		throw new Error(`Repository not found for document: ${documentId}`);
	}

	const repoUrl = repo.repo_url;
	const branch = repo.default_branch || 'main';
	const repoId = normalizeRepoId(repoUrl);

	// Load tracked files from document_files
	const { data: documentFiles, error: filesError } = await supabase
		.from('document_files')
		.select('file_path')
		.eq('document_id', documentId);

	if (filesError) {
		throw new Error(`Failed to load document files: ${filesError.message}`);
	}

	// Get file hashes from repo_file_summaries
	let filesToProcess: Array<{ file_path: string; file_hash: string | null }> = [];

	if (!documentFiles || documentFiles.length === 0) {
		return { filesPrepared: 0, filesUpdated: 0, filesSkipped: 0 };
	}

	// Get hashes for these files from repo_file_summaries
	const filePaths = documentFiles.map(df => df.file_path);
	const { data: summaries } = await supabase
		.from('repo_file_summaries')
		.select('file_path, file_hash')
		.ilike('repo_id', repoId)
		.eq('branch', branch)
		.in('file_path', filePaths);

	const hashMap = new Map<string, string | null>();
	summaries?.forEach(s => hashMap.set(s.file_path, s.file_hash));

	filesToProcess = documentFiles.map(df => ({
		file_path: df.file_path,
		file_hash: hashMap.get(df.file_path) || null,
	}));

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

	console.log(`[prepareFileSummaries] 📊 Summary: ${filesToProcess.length} tracked files, ${filesSkipped} cached, ${filesToGenerate.length} need generation`);

	if (filesToGenerate.length === 0) {
		console.log(`[prepareFileSummaries] ✅ All files already have up-to-date summaries`);
		return {
			filesPrepared: filesToProcess.length,
			filesUpdated: 0,
			filesSkipped,
		};
	}

	// Get GitHub client
	const octokit = await getUserOctokit(supabase, userId);
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		throw new Error(`Invalid repo URL: ${repoUrl}`);
	}

	const { owner, repo: repoName } = parsed;

	// Get commit SHA from branch
	let currentCommitSha: string;
	const { data: branchData } = await octokit.repos.getBranch({ owner, repo: repoName, branch });
	currentCommitSha = branchData.commit.sha;

	let filesUpdated = 0;
	const failedFiles: Array<{ path: string; error: string }> = [];

	// OPTIMIZATION: Process files in parallel batches
	const PARALLEL_BATCH_SIZE = 5; // Process 5 files at a time
	const batches: Array<Array<{ file_path: string; file_hash: string | null }>> = [];

	for (let i = 0; i < filesToGenerate.length; i += PARALLEL_BATCH_SIZE) {
		batches.push(filesToGenerate.slice(i, i + PARALLEL_BATCH_SIZE));
	}

	console.log(`[prepareFileSummaries] 🔄 Processing ${filesToGenerate.length} files in ${batches.length} batches...`);

	for (const batch of batches) {

		const batchResults = await Promise.allSettled(
			batch.map(async (submissionFile) => {
				const filePath = submissionFile.file_path;
				const currentHash = submissionFile.file_hash;

				try {
					// Fetch file content from GitHub
					const { data: fileData } = await octokit.repos.getContent({
						owner,
						repo: repoName,
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
						// p_submission_id omitted - submissions table no longer exists
						p_branch: branch,
					});

					if (upsertError) {
						throw new Error(`Failed to upsert: ${upsertError.message}`);
					}

					return { filePath, success: true };
				} catch (error: any) {
					let errorMessage = error?.message || String(error);

					// Provide more user-friendly error messages
					if (errorMessage.includes('rate limit')) {
						errorMessage = 'GitHub API rate limit exceeded';
					} else if (errorMessage.includes('timeout')) {
						errorMessage = 'Request timed out';
					} else if (errorMessage.includes('authentication') || errorMessage.includes('token')) {
						errorMessage = 'Authentication failed';
					} else if (errorMessage.includes('LLM') || errorMessage.includes('model')) {
						errorMessage = 'LLM error - check API configuration';
					}

					return { filePath, success: false, error: errorMessage };
				}
			})
		);

		// Process batch results
		for (const result of batchResults) {
			if (result.status === 'fulfilled') {
				const { filePath, success, error } = result.value;
				if (success) {
					filesUpdated++;
					onFileProgress?.(filePath, 'completed');
				} else {
					failedFiles.push({ path: filePath, error: error || 'Unknown error' });
					console.error(`[prepareFileSummaries] ❌ Failed: ${filePath} - ${error}`);
					onFileProgress?.(filePath, 'failed', error);
				}
			} else {
				// Promise rejected
				console.error('[prepareFileSummaries] Batch item rejected:', result.reason);
			}
		}
	}

	console.log(`[prepareFileSummaries] ✅ Completed: ${filesUpdated} updated, ${filesSkipped} skipped${failedFiles.length > 0 ? `, ${failedFiles.length} failed` : ''}`);

	if (failedFiles.length > 0) {
		console.log(`[prepareFileSummaries] ❌ Failed files:`);
		failedFiles.forEach(failure => {
			console.log(`   • ${failure.path}: ${failure.error}`);
		});
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
	branch: string = 'main',
	onProgress?: (processed: number, total: number, currentFile?: string, status?: string, progressPercent?: number, processingRate?: number, estimatedTimeRemaining?: number, recentFiles?: any[]) => Promise<void>
): Promise<{ filesProcessed: number; filesUpdated: number; filesSkipped: number }> {
	if (!repoUrl) {
		throw new Error('repoUrl is required');
	}

	if (!files || files.length === 0) {
		console.log(`[generateAndSaveFileSummaries] No files to process`);
		return { filesProcessed: 0, filesUpdated: 0, filesSkipped: 0 };
	}

	const repoId = normalizeRepoId(repoUrl);
	console.log(`[generateAndSaveFileSummaries] Processing ${files.length} files for ${repoId} (${branch})`);

	let filesUpdated = 0;
	let filesSkipped = 0;
	let filesProcessed = 0;

	// Load existing summaries for this repo/branch
	const serviceClient = createServiceRoleClient();
	let { data: existingSummaries } = await serviceClient
		.from('repo_file_summaries')
		.select('file_path, file_hash')
		.ilike('repo_id', repoId)
		.eq('branch', branch);

	// If no summaries found for the current branch, try to find summaries from any branch
	if ((!existingSummaries || existingSummaries.length === 0) && branch !== 'main') {
		const { data: fallbackSummaries } = await serviceClient
			.from('repo_file_summaries')
			.select('file_path, file_hash')
			.ilike('repo_id', repoId);

		if (fallbackSummaries && fallbackSummaries.length > 0) {
			existingSummaries = fallbackSummaries;
		}
	}

	// Create a lookup map for fast checking (normalize paths for consistent matching)
	const existingSummaryMap = new Map<string, string | null>();
	for (const summary of existingSummaries || []) {
		const normalizedPath = normalizeFilePath(summary.file_path);
		existingSummaryMap.set(normalizedPath, summary.file_hash);
	}

	console.log(`[generateAndSaveFileSummaries] Found ${existingSummaryMap.size} cached summaries, processing ${files.length} files...`);

	// Track recent files for progress updates
	const recentFiles: Array<{ path: string; status: 'completed' | 'skipped' | 'processing'; timestamp: number }> = [];
	let processingStartTime = Date.now();
	let filesProcessedSinceStart = 0;

	// Initial progress update
	if (onProgress) {
		await onProgress(0, files.length, undefined, 'starting', 0, 0, undefined, []);
	}

	const BATCH_SIZE = 5;
	const batches: Array<Array<{ path: string; content: string; hash?: string | null }>> = [];
	for (let i = 0; i < files.length; i += BATCH_SIZE) {
		batches.push(files.slice(i, i + BATCH_SIZE));
	}

	// Process batches sequentially, but files within each batch in parallel
	for (const batch of batches) {
		// Update progress before starting batch
		const progressPercent = Math.min(95, 20 + ((filesProcessed + filesSkipped) / files.length) * 75);
		const processingRate = filesProcessedSinceStart > 0 ? (filesProcessedSinceStart / ((Date.now() - processingStartTime) / 1000 / 60)) : 0;
		const remainingFiles = files.length - (filesProcessed + filesSkipped);
		const estimatedTimeRemaining = processingRate > 0 ? (remainingFiles / processingRate) * 60 : undefined;

		if (onProgress) {
			await onProgress(filesProcessed + filesSkipped, files.length, batch[0]?.path, 'processing_batch', progressPercent, processingRate, estimatedTimeRemaining, [...recentFiles]);
		}

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
				filesProcessedSinceStart++;

				// Update recent files
				const existingIndex = recentFiles.findIndex(f => f.path === filePath);
				if (existingIndex >= 0) {
					recentFiles.splice(existingIndex, 1);
				}
				recentFiles.unshift({
					path: filePath,
					status: 'processing' as const,
					timestamp: Date.now()
				});
				if (recentFiles.length > 10) {
					recentFiles.splice(10);
				}

				// Update progress for current file
				const currentProgressPercent = Math.min(95, 20 + ((filesProcessed + filesSkipped) / files.length) * 75);
				const currentProcessingRate = filesProcessedSinceStart > 0 ? (filesProcessedSinceStart / ((Date.now() - processingStartTime) / 1000 / 60)) : 0;
				const currentRemainingFiles = files.length - (filesProcessed + filesSkipped);
				const currentEstimatedTimeRemaining = currentProcessingRate > 0 ? (currentRemainingFiles / currentProcessingRate) * 60 : undefined;

				if (onProgress) {
					await onProgress(filesProcessed + filesSkipped, files.length, filePath, 'processing_file', currentProgressPercent, currentProcessingRate, currentEstimatedTimeRemaining, [...recentFiles]);
				}

				try {
					// Check if summary exists and hash matches using bulk-loaded map
					const normalizedFilePath = normalizeFilePath(filePath);
					const existingHash = existingSummaryMap.get(normalizedFilePath);

					if (existingHash !== undefined && existingHash === fileHash) {
						filesSkipped++;
						// Update recent files status
						const fileIndex = recentFiles.findIndex(f => f.path === filePath);
						if (fileIndex >= 0) {
							recentFiles[fileIndex].status = 'skipped';
						}

						// Update progress for skipped file
						const skippedProgressPercent = Math.min(95, 20 + ((filesProcessed + filesSkipped) / files.length) * 75);
						const skippedProcessingRate = filesProcessedSinceStart > 0 ? (filesProcessedSinceStart / ((Date.now() - processingStartTime) / 1000 / 60)) : 0;
						const skippedRemainingFiles = files.length - (filesProcessed + filesSkipped);
						const skippedEstimatedTimeRemaining = skippedProcessingRate > 0 ? (skippedRemainingFiles / skippedProcessingRate) * 60 : undefined;

						if (onProgress) {
							await onProgress(filesProcessed + filesSkipped, files.length, filePath, 'file_skipped', skippedProgressPercent, skippedProcessingRate, skippedEstimatedTimeRemaining, [...recentFiles]);
						}
						return;
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
						// p_submission_id omitted - submissions table no longer exists
						p_branch: branch,
					});

					if (upsertError) {
						console.error(`Failed to upsert summary for ${filePath}:`, upsertError);
						return;
					}

					filesUpdated++;

					// Update recent files status
					const fileIndex = recentFiles.findIndex(f => f.path === filePath);
					if (fileIndex >= 0) {
						recentFiles[fileIndex].status = 'completed';
					}

					// Update progress for completed file
					const completedProgressPercent = Math.min(95, 20 + ((filesProcessed + filesSkipped) / files.length) * 75);
					const completedProcessingRate = filesProcessedSinceStart > 0 ? (filesProcessedSinceStart / ((Date.now() - processingStartTime) / 1000 / 60)) : 0;
					const completedRemainingFiles = files.length - (filesProcessed + filesSkipped);
					const completedEstimatedTimeRemaining = completedProcessingRate > 0 ? (completedRemainingFiles / completedProcessingRate) * 60 : undefined;

					if (onProgress) {
						await onProgress(filesProcessed + filesSkipped, files.length, filePath, 'file_completed', completedProgressPercent, completedProcessingRate, completedEstimatedTimeRemaining, [...recentFiles]);
					}
				} catch (error: any) {
					console.error(`Error generating summary for ${filePath}:`, error);
					// Continue processing other files
				}
			})
		);
	}

	console.log(`[generateAndSaveFileSummaries] ✅ Completed: ${filesUpdated} generated, ${filesSkipped} cached, ${files.length} total files`);

	return {
		filesProcessed: files.length,
		filesUpdated,
		filesSkipped,
	};
}

