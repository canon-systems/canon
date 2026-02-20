import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { generateFileSummary } from './fileSummarizer';
import { createLogger, errorMessage } from '@/lib/server/logging';

// Single config for all environments (keep simple, predictable load on gateway)
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_CONCURRENCY = 5;
const STATUS_QUERY_CHUNK_SIZE = 200;
const ABORT_CHECK_INTERVAL_MS = 3000;
const log = createLogger('llm.summaries', {
  label: 'File Summaries',
  eventLabels: {
    run_start: 'Summary Run Started',
    run_aborted: 'Summary Run Aborted',
    run_progress: 'Summary Run Progress',
    run_stalled: 'Summary Run Stalled',
    run_complete: 'Summary Run Completed',
    batch_start: 'Batch Started',
    batch_complete: 'Batch Completed',
    file_summary_start: 'File Summary Started',
    file_summary_complete: 'File Summary Completed',
    file_summary_slow: 'File Summary Slow',
    file_summary_save_failed: 'File Summary Save Failed',
    file_summary_generate_failed: 'File Summary Generation Failed',
  },
});

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  const safeLimit = Math.max(1, limit);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= items.length) break;
      await worker(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(safeLimit, items.length) }, () => runWorker());
  await Promise.all(workers);
}

/**
 * File summary status information
 */
export interface SummaryStatus {
  exists: boolean;
  isUpToDate: boolean;
  currentHash: string | null;
  lastUpdated?: string;
}

/**
 * Summary update result
 */
export interface UpdateResult {
  processed: number;
  skipped: number;
  failed: number;
  total: number;
  updatedFiles: string[];
  aborted?: boolean;
}

/**
 * Progress callback for batch operations
 */
export type ProgressCallback = (progress: {
  processed: number;
  total: number;
  currentFile?: string;
  status: string;
}) => void;

export type SummaryHeartbeat = {
  processed: number;
  failed: number;
  total: number;
  inFlight: number;
  remaining: number;
  elapsedMs: number;
  lastCompletedAt: string | null;
};

/**
 * Centralized file summary management service
 * Prevents redundant summary generation and provides single source of truth
 */
export class FileSummaryManager {
  private supabase: SupabaseClient;
  private sourceId: string;
  private branch: string;

  constructor(supabase: SupabaseClient, sourceId: string, branch: string = 'main') {
    this.supabase = supabase;
    this.sourceId = sourceId;
    this.branch = branch;
  }

  /**
   * Normalize file paths for consistent matching
   */
  private normalizeFilePath(filePath: string): string {
    return filePath.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.?\//, '');
  }

  /**
   * Calculate file content hash
   */
  private calculateFileHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if a file's summary exists and is up-to-date
   */
  async checkSummaryStatus(filePath: string, currentHash?: string): Promise<SummaryStatus> {
    const normalizedPath = this.normalizeFilePath(filePath);

    const { data, error } = await this.supabase
      .from('repo_file_summaries')
      .select('file_hash, updated_at')
      .eq('source_id', this.sourceId)
      .eq('branch', this.branch)
      .eq('file_path', normalizedPath)
      .single();

    if (error || !data) {
      return {
        exists: false,
        isUpToDate: false,
        currentHash: null,
      };
    }

    const isUpToDate = currentHash ? data.file_hash === currentHash : true;

    return {
      exists: true,
      isUpToDate,
      currentHash: data.file_hash,
      lastUpdated: data.updated_at,
    };
  }

