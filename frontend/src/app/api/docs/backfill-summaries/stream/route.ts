import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { backfillSummariesBatch } from '@/lib/server/services/backfillSummaries';

/**
 * POST: Execute backfill with Server-Sent Events for progress updates
 * Body:
 *   - limit: number of submissions to process (default: 100)
 *   - batchSize: number of submissions to process in parallel (default: 10)
 *   - repoUrl: filter by specific repo URL (optional)
 */
export async function POST(request: NextRequest) {
	const supabase = await createClient();
	const { user } = await getSession();

	if (!user) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const body = await request.json().catch(() => ({}));
	const { limit = 100, batchSize = 10, repoUrl } = body;

	// Create a readable stream for SSE
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			const sendEvent = (event: string, data: any) => {
				const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
				controller.enqueue(encoder.encode(message));
			};

			const sendError = (error: string) => {
				sendEvent('error', { error });
				controller.close();
			};

			try {
				// Send initial status
				sendEvent('status', {
					message: 'Initializing backfill process... Finding submissions with missing summaries...',
					stage: 'initializing',
				});
				console.log('[backfill-summaries-stream] Starting backfill process for user:', user.id);

				// Track timing
				const startTime = Date.now();
				let lastProgressTime = startTime;
				const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes timeout
				const STALL_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes without progress = stalled

				// Track current submission being processed
				let currentSubmissionIndex = 0;
				let currentBatchIndex = 0;
				let currentFile: string | null = null;

				await backfillSummariesBatch(supabase, {
					limit: typeof limit === 'number' ? limit : 100,
					batchSize: typeof batchSize === 'number' ? batchSize : 10,
					userId: user.id,
					repoUrl: typeof repoUrl === 'string' ? repoUrl : undefined,
					onFileProgress: (filePath, status, error) => {
						currentFile = filePath;
						const statusMessages = {
							processing: `Processing ${filePath}...`,
							completed: `Completed ${filePath}`,
							skipped: `Skipped ${filePath} (already exists)`,
							failed: `Failed ${filePath}${error ? `: ${error}` : ''}`,
						};
						
						sendEvent('fileProgress', {
							filePath,
							status,
							message: statusMessages[status],
							error: error || null,
						});
					},
					onProgress: (progress) => {
						const now = Date.now();
						const elapsed = now - startTime;
						const timeSinceLastProgress = now - lastProgressTime;

						// Check for timeout
						if (elapsed > TIMEOUT_MS) {
							sendError('Backfill process timed out after 30 minutes');
							return;
						}

						// Check for stall
						if (timeSinceLastProgress > STALL_THRESHOLD_MS && progress.processed < progress.total) {
							sendEvent('warning', {
								message: 'Process appears to be stalled. This may be due to rate limiting.',
								elapsed: Math.round(elapsed / 1000),
							});
						}

						lastProgressTime = now;
						currentSubmissionIndex = progress.processed;

						// Send progress update
						sendEvent('progress', {
							processed: progress.processed,
							total: progress.total,
							updated: progress.updated,
							failed: progress.failed,
							elapsed: Math.round(elapsed / 1000),
							percentage: progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0,
							message: `Processing submission ${progress.processed} of ${progress.total}...`,
						});
					},
				}).then((result) => {
					const elapsed = Date.now() - startTime;
					sendEvent('complete', {
						totalProcessed: result.totalProcessed,
						totalUpdated: result.totalUpdated,
						totalFailed: result.totalFailed,
						elapsed: Math.round(elapsed / 1000),
						results: result.results.slice(0, 50), // Return first 50 results
					});
					controller.close();
				}).catch((error) => {
					console.error('Backfill stream error:', error);
					sendError(error.message || String(error));
				});
			} catch (error: any) {
				console.error('Backfill stream setup error:', error);
				sendError(error.message || String(error));
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		},
	});
}

