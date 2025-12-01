import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { analyzeRepository } from './analyzeRepository';
import { generateSimpleFileSummary } from './fileSummarizerSimple';
import { createServiceRoleClient } from '../../supabase/server';
import { parseRepoUrl } from '../github/github';

/**
 * Normalize repo URL to repo_id format: "github.com/owner/repo"
 */
function normalizeRepoId(repoUrl: string): string {
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		throw new Error(`Invalid repo URL: ${repoUrl}`);
	}
	return `github.com/${parsed.owner}/${parsed.repo}`;
}

/**
 * Normalize file paths for consistent matching
 */
function normalizeFilePath(filePath: string): string {
	return filePath.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.?\//, '');
}

/**
 * Progress tracking state
 */
type ProgressState = {
	phase: 'scanning' | 'analyzing' | 'validating' | 'ready' | 'failed';
	totalFiles: number;
	processedFiles: number;
	cachedFiles: number;
	currentFile: string | null;
	recentFiles: Array<{ path: string; status: 'processing' | 'completed' | 'skipped' | 'failed'; timestamp: number }>;
	startTime: number;
	lastUpdateTime: number;
	processingRate: number; // files per minute
	estimatedTimeRemaining: number | null; // seconds
};

/**
 * Update progress in database
 */
async function updateProgress(
	supabase: SupabaseClient,
	setupId: string,
	progress: Partial<ProgressState>
): Promise<void> {
	// Calculate total files with summaries (processed + cached)
	const totalSummarized = (progress.processedFiles || 0) + (progress.cachedFiles || 0);
	const progressPercent = progress.totalFiles && totalSummarized > 0
		? Math.round((totalSummarized / progress.totalFiles) * 100)
		: 0;

	const update: Record<string, unknown> = {
		last_progress_update: new Date().toISOString(),
	};

	if (progress.totalFiles !== undefined) {
		update.total_files = progress.totalFiles;
	}
	if (progress.processedFiles !== undefined || progress.cachedFiles !== undefined) {
		// summarized_files should be the total count of files with summaries
		update.summarized_files = totalSummarized;
	}
	if (progress.currentFile !== undefined) {
		update.current_file = progress.currentFile;
	}
	if (progress.phase) {
		update.processing_status = progress.phase;
	}
	if (progressPercent !== undefined) {
		update.progress_percentage = progressPercent;
	}
	if (progress.processingRate !== undefined) {
		update.processing_rate = progress.processingRate;
	}
	if (progress.estimatedTimeRemaining !== undefined) {
		update.estimated_time_remaining = progress.estimatedTimeRemaining;
	}
	if (progress.recentFiles) {
		update.recent_files = JSON.stringify(progress.recentFiles.slice(0, 10));
	}

	const { error } = await supabase
		.from('repository_setup')
		.update(update)
		.eq('id', setupId);

	if (error) {
		console.error(`[repoSetupSimple] Failed to update progress:`, error);
	}
}

/**
 * Calculate file hash
 */
function calculateFileHash(content: string): string {
	return createHash('sha256').update(content).digest('hex');
}

/**
 * Check if file summary exists and is up-to-date
 */
async function getCachedSummary(
	supabase: SupabaseClient,
	repoId: string,
	filePath: string,
	fileHash: string,
	branch: string
): Promise<{ exists: boolean; hash: string | null }> {
	const normalizedPath = normalizeFilePath(filePath);

	const { data, error } = await supabase
		.from('repo_file_summaries')
		.select('file_hash')
		.ilike('repo_id', repoId)
		.eq('branch', branch)
		.eq('file_path', normalizedPath)
		.single();

	if (error || !data) {
		return { exists: false, hash: null };
	}

	return { exists: true, hash: data.file_hash };
}

/**
 * Save file summary to database
 */
