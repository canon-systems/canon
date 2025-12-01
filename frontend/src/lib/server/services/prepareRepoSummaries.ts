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

	// Process each file - ENSURE ALL FILES HAVE SUMMARIES
	for (const file of analysis.rawFiles) {
		const filePath = file.path;
		const currentHash = fileShas[filePath] || null;

		if (!currentHash) {
			const errorMsg = `No hash found for file ${filePath}`;
			console.error(errorMsg);
			failedFiles.push({ path: filePath, error: errorMsg });
			continue; // Continue processing other files, but track failure
		}

		try {
			// Check if summary exists
			// Use ilike for case-insensitive repo_id matching since GitHub URLs are case-insensitive
			const { data: existingSummary } = await supabase
				.from('repo_file_summaries')
				.select('file_hash')
				.ilike('repo_id', repoId)
				.eq('file_path', filePath)
				.eq('branch', branch)
				.single();

			// Skip if exists and hash matches (unless fullScan is true)
			if (existingSummary && existingSummary.file_hash === currentHash && !fullScan) {
				filesSkipped++;
				continue;
			}

			// Generate summary (file content already available from analyzeRepository) - REQUIRED
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
				const errorMsg = `Failed to upsert summary for ${filePath}: ${upsertError.message}`;
				console.error(errorMsg);
				failedFiles.push({ path: filePath, error: errorMsg });
				continue; // Continue processing other files, but track failure
			}

			filesUpdated++;
		} catch (error: any) {
			const errorMsg = `Error processing file ${filePath}: ${error?.message || error}`;
			console.error(errorMsg);
			failedFiles.push({ path: filePath, error: errorMsg });
			// Continue processing other files, but track failure
		}
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