  /**
   * Get summary status for multiple files
   */
  async checkMultipleSummaryStatus(files: Array<{ path: string; hash?: string }>): Promise<Map<string, SummaryStatus>> {
    const results = new Map<string, SummaryStatus>();
    if (files.length === 0) return results;

    const filesWithNormalized = files.map((file) => ({
      originalPath: file.path,
      normalizedPath: this.normalizeFilePath(file.path),
      hash: file.hash,
    }));

    const normalizedPaths = Array.from(new Set(filesWithNormalized.map((file) => file.normalizedPath)));
    const existingByPath = new Map<string, { file_hash: string | null; updated_at: string | null }>();

    for (let i = 0; i < normalizedPaths.length; i += STATUS_QUERY_CHUNK_SIZE) {
      const chunk = normalizedPaths.slice(i, i + STATUS_QUERY_CHUNK_SIZE);
      const { data, error } = await this.supabase
        .from('repo_file_summaries')
        .select('file_path, file_hash, updated_at')
        .eq('source_id', this.sourceId)
        .eq('branch', this.branch)
        .in('file_path', chunk);

      if (error) {
        log.warn('run_progress', {
          reason: 'status_query_failed',
          chunkSize: chunk.length,
          error: error.message,
        });
        for (const file of files) {
          results.set(file.path, {
            exists: false,
            isUpToDate: false,
            currentHash: null,
          });
        }
        return results;
      }

      for (const row of data || []) {
        existingByPath.set(row.file_path, {
          file_hash: row.file_hash ?? null,
          updated_at: row.updated_at ?? null,
        });
      }
    }

    filesWithNormalized.forEach((file) => {
      const existing = existingByPath.get(file.normalizedPath);
      const isUpToDate = existing ? (file.hash ? existing.file_hash === file.hash : true) : false;
      results.set(file.originalPath, {
        exists: Boolean(existing),
        isUpToDate,
        currentHash: existing?.file_hash ?? null,
        lastUpdated: existing?.updated_at ?? undefined,
      });
    });
    return results;
  }

  /**
   * Load existing summaries for files (without generating missing ones)
   */
  async getExistingSummaries(filePaths: string[]): Promise<Map<string, { file_path: string; summary_text: string }>> {
    const normalizedPaths = filePaths.map(path => this.normalizeFilePath(path));

    const { data, error } = await this.supabase
      .from('repo_file_summaries')
      .select('file_path, summary_text')
      .eq('source_id', this.sourceId)
      .eq('branch', this.branch)
      .in('file_path', normalizedPaths);

    if (error || !data) {
      return new Map();
    }

    // Build map with fuzzy path matching
    const summariesMap = new Map<string, { file_path: string; summary_text: string }>();

    for (const summary of data || []) {
      // Store with normalized path as key
      summariesMap.set(summary.file_path, summary);

      // Also try to match against original paths for fuzzy matching
      for (const originalPath of filePaths) {
        if (this.pathsMatch(summary.file_path, originalPath)) {
          summariesMap.set(originalPath, summary);
          break;
        }
      }
    }

    return summariesMap;
  }

  /**
   * Fuzzy path matching for summary lookup
   */
  private pathsMatch(storedPath: string, requestedPath: string): boolean {
    const normalizeForComparison = (path: string) =>
      path.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.?\//, '');

    const normalizedStored = normalizeForComparison(storedPath);
    const normalizedRequested = normalizeForComparison(requestedPath);

    return normalizedStored === normalizedRequested;
  }