async function saveFileSummary(
	supabase: SupabaseClient,
	repoId: string,
	filePath: string,
	fileHash: string,
	summary: { summary: string; purpose: string; mainExports: string[]; keyDependencies: string[]; fileType: string },
	branch: string,
	userId: string | null,
	model: string
): Promise<void> {
	const normalizedPath = normalizeFilePath(filePath);

	// Convert simple summary to the format expected by the database
	const summaryText = `${summary.summary}\n\nPurpose: ${summary.purpose}\n\nMain exports: ${summary.mainExports.join(', ') || 'None'}\n\nKey dependencies: ${summary.keyDependencies.join(', ') || 'None'}`;

	const summaryJson = {
		problem_solved: summary.purpose,
		functions: summary.mainExports.map(name => ({
			name,
			signature: '',
			description: '',
			exported: true,
			parameters: [],
			returnType: '',
		})),
		apis: [],
		imports: summary.keyDependencies.map(module => ({
			module,
			type: 'external' as const,
			items: [],
			purpose: '',
		})),
		logic: {
			main_flow: summary.summary,
			algorithms: [],
			business_rules: [],
			entry_points: summary.mainExports,
			data_structures: [],
			error_handling: '',
			edge_cases: [],
			state_management: '',
		},
		downstream_usage: [],
		upstream_dependencies: [],
		code_uses: [],
		design_patterns: [],
		key_decisions: [],
	};

	const { error } = await supabase.rpc('upsert_repo_file_summary', {
		p_repo_id: repoId,
		p_file_path: normalizedPath,
		p_file_hash: fileHash,
		p_summary_text: summaryText,
		p_summary_json: summaryJson,
		p_summary_model: model,
		p_user_id: userId,
		// p_submission_id is omitted - not used and submissions table no longer exists
		p_branch: branch,
	});

	if (error) {
		throw new Error(`Failed to save summary: ${error.message}`);
	}
}

/**
 * Calculate processing rate and estimated time remaining
 */
function calculateTimeEstimate(
	processed: number,
	cached: number,
	startTime: number,
	totalFiles: number
): { rate: number; estimatedSeconds: number | null } {
	const elapsedMinutes = (Date.now() - startTime) / 1000 / 60;
	const totalProcessed = processed + cached;

	if (totalProcessed === 0 || elapsedMinutes < 0.1) {
		return { rate: 0, estimatedSeconds: null };
	}

	const rate = totalProcessed / elapsedMinutes; // files per minute
	const remainingFiles = totalFiles - totalProcessed;
	const estimatedSeconds = rate > 0 ? (remainingFiles / rate) * 60 : null;

	return { rate, estimatedSeconds };
}

/**
 * Simplified repository setup with accurate progress tracking
 */
