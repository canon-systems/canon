import type { SupabaseClient } from '@supabase/supabase-js';
import { parseRepoUrl } from '../github/github';
import { analyzeRepository } from './analyzeRepository';
import { generateFileSummary } from './fileSummarizer';

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
 * Prepare file summaries for an entire repository
 * Returns counts of files processed, updated, and skipped
 */
export async function prepareRepoSummaries(
	supabase: SupabaseClient,
	repoUrl: string,
	branch: string,
	userId: string,
	options?: { fullScan?: boolean; subdir?: string }
): Promise<{ filesProcessed: number; filesUpdated: number; filesSkipped: number }> {
	const repoId = normalizeRepoId(repoUrl);
	const fullScan = options?.fullScan || false;
	const subdir = options?.subdir || null;

	// Use analyzeRepository to get all files
	const analysis = await analyzeRepository({
		supabase,
		userId,
		repoUrl,
		branch,
		subdir,
		filters: null,
	});

	if (!analysis.rawFiles || analysis.rawFiles.length === 0) {
		return { filesProcessed: 0, filesUpdated: 0, filesSkipped: 0 };
	}

	const fileShas = analysis.snapshot.fileShas || {};
	let filesUpdated = 0;
	let filesSkipped = 0;
	const failedFiles: Array<{ path: string; error: string }> = [];

	// OPTIMIZATION: Bulk load ALL existing summaries in ONE query (instead of one-by-one)
	console.log(`[prepareRepoSummaries] Bulk loading existing summaries for ${analysis.rawFiles.length} files...`);
	const { data: existingSummaries } = await supabase
		.from('repo_file_summaries')
		.select('file_path, file_hash')
		.ilike('repo_id', repoId)
		.eq('branch', branch)
		.in('file_path', analysis.rawFiles.map(f => f.path));

	const existingSummaryMap = new Map<string, string | null>();
	for (const s of existingSummaries || []) {
		existingSummaryMap.set(s.file_path, s.file_hash);
	}
	console.log(`[prepareRepoSummaries] Found ${existingSummaryMap.size} existing summaries in database`);

	// Determine which files need processing based on hash comparison
	const filesToGenerate: Array<{ path: string; content: string; hash: string }> = [];
	const skippedFiles: string[] = [];

	for (const file of analysis.rawFiles) {
		const filePath = file.path;
		const currentHash = fileShas[filePath] || null;

		if (!currentHash) {
			const errorMsg = `No hash found for file ${filePath}`;
			console.error(errorMsg);
			failedFiles.push({ path: filePath, error: errorMsg });
			continue;
		}

		const existingHash = existingSummaryMap.get(filePath);
		
		// Skip if exists and hash matches (unless fullScan is true)
		if (!fullScan && existingHash !== undefined && existingHash === currentHash) {
			filesSkipped++;
			skippedFiles.push(filePath);
		} else {
			filesToGenerate.push({ path: filePath, content: file.content, hash: currentHash });
		}
	}

	console.log(`[prepareRepoSummaries] ========== SUMMARY ANALYSIS ==========`);
	console.log(`[prepareRepoSummaries] Total files: ${analysis.rawFiles.length}`);
	console.log(`[prepareRepoSummaries] Already cached (unchanged): ${filesSkipped}`);
	console.log(`[prepareRepoSummaries] Need generation (new/changed): ${filesToGenerate.length}`);
	if (filesToGenerate.length > 0) {
		console.log(`[prepareRepoSummaries] Files to generate: ${filesToGenerate.map(f => f.path).join(', ')}`);
	}
	console.log(`[prepareRepoSummaries] ======================================`);

	// Process files that need generation in parallel batches
	if (filesToGenerate.length > 0) {
		const PARALLEL_BATCH_SIZE = 5;
		const batches: Array<Array<{ path: string; content: string; hash: string }>> = [];
		
		for (let i = 0; i < filesToGenerate.length; i += PARALLEL_BATCH_SIZE) {
			batches.push(filesToGenerate.slice(i, i + PARALLEL_BATCH_SIZE));
		}

		console.log(`[prepareRepoSummaries] Processing ${filesToGenerate.length} files in ${batches.length} parallel batches...`);

		for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
			const batch = batches[batchIndex];
			console.log(`[prepareRepoSummaries] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} files)...`);
			
			const batchResults = await Promise.allSettled(
				batch.map(async (file) => {
					try {
						// Generate summary
						const summary = await generateFileSummary(file.content, file.path, 'gpt-4o-mini');

						// Upsert into repo_file_summaries using RPC function to bypass RLS
						const { error: upsertError } = await supabase.rpc('upsert_repo_file_summary', {
							p_repo_id: repoId,
							p_file_path: file.path,
							p_file_hash: file.hash,
							p_summary_text: summary.summary_text,
							p_summary_json: summary.summary_json,
							p_summary_model: 'gpt-4o-mini',
							p_user_id: userId,
							p_branch: branch,
						});

						if (upsertError) {
							throw new Error(`Failed to upsert: ${upsertError.message}`);
						}

						return { path: file.path, success: true };
					} catch (error: any) {
						return { path: file.path, success: false, error: error?.message || String(error) };
					}
				})
			);

			// Process batch results
			for (const result of batchResults) {
				if (result.status === 'fulfilled') {
					const { path, success, error } = result.value;
					if (success) {
						filesUpdated++;
						console.log(`[prepareRepoSummaries] ✓ Generated summary for ${path}`);
					} else {
						failedFiles.push({ path, error: error || 'Unknown error' });
						console.error(`[prepareRepoSummaries] ✗ Failed to generate summary for ${path}: ${error}`);
					}
				} else {
					console.error('[prepareRepoSummaries] Batch item rejected:', result.reason);
				}
			}
		}
	} else {
		console.log(`[prepareRepoSummaries] ✓ All files already have up-to-date summaries - no generation needed`);
	}

	// Verify ALL files have summaries - if any are missing, generate them now
	// Use ilike for case-insensitive repo_id matching
	const { data: allSummaries } = await supabase
		.from('repo_file_summaries')
		.select('file_path')
		.ilike('repo_id', repoId)
		.eq('branch', branch)
		.in('file_path', analysis.rawFiles.map(f => f.path));

	const filesWithSummaries = new Set((allSummaries || []).map(s => s.file_path));
	const missingSummaries = analysis.rawFiles
		.map(f => f.path)
		.filter(path => !filesWithSummaries.has(path));

	// If any files are missing summaries, generate them now
	if (missingSummaries.length > 0) {
		console.log(`Generating summaries for ${missingSummaries.length} missing file(s): ${missingSummaries.join(', ')}`);

		// Retry generating summaries for missing files
		for (const filePath of missingSummaries) {
			const file = analysis.rawFiles.find(f => f.path === filePath);
			if (!file) continue;

			const currentHash = fileShas[filePath] || null;
			if (!currentHash) {
				console.error(`No hash found for file ${filePath}`);
				continue; // Skip this file but continue with others
			}

			try {
				// Generate summary (file content already available from analyzeRepository)
				const summary = await generateFileSummary(file.content, filePath, 'gpt-4o-mini');

				// Upsert into repo_file_summaries using RPC function to bypass RLS
				const { error: upsertError } = await supabase.rpc('upsert_repo_file_summary', {
					p_repo_id: repoId,
					p_file_path: filePath,
					p_file_hash: currentHash,
					p_summary_text: summary.summary_text,
					p_summary_json: summary.summary_json,
					p_summary_model: 'gpt-4o-mini',
					p_user_id: userId,
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
			.in('file_path', analysis.rawFiles.map(f => f.path));

		const finalFilesWithSummaries = new Set((finalSummaries || []).map(s => s.file_path));
		const stillMissing = analysis.rawFiles
			.map(f => f.path)
			.filter(path => !finalFilesWithSummaries.has(path));

		if (stillMissing.length > 0) {
			// Log warning but don't throw - we'll let the caller handle it
			console.warn(
				`Unable to generate summaries for ${stillMissing.length} file(s) after retry: ${stillMissing.join(', ')}`
			);
		}
	}

	return {
		filesProcessed: analysis.rawFiles.length,
		filesUpdated,
		filesSkipped,
	};
}