  /**
   * Update summaries for files that need it
   */
  async updateSummariesIfNeeded(
    files: Array<{ path: string; content: string; hash?: string }>,
    options: {
      force?: boolean;
      batchSize?: number;
      onProgress?: ProgressCallback;
      onHeartbeat?: (heartbeat: SummaryHeartbeat) => void;
      model?: string;
      regenerationReason?: string;
      shouldAbort?: () => Promise<boolean> | boolean;
      heartbeatMs?: number;
      slowFileThresholdMs?: number;
    } = {}
  ): Promise<UpdateResult> {
    const {
      force = false,
      batchSize = DEFAULT_BATCH_SIZE,
      onProgress,
      onHeartbeat,
      model = 'openai/gpt-4o-mini',
      regenerationReason = 'initial',
      shouldAbort,
      heartbeatMs = 15000,
      slowFileThresholdMs = 45000,
    } = options;

    let processed = 0;
    const skipped = 0;
    let failed = 0;
    const updatedFiles: string[] = [];
    let aborted = false;
    let inFlight = 0;
    const runStartedAt = Date.now();
    let lastCompletedAtMs: number | null = null;
    let lastProgressLogAtMs = 0;
    let lastStallLogAtMs = 0;
    let lastAbortCheckAtMs = 0;
    let lastAbortCheckResult = false;

    const checkAbort = async (): Promise<boolean> => {
      if (aborted || !shouldAbort) return aborted;
      const nowMs = Date.now();
      if (lastAbortCheckResult && nowMs - lastAbortCheckAtMs < ABORT_CHECK_INTERVAL_MS) {
        return true;
      }
      if (nowMs - lastAbortCheckAtMs < ABORT_CHECK_INTERVAL_MS) {
        return false;
      }
      try {
        lastAbortCheckAtMs = nowMs;
        lastAbortCheckResult = Boolean(await shouldAbort());
        aborted = lastAbortCheckResult;
      } catch (error) {
        log.warn('run_aborted', {
          reason: 'abort_check_failed',
          error: errorMessage(error),
        });
      }
      return aborted;
    };

    const makeHeartbeat = (total: number): SummaryHeartbeat => {
      const nowMs = Date.now();
      return {
        processed,
        failed,
        total,
        inFlight,
        remaining: Math.max(0, total - (processed + failed)),
        elapsedMs: nowMs - runStartedAt,
        lastCompletedAt: lastCompletedAtMs ? new Date(lastCompletedAtMs).toISOString() : null,
      };
    };

    const emitProgressLog = (reason: 'heartbeat' | 'batch_complete' | 'run_complete', total: number) => {
      const heartbeat = makeHeartbeat(total);
      const nowMs = Date.now();
      if (reason === 'heartbeat' && nowMs - lastProgressLogAtMs < heartbeatMs) {
        return;
      }
      lastProgressLogAtMs = nowMs;
      log.info('run_progress', {
        reason,
        ...heartbeat,
      });
    };

    log.info('run_start', {
      totalFiles: files.length,
      force,
      batchSize,
      concurrency: DEFAULT_CONCURRENCY,
      model,
      reason: regenerationReason,
    });

    // Check which files need updates
    const statusMap = await this.checkMultipleSummaryStatus(files);

    // Filter to files that need updating
    const filesNeedingUpdate = files.filter(file => {
      const status = statusMap.get(file.path);
      return force || !status?.exists || !status?.isUpToDate;
    });

    if (filesNeedingUpdate.length === 0) {
      log.info('run_complete', {
        totalFiles: files.length,
        filesNeedingUpdate: 0,
        processed: 0,
        skipped: files.length,
        failed: 0,
      });
      onProgress?.({
        processed: files.length,
        total: files.length,
        status: 'complete'
      });
      return { processed: 0, skipped: files.length, failed: 0, total: files.length, updatedFiles: [] };
    }

    // Process in batches
    const batches: Array<typeof filesNeedingUpdate> = [];
    for (let i = 0; i < filesNeedingUpdate.length; i += batchSize) {
      batches.push(filesNeedingUpdate.slice(i, i + batchSize));
    }

    batches.forEach((batch, i) =>
      log.debug('batch_start', {
        batch: i + 1,
        totalBatches: batches.length,
        batchSize: batch.length,
        concurrency: DEFAULT_CONCURRENCY,
      })
    );

    const heartbeatTimer = setInterval(() => {
      const heartbeat = makeHeartbeat(filesNeedingUpdate.length);
      onHeartbeat?.(heartbeat);
      emitProgressLog('heartbeat', filesNeedingUpdate.length);
      if (heartbeat.inFlight > 0 && heartbeat.lastCompletedAt) {
        const sinceLastCompleteMs = Date.now() - Date.parse(heartbeat.lastCompletedAt);
        if (sinceLastCompleteMs > Math.max(heartbeatMs * 4, 60000) && Date.now() - lastStallLogAtMs >= heartbeatMs * 2) {
          lastStallLogAtMs = Date.now();
          log.warn('run_stalled', {
            sinceLastCompleteMs,
            ...heartbeat,
          });
        }
      }
    }, heartbeatMs);

    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        if (await checkAbort()) break;

        const batchStartMs = Date.now();
        const processedBefore = processed;
        const failedBefore = failed;

        await runWithConcurrency(batch, DEFAULT_CONCURRENCY, async (file) => {
          if (aborted || await checkAbort()) return;
          inFlight += 1;
          const fileStartedAt = Date.now();
          try {
            const status = statusMap.get(file.path);
            const reason = !status?.exists ? 'new file (added)' : 'content changed (hash mismatch)';
            log.debug('file_summary_start', { path: file.path, reason });

            onProgress?.({
              processed: processed + skipped,
              total: filesNeedingUpdate.length,
              currentFile: file.path,
              status: 'processing'
            });

            const fileHash = file.hash || this.calculateFileHash(file.content);
            const summary = await generateFileSummary(file.content, file.path, model);
            if (aborted || await checkAbort()) return;

            const { error } = await this.supabase
              .from('repo_file_summaries')
              .upsert(
                {
                  source_id: this.sourceId,
                  file_path: this.normalizeFilePath(file.path),
                  file_hash: fileHash,
                  summary_text: summary.summary_text,
                  branch: this.branch,
                  updated_at: new Date().toISOString(),
                },
                {
                  onConflict: 'source_id,file_path,branch',
                  ignoreDuplicates: false
                }
              );

            if (error) {
              if (error.message.includes('repo_file_summaries_source_id_fkey')) {
                aborted = true;
                return;
              }
              log.error('file_summary_save_failed', {
                path: file.path,
                error: error.message,
              });
              failed++;
            } else {
              processed++;
              updatedFiles.push(file.path);
              lastCompletedAtMs = Date.now();
              const durationMs = Date.now() - fileStartedAt;
              if (durationMs >= slowFileThresholdMs) {
                log.warn('file_summary_slow', {
                  path: file.path,
                  durationMs,
                  model,
                });
              } else {
                log.debug('file_summary_complete', {
                  path: file.path,
                  durationMs,
                  model,
                });
              }
            }
          } catch (error) {
            log.error('file_summary_generate_failed', {
              path: file.path,
              error: errorMessage(error),
            });
            failed++;
          } finally {
            inFlight = Math.max(0, inFlight - 1);
          }
        });

        log.info('batch_complete', {
          batch: batchIndex + 1,
          totalBatches: batches.length,
          batchSize: batch.length,
          batchDurationMs: Date.now() - batchStartMs,
          processedInBatch: processed - processedBefore,
          failedInBatch: failed - failedBefore,
          processedTotal: processed,
          failedTotal: failed,
          total: filesNeedingUpdate.length,
        });
        onHeartbeat?.(makeHeartbeat(filesNeedingUpdate.length));
        emitProgressLog('batch_complete', filesNeedingUpdate.length);
      }
    } finally {
      clearInterval(heartbeatTimer);
    }

    if (aborted) {
      onProgress?.({
        processed: processed + skipped,
        total: filesNeedingUpdate.length,
        status: 'aborted'
      });
      log.info('run_aborted', {
        totalFiles: files.length,
        filesNeedingUpdate: filesNeedingUpdate.length,
        processed,
        skipped: files.length - filesNeedingUpdate.length,
        failed,
        elapsedMs: Date.now() - runStartedAt,
      });
      return {
        processed,
        skipped: files.length - filesNeedingUpdate.length,
        failed,
        total: files.length,
        updatedFiles,
        aborted: true,
      };
    }

    onProgress?.({
      processed: processed + skipped,
      total: filesNeedingUpdate.length,
      status: 'complete'
    });

    log.info('run_complete', {
      totalFiles: files.length,
      filesNeedingUpdate: filesNeedingUpdate.length,
      processed,
      skipped: files.length - filesNeedingUpdate.length,
      failed,
      elapsedMs: Date.now() - runStartedAt,
      averageMsPerProcessedFile: processed > 0 ? Math.round((Date.now() - runStartedAt) / processed) : null,
    });
    emitProgressLog('run_complete', filesNeedingUpdate.length);

    return {
      processed,
      skipped: files.length - filesNeedingUpdate.length,
      failed,
      total: files.length,
      updatedFiles
    };
  }

  /**
   * Force-update summaries for all provided files (or respect caller force flag).
   * Convenience wrapper so callers can rely on a stable method name.
   */
  async updateSummaries(
    files: Array<{ path: string; content: string; hash?: string }>,
    options: {
      force?: boolean;
      batchSize?: number;
      onProgress?: ProgressCallback;
      onHeartbeat?: (heartbeat: SummaryHeartbeat) => void;
      model?: string;
      regenerationReason?: string;
      shouldAbort?: () => Promise<boolean> | boolean;
      heartbeatMs?: number;
      slowFileThresholdMs?: number;
    } = {}
  ): Promise<UpdateResult> {
    const { force = true, ...rest } = options;
    return this.updateSummariesIfNeeded(files, { force, ...rest });
  }

  /**
   * Force refresh summaries for specific files
   */
  async refreshSummaries(
    filePaths: string[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: {
      onProgress?: ProgressCallback;
      model?: string;
    } = {}
  ): Promise<UpdateResult> {
    // Get current file contents (this would need to be called with actual content)
    // For now, return empty result - this should be used by callers who have the content
    return { processed: 0, skipped: 0, failed: 0, total: 0, updatedFiles: [] };
  }
}
