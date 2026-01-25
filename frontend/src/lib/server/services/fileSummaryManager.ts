import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { getUserOctokit } from '../github/getUserOctokit';
import { parseRepoUrl } from '../github/github';
import { generateFileSummary } from './fileSummarizer';

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
  private repoId: string;
  private branch: string;

  constructor(supabase: SupabaseClient, repoId: string, branch: string = 'main') {
    this.supabase = supabase;
    this.repoId = repoId;
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
      .ilike('repo_id', this.repoId)
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
  async getExistingSummaries(filePaths: string[]): Promise<Map<string, any>> {
    const normalizedPaths = filePaths.map(path => this.normalizeFilePath(path));

    const { data, error } = await this.supabase
      .from('repo_file_summaries')
      .select('file_path, summary_text')
      .ilike('repo_id', this.repoId)
      .eq('branch', this.branch)
      .in('file_path', normalizedPaths);

    if (error || !data) {
      return new Map();
    }

    // Build map with fuzzy path matching
    const summariesMap = new Map<string, any>();

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
    } = {}
  ): Promise<UpdateResult> {
    const { force = false, batchSize = 20, onProgress, model = 'openai/gpt-4o-mini' } = options;

    let processed = 0;
    let skipped = 0;
    let failed = 0;
    const updatedFiles: string[] = [];

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

    for (const batch of batches) {
      // Process batch in parallel
      await Promise.all(
        batch.map(async (file) => {
          try {
            onProgress?.({
              processed: processed + skipped,
              total: filesNeedingUpdate.length,
              currentFile: file.path,
              status: 'processing'
            });

            const fileHash = file.hash || this.calculateFileHash(file.content);
            const summary = await generateFileSummary(file.content, file.path, model);

            // Save to database using direct SQL to avoid last_regenerated column reference
            const { error } = await this.supabase
              .from('repo_file_summaries')
              .upsert(
                {
                  repo_id: this.repoId,
                  file_path: this.normalizeFilePath(file.path),
                  file_hash: fileHash,
                  summary_text: summary.summary_text,
                  summary_model: model,
                  branch: this.branch,
                  regeneration_reason: 'file_changed',
                  updated_at: new Date().toISOString(),
                },
                {
                  onConflict: 'repo_id,file_path,branch',
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
        })
      );
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
   * Force refresh summaries for specific files
   */
  async refreshSummaries(
    filePaths: string[],
    options: {
      onProgress?: ProgressCallback;
      model?: string;
    } = {}
  ): Promise<UpdateResult> {
    // Get current file contents (this would need to be called with actual content)
    // For now, return empty result - this should be used by callers who have the content
    return { processed: 0, skipped: 0, failed: 0, total: 0, updatedFiles: [] };
  }
}
