import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { generateFileSummary } from './fileSummarizer';
import type { FileSummary } from './fileSummarizer';

// Global cancellation registry for immediate cancellation
const cancellationRegistry = new Map<string, AbortController>();

/**
 * Register an AbortController for a setup process
 */
export function registerSetupCancellation(setupId: string, controller: AbortController) {
	cancellationRegistry.set(setupId, controller);
}

/**
 * Cancel a setup process immediately
 */
export function cancelSetupImmediately(setupId: string) {
	const controller = cancellationRegistry.get(setupId);
	if (controller) {
		console.log(`[repoSetupSimple] Immediately cancelling setup ${setupId}`);
		controller.abort();
		cancellationRegistry.delete(setupId);
		return true;
	}
	return false;
}

/**
 * Clean up a setup cancellation registration
 */
export function unregisterSetupCancellation(setupId: string) {
	cancellationRegistry.delete(setupId);
}
import { analyzeRepository } from './analyzeRepository';
import { createServiceRoleClient } from '../../supabase/server';
import { trackRepoConnected } from './usageTracking';
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
	summary: FileSummary,
	branch: string,
	userId: string | null,
	model: string
): Promise<void> {
	const normalizedPath = normalizeFilePath(filePath);

	// Combine summary text with resources
	let summaryText = summary.summary_text;
	if (summary.resources && summary.resources.trim()) {
		summaryText += `\n\nResources: ${summary.resources}`;
	}

	const { error } = await supabase
		.from('repo_file_summaries')
		.upsert(
			{
				repo_id: repoId,
				file_path: normalizedPath,
				file_hash: fileHash,
				summary_text: summaryText,
				summary_model: model,
				branch: branch,
				regeneration_reason: 'initial',
				updated_at: new Date().toISOString(),
			},
			{
				onConflict: 'repo_id,file_path,branch',
				ignoreDuplicates: false
			}
		);

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
	model: string = 'gpt-4o-mini',
	_accessToken?: string
): Promise<{ success: boolean; totalFiles: number; processedFiles: number; cachedFiles: number }> {
	const repoId = normalizeRepoId(repoUrl);

	const db = createServiceRoleClient();
	const { data: ownedRepo, error: ownershipError } = await db
		.from('workspace_repos')
		.select('id, provider, default_branch, auth_type')
		.eq('user_id', userId)
		.eq('repo_url', repoUrl)
		.single();

	if (ownershipError || !ownedRepo) {
		throw new Error('User does not have access to this repository.');
	}

	// Create AbortController for cancelling ongoing operations
	const abortController = new AbortController();

	// Register for immediate cancellation
	registerSetupCancellation(setupId, abortController);

	// Verify we can access the setup record at startup
	try {
		const { data: initialSetup, error: initialError } = await db
			.from('repository_setup')
			.select('setup_status, repo_id')
			.eq('id', setupId)
			.single();

		if (initialError) {
			console.error(`[repoSetupSimple] ❌ Cannot access setup record ${setupId}: ${initialError.message}`);
			throw new Error(`Setup record access failed: ${initialError.message}`);
		}

		console.log(`[repoSetupSimple] ✅ Setup record accessible: ${setupId} (status: ${initialSetup?.setup_status}, repo: ${initialSetup?.repo_id})`);
	} catch (accessError: any) {
		console.error(`[repoSetupSimple] ❌ Failed to access setup record at startup: ${accessError.message}`);
		throw accessError;
	}

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
		await updateProgress(db, setupId, { phase: 'scanning', currentFile: null });

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

		await updateProgress(db, setupId, {
			phase: 'analyzing',
			totalFiles: progress.totalFiles,
			processedFiles: 0,
		});

		// Phase 2: Check cache and process files
		console.log(`[repoSetupSimple] Phase 2: Processing files...`);

		const fileShas = analysis.snapshot?.fileShas || {};
		const BATCH_SIZE = 20; // Process 20 files at a time for better throughput

		// Process files in batches
		for (let i = 0; i < analysis.rawFiles.length; i += BATCH_SIZE) {
			// Check if operations were cancelled before starting the next batch
			if (abortController.signal.aborted) {
				console.log(`[repoSetupSimple] Operations cancelled before starting batch ${Math.floor(i / BATCH_SIZE) + 1}, stopping processing`);
				break;
			}

			const batch = analysis.rawFiles.slice(i, i + BATCH_SIZE);

			// Check if operations were cancelled before processing next batch
			if (abortController.signal.aborted) {
				console.log(`[repoSetupSimple] Operations cancelled before batch ${Math.floor(i / BATCH_SIZE) + 1}, stopping processing`);
				break;
			}

			// Check if already aborted before starting batch
			if (abortController.signal.aborted) {
				console.log(`[repoSetupSimple] Operations aborted, skipping batch ${Math.floor(i / BATCH_SIZE) + 1}`);
				break;
			}

			// Process files in parallel within batch with proper cancellation control
			const filePromises = batch.map(async (file) => {
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
					// Check if operations were cancelled
					if (abortController.signal.aborted) {
						console.log(`[repoSetupSimple] Operations cancelled, skipping file: ${filePath}`);
						return;
					}

					// Check cache
					const cached = await getCachedSummary(db, repoId, filePath, fileHash, branch);

					if (cached.exists && cached.hash === fileHash) {
						// File is cached and up-to-date
						progress.cachedFiles++;
						const fileIndex = progress.recentFiles.findIndex(f => f.path === filePath);
						if (fileIndex >= 0) {
							progress.recentFiles[fileIndex].status = 'skipped';
						}
						console.log(`[repoSetupSimple] ✓ Cached: ${filePath}`);
					} else {
						// Generate summary with abort signal
						const summary = await generateFileSummary(fileContent, filePath, model);
						await saveFileSummary(db, repoId, filePath, fileHash, summary, branch, userId, model);
						progress.processedFiles++;
						const fileIndex = progress.recentFiles.findIndex(f => f.path === filePath);
						if (fileIndex >= 0) {
							progress.recentFiles[fileIndex].status = 'completed';
						}
						console.log(`[repoSetupSimple] ✓ Processed: ${filePath}`);
					}
				} catch (error: any) {
					// Handle cancellation vs other errors
					if (error.name === 'AbortError' || error.message?.includes('cancelled')) {
						console.log(`[repoSetupSimple] File processing cancelled: ${filePath}`);
						const fileIndex = progress.recentFiles.findIndex(f => f.path === filePath);
						if (fileIndex >= 0) {
							progress.recentFiles[fileIndex].status = 'failed';
						}
						// Immediately abort all operations and re-throw to stop the batch
						abortController.abort();
						throw error;
					} else {
						console.error(`[repoSetupSimple] ❌ Failed: ${filePath} - ${error.message}`);
						const fileIndex = progress.recentFiles.findIndex(f => f.path === filePath);
						if (fileIndex >= 0) {
							progress.recentFiles[fileIndex].status = 'failed';
						}
						// Don't throw for non-cancellation errors - continue with other files
					}
				}
			});

			// Wait for all files in batch to complete (or fail)
			const results = await Promise.allSettled(filePromises);

			// Check if any operation was cancelled - if so, abort everything immediately
			const hasCancellation = results.some(result =>
				result.status === 'rejected' &&
				(result.reason?.name === 'AbortError' || result.reason?.message?.includes('cancelled'))
			);

			if (hasCancellation) {
				console.log(`[repoSetupSimple] Cancellation detected in batch ${Math.floor(i / BATCH_SIZE) + 1}, aborting all operations immediately`);
				abortController.abort();
				break;
			}

			// Check if operations are already aborted (from another source)
			if (abortController.signal.aborted) {
				console.log(`[repoSetupSimple] Operations aborted during batch ${Math.floor(i / BATCH_SIZE) + 1} processing`);
				break;
			}

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

			await updateProgress(db, setupId, {
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

		// Check if operations were cancelled during processing
		if (abortController.signal.aborted) {
			console.log(`[repoSetupSimple] Operations were cancelled during processing, exiting`);
			await updateProgress(db, setupId, {
				phase: 'failed',
				currentFile: null
			});
			throw new Error('Setup cancelled by user during processing');
		}

		// Phase 3: Validate
		console.log(`[repoSetupSimple] Phase 3: Validating summaries...`);
		await updateProgress(db, setupId, { phase: 'validating', currentFile: null });

		// Verify all files have summaries
		const { count, error: countError } = await db
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
		await updateProgress(db, setupId, {
			phase: 'ready',
			totalFiles: progress.totalFiles,
			processedFiles: progress.processedFiles,
			cachedFiles: progress.cachedFiles,
			currentFile: null,
			processingRate: progress.processingRate,
			estimatedTimeRemaining: 0,
		});

		await db
			.from('repository_setup')
			.update({
				setup_status: 'ready',
				setup_completed_at: new Date().toISOString(),
			})
			.eq('id', setupId);

		await trackRepoConnected(
			db,
			userId,
			ownedRepo.id,
			repoUrl,
			ownedRepo.provider,
			ownedRepo.default_branch,
			ownedRepo.auth_type
		);

		// Unregister cancellation on successful completion
		unregisterSetupCancellation(setupId);

		return {
			success: true,
			totalFiles: progress.totalFiles,
			processedFiles: progress.processedFiles,
			cachedFiles: progress.cachedFiles,
		};
	} catch (error: any) {
		console.error(`[repoSetupSimple] ❌ Setup failed:`, error);

		await updateProgress(db, setupId, {
			phase: 'failed',
			currentFile: null,
		});

		await db
			.from('repository_setup')
			.update({
				setup_status: 'failed',
				error_message: error.message || 'Unknown error',
				setup_completed_at: new Date().toISOString(),
			})
			.eq('id', setupId);

		// Remove the repository from workspace_repos if setup failed or was cancelled
		console.log(`[repoSetupSimple] Aborting operations and removing failed/cancelled repository ${repoId} from workspace_repos`);
		abortController.abort();
		unregisterSetupCancellation(setupId);
		await db
			.from('workspace_repos')
			.delete()
			.eq('id', repoId);

		throw error;
	}
}
