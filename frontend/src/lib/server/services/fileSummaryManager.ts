import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
// Removed unused imports: getUserOctokit, parseRepoUrl
import { generateFileSummary } from './fileSummarizer';

// Single config for all environments (keep simple, predictable load on gateway)
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_CONCURRENCY = 5;

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

/**
 * Centralized file summary management service
 * Prevents redundant summary generation and provides single source of truth
 */
export class FileSummaryManager {
  private supabase: SupabaseClient;
  private sourceKey: string; // normalized key (e.g., github.com/owner/repo)
  private sourceId: string;
  private branch: string;

  constructor(supabase: SupabaseClient, sourceId: string, sourceKey: string, branch: string = 'main') {
    this.supabase = supabase;
    this.sourceKey = sourceKey;
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

    // Check all files in parallel
    const checks = files.map(async (file) => {
      const status = await this.checkSummaryStatus(file.path, file.hash);
      results.set(file.path, status);
    });

    await Promise.all(checks);
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
      model?: string;
      regenerationReason?: string;
    } = {}
  ): Promise<UpdateResult> {
    const {
      force = false,
      batchSize = DEFAULT_BATCH_SIZE,
      onProgress,
      model = 'openai/gpt-4o-mini',
      regenerationReason = 'initial',
    } = options;

    let processed = 0;
    const skipped = 0;
    let failed = 0;
    const updatedFiles: string[] = [];

    console.log(
      `[LLM] Summaries start: total=${files.length}, force=${force}, batchSize=${batchSize}, ` +
      `concurrency=${DEFAULT_CONCURRENCY}, model=${model}, reason=${regenerationReason}`
    );

    // Check which files need updates
    const statusMap = await this.checkMultipleSummaryStatus(files);

    // Filter to files that need updating
    const filesNeedingUpdate = files.filter(file => {
      const status = statusMap.get(file.path);
      return force || !status?.exists || !status?.isUpToDate;
    });

    if (filesNeedingUpdate.length === 0) {
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
      console.log(
        `[LLM] Summaries batching: batch ${i + 1}/${batches.length} size=${batch.length} (concurrency ${DEFAULT_CONCURRENCY})`
      )
    );

    for (const batch of batches) {
      await runWithConcurrency(batch, DEFAULT_CONCURRENCY, async (file) => {
        try {
          const status = statusMap.get(file.path);
          const reason = !status?.exists ? 'new file (added)' : 'content changed (hash mismatch)';
          console.log(`[LLM] Generating file summary: ${file.path} — reason: ${reason}`);

          onProgress?.({
            processed: processed + skipped,
            total: filesNeedingUpdate.length,
            currentFile: file.path,
            status: 'processing'
          });

          const fileHash = file.hash || this.calculateFileHash(file.content);
          const summary = await generateFileSummary(file.content, file.path, model);

          const { error } = await this.supabase
            .from('repo_file_summaries')
            .upsert(
              {
                source_id: this.sourceId,
                source_key: this.sourceKey,
                file_path: this.normalizeFilePath(file.path),
                file_hash: fileHash,
                summary_text: summary.summary_text,
                summary_model: model,
                branch: this.branch,
                regeneration_reason: regenerationReason,
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: 'source_id,file_path,branch',
                ignoreDuplicates: false
              }
            );

          if (error) {
            console.error(`Failed to save summary for ${file.path}:`, error);
            failed++;
          } else {
            processed++;
            updatedFiles.push(file.path);
          }
        } catch (error) {
          console.error(`Failed to generate summary for ${file.path}:`, error);
          failed++;
        }
      });
    }

    onProgress?.({
      processed: processed + skipped,
      total: filesNeedingUpdate.length,
      status: 'complete'
    });

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
      model?: string;
      regenerationReason?: string;
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