export async function setupRepositorySimple(
	supabase: SupabaseClient,
	setupId: string,
	repoUrl: string,
	branch: string,
	userId: string,
	model: string = 'gpt-4o-mini'
): Promise<{ success: boolean; totalFiles: number; processedFiles: number; cachedFiles: number }> {
	const repoId = normalizeRepoId(repoUrl);
	const progress: ProgressState = {
		phase: 'scanning',
		totalFiles: 0,
		processedFiles: 0,
		cachedFiles: 0,
		currentFile: null,
		recentFiles: [],
		startTime: Date.now(),
		lastUpdateTime: Date.now(),
		processingRate: 0,
		estimatedTimeRemaining: null,
	};

	try {
		// Phase 1: Scan repository
		console.log(`[repoSetupSimple] Phase 1: Scanning repository ${repoId}...`);
		await updateProgress(supabase, setupId, { phase: 'scanning', currentFile: null });

		const analysis = await analyzeRepository({
			supabase,
			userId,
			repoUrl,
			branch,
			subdir: null,
			filters: null,
		});

		if (!analysis.rawFiles || analysis.rawFiles.length === 0) {
			throw new Error('No files found in repository');
		}

		progress.totalFiles = analysis.rawFiles.length;
		progress.startTime = Date.now();
		console.log(`[repoSetupSimple] Found ${progress.totalFiles} files to process`);

		await updateProgress(supabase, setupId, {
			phase: 'analyzing',
			totalFiles: progress.totalFiles,
			processedFiles: 0,
		});

		// Phase 2: Check cache and process files
		console.log(`[repoSetupSimple] Phase 2: Processing files...`);

		const fileShas = analysis.snapshot?.fileShas || {};
		const BATCH_SIZE = 10; // Process 10 files at a time for better rate limiting

		// Process files in batches
		for (let i = 0; i < analysis.rawFiles.length; i += BATCH_SIZE) {
			const batch = analysis.rawFiles.slice(i, i + BATCH_SIZE);

			await Promise.all(
				batch.map(async (file) => {
					const filePath = file.path;
					const fileContent = file.content;
					const fileHash = fileShas[filePath] || calculateFileHash(fileContent);

					// Update current file
					progress.currentFile = filePath;
					progress.recentFiles.unshift({
						path: filePath,
						status: 'processing',
						timestamp: Date.now(),
					});
					if (progress.recentFiles.length > 10) {
						progress.recentFiles.pop();
					}

					try {
						// Check cache
						const cached = await getCachedSummary(supabase, repoId, filePath, fileHash, branch);

						if (cached.exists && cached.hash === fileHash) {
							// File is cached and up-to-date
							progress.cachedFiles++;
							const fileIndex = progress.recentFiles.findIndex(f => f.path === filePath);
							if (fileIndex >= 0) {
								progress.recentFiles[fileIndex].status = 'skipped';
							}
							console.log(`[repoSetupSimple] ✓ Cached: ${filePath}`);
						} else {
							// Generate summary
							const summary = await generateSimpleFileSummary(fileContent, filePath, model);
							await saveFileSummary(supabase, repoId, filePath, fileHash, summary, branch, userId, model);
							progress.processedFiles++;
							const fileIndex = progress.recentFiles.findIndex(f => f.path === filePath);
							if (fileIndex >= 0) {
								progress.recentFiles[fileIndex].status = 'completed';
							}
							console.log(`[repoSetupSimple] ✓ Processed: ${filePath}`);
						}
					} catch (error: any) {
						console.error(`[repoSetupSimple] ❌ Failed: ${filePath} - ${error.message}`);
						const fileIndex = progress.recentFiles.findIndex(f => f.path === filePath);
						if (fileIndex >= 0) {
							progress.recentFiles[fileIndex].status = 'failed';
						}
						// Continue with other files
					}
				})
			);

			// Update progress after each batch
			const { rate, estimatedSeconds } = calculateTimeEstimate(
				progress.processedFiles,
				progress.cachedFiles,
				progress.startTime,
				progress.totalFiles
			);

			progress.processingRate = rate;
			progress.estimatedTimeRemaining = estimatedSeconds;
			progress.lastUpdateTime = Date.now();

			await updateProgress(supabase, setupId, {
				phase: 'analyzing',
				totalFiles: progress.totalFiles,
				processedFiles: progress.processedFiles,
				cachedFiles: progress.cachedFiles,
				currentFile: progress.currentFile,
				recentFiles: progress.recentFiles,
				processingRate: progress.processingRate,
				estimatedTimeRemaining: progress.estimatedTimeRemaining,
			});
		}

		// Phase 3: Validate
		console.log(`[repoSetupSimple] Phase 3: Validating summaries...`);
		await updateProgress(supabase, setupId, { phase: 'validating', currentFile: null });

		// Verify all files have summaries
		const { count, error: countError } = await supabase
			.from('repo_file_summaries')
			.select('*', { count: 'exact', head: true })
			.ilike('repo_id', repoId)
			.eq('branch', branch);

		if (countError) {
			console.warn(`[repoSetupSimple] Warning: Could not verify summary count: ${countError.message}`);
		} else {
			console.log(`[repoSetupSimple] Verified ${count} summaries in database`);
		}

		// Phase 4: Complete
		console.log(`[repoSetupSimple] ✅ Setup complete!`);
		await updateProgress(supabase, setupId, {
			phase: 'ready',
			totalFiles: progress.totalFiles,
			processedFiles: progress.processedFiles,
			cachedFiles: progress.cachedFiles,
			currentFile: null,
			processingRate: progress.processingRate,
			estimatedTimeRemaining: 0,
		});

		await supabase
			.from('repository_setup')
			.update({
				setup_status: 'ready',
				setup_completed_at: new Date().toISOString(),
			})
			.eq('id', setupId);

		return {
			success: true,
			totalFiles: progress.totalFiles,
			processedFiles: progress.processedFiles,
			cachedFiles: progress.cachedFiles,
		};
	} catch (error: any) {
		console.error(`[repoSetupSimple] ❌ Setup failed:`, error);

		await updateProgress(supabase, setupId, {
			phase: 'failed',
			currentFile: null,
		});

		await supabase
			.from('repository_setup')
			.update({
				setup_status: 'failed',
				error_message: error.message || 'Unknown error',
				setup_completed_at: new Date().toISOString(),
			})
			.eq('id', setupId);

		throw error;
	}
}

