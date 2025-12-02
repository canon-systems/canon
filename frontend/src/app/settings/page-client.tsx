'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings, User, Link2, Sliders, Mail, Check, X, Loader2, Github, CheckCircle2, Wrench, RefreshCw } from 'lucide-react';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import Nango from '@nangohq/frontend';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface Connection {
  id: string;
  provider: string;
  connection_id: string;
  status: string;
  metadata: any;
  created_at: string;
  updated_at: string;
}

type TabId = 'profile' | 'integrations' | 'preferences' | 'tools';

// Repository and automation types moved to /automation page

interface SettingsPageClientProps {
  user: SupabaseUser | null;
}

const tabs: Array<{ id: TabId; name: string; icon: any }> = [
  { id: 'profile', name: 'Profile', icon: User },
  { id: 'integrations', name: 'Integrations', icon: Link2 },
  { id: 'preferences', name: 'Preferences', icon: Sliders },
  { id: 'tools', name: 'Tools', icon: Wrench }
];

function BackfillSummariesUI() {
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [checkResult, setCheckResult] = useState<{
    submissionsFound: number;
    totalMissingFiles: number;
    submissions: Array<{
      submissionId: string;
      repoUrl: string;
      missingFilesCount: number;
      totalFiles: number;
      missingFiles: string[];
    }>;
  } | null>(null);
  const [backfillResult, setBackfillResult] = useState<{
    totalProcessed: number;
    totalUpdated: number;
    totalFailed: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(100);
  const [batchSize, setBatchSize] = useState(10);
  const [repoUrl, setRepoUrl] = useState('');

  // Progress tracking for SSE
  const [progress, setProgress] = useState<{
    processed: number;
    total: number;
    updated: number;
    failed: number;
    elapsed: number;
    percentage: number;
    message: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [warning, setWarning] = useState<string>('');
  const [currentFile, setCurrentFile] = useState<{
    filePath: string;
    status: 'processing' | 'completed' | 'skipped' | 'failed';
    message: string;
  } | null>(null);
  const [recentFiles, setRecentFiles] = useState<Array<{
    filePath: string;
    status: 'processing' | 'completed' | 'skipped' | 'failed';
    message: string;
    timestamp: number;
  }>>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  async function checkMissingSummaries() {
    setChecking(true);
    setError('');
    setCheckResult(null);

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
      });
      if (repoUrl.trim()) {
        params.append('repoUrl', repoUrl.trim());
      }

      const res = await fetch(`/api/docs/backfill-summaries?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.detail || 'Failed to check for missing summaries');
      }

      setCheckResult(data);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setChecking(false);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  function cancelBackfill() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setRunning(false);
    setStatusMessage('Cancelled by user');
    setProgress(null);
  }

  async function runBackfill() {
    setRunning(true);
    setError('');
    setBackfillResult(null);
    setProgress(null);
    setStatusMessage('');
    setWarning('');
    setCurrentFile(null);
    setRecentFiles([]);

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const body: any = {
        limit,
        batchSize,
      };
      if (repoUrl.trim()) {
        body.repoUrl = repoUrl.trim();
      }

      // Use fetch with streaming response
      const res = await fetch('/api/docs/backfill-summaries/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errorDetail = data.detail || data.error || 'Backfill failed';
        let errorMessage = typeof errorDetail === 'string'
          ? errorDetail
          : JSON.stringify(errorDetail, null, 2);

        // Add helpful suggestions for rate limit errors
        if (errorMessage.includes('rate limit') || errorMessage.includes('Rate limit')) {
          errorMessage += '\n\nSuggestions:\n' +
            '• Reduce batch size to 1-3\n' +
            '• Connect your GitHub account in Settings → Integrations for higher rate limits (5,000/hr vs 60/hr)\n' +
            '• Wait a few minutes and try again\n' +
            '• Process fewer submissions at a time (reduce limit)';
        }

        throw new Error(errorMessage);
      }

      // Read the stream
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      if (!reader) {
        throw new Error('Stream not available');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Check if aborted
        if (abortController.signal.aborted) {
          setStatusMessage('Cancelled');
          setRunning(false);
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
            continue;
          }

          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));

              // Handle different event types
              if (currentEvent === 'error' || data.error) {
                setError(data.error || 'An error occurred');
                setRunning(false);
                return;
              }

              if (currentEvent === 'status' || data.message) {
                setStatusMessage(data.message || 'Processing...');
              }

              if (currentEvent === 'warning') {
                setWarning(data.message || data.warning || '');
              }

              if (currentEvent === 'fileProgress') {
                // Handle file-level progress updates
                const fileInfo = {
                  filePath: data.filePath || '',
                  status: data.status || 'processing',
                  message: data.message || `Processing ${data.filePath || ''}...`,
                };

                setCurrentFile(fileInfo);

                // Add to recent files list (keep last 20)
                setRecentFiles(prev => {
                  const updated = [
                    {
                      ...fileInfo,
                      timestamp: Date.now(),
                    },
                    ...prev.filter(f => f.filePath !== fileInfo.filePath)
                  ].slice(0, 20);
                  return updated;
                });

                // Update status message with current file
                setStatusMessage(fileInfo.message);
              }

              if (currentEvent === 'progress' || data.processed !== undefined) {
                setProgress({
                  processed: data.processed || 0,
                  total: data.total || 0,
                  updated: data.updated || 0,
                  failed: data.failed || 0,
                  elapsed: data.elapsed || 0,
                  percentage: data.percentage || 0,
                  message: data.message || `Processing submission ${data.processed || 0} of ${data.total || 0}...`,
                });
                setStatusMessage(data.message || `Processing submission ${data.processed || 0} of ${data.total || 0}...`);
              }

              if (currentEvent === 'complete' || data.totalProcessed !== undefined) {
                // Complete event
                setBackfillResult({
                  totalProcessed: data.totalProcessed || 0,
                  totalUpdated: data.totalUpdated || 0,
                  totalFailed: data.totalFailed || 0,
                });
                setStatusMessage(`Completed in ${Math.round((data.elapsed || 0) / 60)} minutes`);
                setRunning(false);

                // If there are failures, show more details
                if (data.totalFailed > 0 && data.results) {
                  const failedResults = data.results.filter((r: any) => !r.success);
                  if (failedResults.length > 0) {
                    console.error('Failed submissions:', failedResults);
                  }
                }
                return;
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', line, parseError);
            }

            // Reset event after processing
            currentEvent = '';
          }

          // Empty line indicates end of event
          if (line.trim() === '') {
            currentEvent = '';
          }
        }
      }
    } catch (err: any) {
      // Don't show error if it was just a cancellation
      if (err.name === 'AbortError') {
        setStatusMessage('Cancelled');
      } else {
        setError(err.message || String(err));
      }
      setRunning(false);
    } finally {
      abortControllerRef.current = null;
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-white mb-2">Backfill File Summaries</h2>
        <p className="text-white/70">
          Generate summaries for files that were used in previous documentation generations but don't have summaries yet.
        </p>
      </div>

      <div className="space-y-6">
        {/* Configuration */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white mb-4">Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Limit (number of submissions to check)
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 100)}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-white/40 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                disabled={checking || running}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Batch Size (submissions to process in parallel)
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 10)}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-white/40 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                disabled={checking || running}
              />
              <p className="text-xs text-white/50 mt-1">
                Lower values (1-5) reduce rate limit issues. Higher values (10+) are faster but may hit GitHub rate limits.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Repository URL (optional - filter by specific repo)
              </label>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-white/40 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                disabled={checking || running}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white mb-4">Actions</h3>
          <div className="flex gap-3">
            <button
              onClick={checkMissingSummaries}
              disabled={checking || running}
              className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white transition-colors hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Check Missing Summaries
                </>
              )}
            </button>
            {!running ? (
              <button
                onClick={runBackfill}
                disabled={checking}
                className="flex items-center gap-2 rounded-lg border border-blue-500/50 bg-blue-500/10 px-4 py-2 text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className="h-4 w-4" />
                Start Backfill
              </button>
            ) : (
              <button
                onClick={cancelBackfill}
                className="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-red-300 transition-colors hover:bg-red-500/20"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Progress Indicator */}
        {running && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-white mb-4">Progress</h3>

            {/* Current File Being Processed */}
            {currentFile && (
              <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
                  <div className="flex-1">
                    <p className="text-blue-200 text-sm font-medium">Current File</p>
                    <p className="text-blue-100 text-xs font-mono mt-1 break-all">{currentFile.filePath}</p>
                    <p className="text-blue-200/80 text-xs mt-1">{currentFile.message}</p>
                  </div>
                  {currentFile.status === 'completed' && (
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                  )}
                  {currentFile.status === 'failed' && (
                    <X className="h-5 w-5 text-red-400" />
                  )}
                  {currentFile.status === 'skipped' && (
                    <CheckCircle2 className="h-5 w-5 text-yellow-400" />
                  )}
                </div>
              </div>
            )}

            {/* Status Message */}
            {statusMessage && !currentFile && (
              <div className="mb-4">
                <p className="text-white/80 text-sm">{statusMessage}</p>
              </div>
            )}

            {/* Warning */}
            {warning && (
              <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                <p className="text-yellow-200 text-sm">{warning}</p>
              </div>
            )}

            {/* Progress Bar */}
            {progress && (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white/80 text-sm">
                      {progress.processed} of {progress.total} submissions processed
                    </span>
                    <span className="text-white/60 text-sm">{progress.percentage}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full transition-all duration-300 ease-out"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-white/60">Files Updated</p>
                    <p className="text-green-400 font-semibold text-lg">{progress.updated}</p>
                  </div>
                  <div>
                    <p className="text-white/60">Failed</p>
                    <p className={`font-semibold text-lg ${progress.failed > 0 ? 'text-red-400' : 'text-white/80'}`}>
                      {progress.failed}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/60">Time Elapsed</p>
                    <p className="text-white/80 font-semibold text-lg">
                      {Math.floor(progress.elapsed / 60)}:{(progress.elapsed % 60).toString().padStart(2, '0')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Files List */}
            {recentFiles.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-white/80 mb-3">Recent Files</h4>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {recentFiles.slice(0, 10).map((file) => (
                    <div
                      key={`${file.filePath}-${file.timestamp}`}
                      className="flex items-start gap-2 text-xs p-2 rounded border border-white/5 bg-white/5"
                    >
                      {file.status === 'processing' && (
                        <Loader2 className="h-3 w-3 animate-spin text-blue-400 mt-0.5 flex-shrink-0" />
                      )}
                      {file.status === 'completed' && (
                        <CheckCircle2 className="h-3 w-3 text-green-400 mt-0.5 flex-shrink-0" />
                      )}
                      {file.status === 'failed' && (
                        <X className="h-3 w-3 text-red-400 mt-0.5 flex-shrink-0" />
                      )}
                      {file.status === 'skipped' && (
                        <CheckCircle2 className="h-3 w-3 text-yellow-400 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white/70 font-mono truncate">{file.filePath}</p>
                        <p className={`text-xs mt-0.5 ${file.status === 'completed' ? 'text-green-400/80' :
                          file.status === 'failed' ? 'text-red-400/80' :
                            file.status === 'skipped' ? 'text-yellow-400/80' :
                              'text-blue-400/80'
                          }`}>
                          {file.status === 'processing' ? 'Processing...' :
                            file.status === 'completed' ? 'Completed' :
                              file.status === 'skipped' ? 'Skipped (already exists)' :
                                `Failed: ${file.message}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Loading state when progress not yet available */}
            {!progress && (
              <div className="flex items-center gap-3 text-white/60">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Initializing backfill process...</span>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            <p className="font-medium">Error</p>
            <p className="text-sm mt-1 whitespace-pre-wrap">{error}</p>
          </div>
        )}

        {/* Check Results */}
        {checkResult && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-white mb-4">Check Results</h3>
            <div className="space-y-2 text-white/80">
              <p>
                <span className="font-semibold">Submissions Found:</span> {checkResult.submissionsFound}
              </p>
              <p>
                <span className="font-semibold">Total Missing Files:</span> {checkResult.totalMissingFiles}
              </p>
            </div>
            {checkResult.submissions.length > 0 && (
              <div className="mt-4 max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-2 text-white/60">Submission ID</th>
                      <th className="text-left py-2 text-white/60">Repository</th>
                      <th className="text-right py-2 text-white/60">Missing Files</th>
                      <th className="text-right py-2 text-white/60">Missing / Total Files</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checkResult.submissions.map((sub) => (
                      <tr key={sub.submissionId} className="border-b border-white/5">
                        <td className="py-2 text-white/80 font-mono text-xs">{sub.submissionId.slice(0, 8)}...</td>
                        <td className="py-2 text-white/80">{sub.repoUrl}</td>
                        <td className="py-2 text-right text-white/80">{sub.missingFilesCount}</td>
                        <td className="py-2 text-right text-white/80">
                          {sub.missingFilesCount} / {sub.totalFiles}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Backfill Results */}
        {backfillResult && !running && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              {backfillResult.totalFailed === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              ) : (
                <X className="h-5 w-5 text-yellow-400" />
              )}
              Backfill Results
            </h3>
            <div className="space-y-3 text-white/80">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-white/60 text-sm mb-1">Submissions Processed</p>
                  <p className="font-semibold text-lg">{backfillResult.totalProcessed}</p>
                </div>
                <div>
                  <p className="text-white/60 text-sm mb-1">Files Updated</p>
                  <p className="font-semibold text-lg text-green-400">{backfillResult.totalUpdated}</p>
                </div>
                <div>
                  <p className="text-white/60 text-sm mb-1">Failed</p>
                  <p className={`font-semibold text-lg ${backfillResult.totalFailed > 0 ? 'text-red-400' : 'text-white/80'}`}>
                    {backfillResult.totalFailed}
                  </p>
                </div>
              </div>

              {backfillResult.totalFailed > 0 && (
                <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                  <p className="text-yellow-200 text-sm">
                    Some submissions failed to process. This may be due to:
                  </p>
                  <ul className="text-yellow-200/80 text-sm mt-2 list-disc list-inside space-y-1">
                    <li>Rate limiting (try reducing batch size or connecting GitHub)</li>
                    <li>Missing repository access</li>
                    <li>Invalid file paths or deleted files</li>
                  </ul>
                  <p className="text-yellow-200/60 text-xs mt-2">
                    Check the browser console for detailed error messages.
                  </p>
                </div>
              )}

              {backfillResult.totalFailed === 0 && backfillResult.totalUpdated > 0 && (
                <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                  <p className="text-green-200 text-sm">
                    ✓ Successfully generated summaries for {backfillResult.totalUpdated} file(s)
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsPageClient({ user: initialUser }: SettingsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [connectionToDisconnect, setConnectionToDisconnect] = useState<{ connectionId: string; provider: string } | null>(null);

  // Repository management moved to /automation page

  // Get active tab from URL query param
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const validTabs: TabId[] = ['profile', 'integrations', 'preferences', 'tools'];
    if (tabParam && validTabs.includes(tabParam as TabId)) {
      setActiveTab(tabParam as TabId);
    }

    // Check for URL params (for OAuth callbacks)
    const successParam = searchParams.get('success');
    const errorParam = searchParams.get('error');
    if (successParam === 'true') {
      const provider = searchParams.get('provider') || 'service';
      setSuccess(`Successfully connected to ${provider}!`);
      // Clean URL but keep tab param
      const tab = searchParams.get('tab') || 'integrations';
      router.replace(`/settings?tab=${tab}`);
      if (tabParam !== 'integrations') {
        setActiveTab('integrations');
      }
    }
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      const tab = searchParams.get('tab') || 'integrations';
      router.replace(`/settings?tab=${tab}`);
      if (tabParam !== 'integrations') {
        setActiveTab('integrations');
      }
    }

    if (tabParam === 'integrations' || (!tabParam && activeTab === 'integrations')) {
      loadConnections();
    }
  }, [searchParams, router]);

  useEffect(() => {
    loadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload connections when switching to integrations tab
  useEffect(() => {
    if (activeTab === 'integrations' && connections.length === 0 && !loading) {
      loadConnections();
    }
  }, [activeTab]);



  async function loadConnections() {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/list');
      if (!response.ok) throw new Error('Failed to load connections');
      const data = await response.json();
      setConnections(data.connections || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }

  async function connectToProvider(providerName: string) {
    setConnecting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: providerName })
      });

      if (!response.ok) {
        const data = await response.json();
        const errorMsg = data.detail || data.error || 'Failed to initiate connection';
        console.error('Connection error details:', data);
        throw new Error(errorMsg);
      }

      const { sessionToken, provider } = await response.json();

      if (!sessionToken) {
        throw new Error('No session token returned');
      }

      // Initialize Nango frontend SDK and open Connect UI
      const nango = new Nango();
      const connect = nango.openConnectUI({
        onEvent: async (event) => {
          if (event.type === 'close') {
            setConnecting(false);
          } else if (event.type === 'connect') {
            const connectionId = event.payload?.connectionId;
            const providerConfigKey = event.payload?.providerConfigKey || provider;

            if (connectionId) {
              try {
                const saveResponse = await fetch('/api/integrations/save', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    connectionId,
                    provider: providerConfigKey
                  })
                });

                if (!saveResponse.ok) {
                  const errorData = await saveResponse.json();
                  console.error('Failed to save connection:', errorData);
                }
              } catch (saveErr) {
                console.error('Error saving connection:', saveErr);
              }
            }

            const providerDisplayName = getProviderDisplayName(providerName);
            setSuccess(`Successfully connected to ${providerDisplayName}!`);
            setConnecting(false);

            await loadConnections();

            setTimeout(() => {
              setSuccess('');
            }, 5000);
          }
        }
      });

      connect.setSessionToken(sessionToken);
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
      console.error('Connection error:', err);
      setConnecting(false);
    }
  }

  function openDisconnectModal(connectionId: string, provider: string) {
    setConnectionToDisconnect({ connectionId, provider });
    setDisconnectModalOpen(true);
  }

  function closeDisconnectModal() {
    setDisconnectModalOpen(false);
    setConnectionToDisconnect(null);
  }

  async function disconnect(connectionId: string, provider: string) {
    try {
      const response = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId, provider })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to disconnect');
      }

      setSuccess(`Disconnected from ${getProviderDisplayName(provider)}`);
      await loadConnections();
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect');
    }
  }

  function getProviderDisplayName(provider: string) {
    if (provider === 'googledocs' || provider === 'google-docs') return 'Google Docs';
    if (provider === 'github') return 'GitHub';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  function getProviderName(provider: string) {
    if (provider === 'googledocs') return 'Google Docs';
    if (provider === 'github') return 'GitHub';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function setActiveTabAndUpdateUrl(tabId: TabId) {
    setActiveTab(tabId);
    router.push(`/settings?tab=${tabId}`, { scroll: false });
  }

  // Automation functionality moved to /automation page

  // Repository management moved to /automation page

  // Automation functionality moved to /automation page
  // All automation-related functions removed

  // Repository management moved to /automation page

  // Connection status helpers for integrations tab
  const isNotionConnected = connections.some(c => c.provider === 'notion' && c.status === 'active');
  const isConfluenceConnected = connections.some(c => c.provider === 'confluence' && c.status === 'active');
  const isGoogleDocsConnected = connections.some(c => c.provider === 'googledocs' && c.status === 'active');
  const isGitHubConnected = connections.some(c => c.provider === 'github' && c.status === 'active');

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="h-8 w-8 text-white" />
            <h1 className="text-3xl font-bold text-white">Settings</h1>
          </div>
          <p className="text-white/70">
            Manage your account settings, integrations, and preferences.
          </p>
        </div>

        {/* Tabs Navigation */}
        <div className="mb-8 border-b border-white/10">
          <nav className="flex gap-1" aria-label="Settings tabs">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTabAndUpdateUrl(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.id
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-white/60 hover:text-white hover:border-white/20'
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'profile' ? (
            /* Profile Tab */
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-white mb-2">Profile</h2>
                <p className="text-white/70">Manage your account information</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                      <User className="h-8 w-8 text-white/70" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white">{initialUser?.email || 'User'}</p>
                      <p className="text-sm text-white/60">Account ID: {initialUser?.id || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">
                        <Mail className="inline h-4 w-4 mr-2" />
                        Email Address
                      </label>
                      <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white">
                        {initialUser?.email || 'Not available'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <p className="text-sm text-white/60">
                      Profile management features coming soon. For now, your account information is managed through authentication.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'integrations' ? (
            /* Integrations Tab */
            <div>
              {/* Success/Error Messages */}
              {success && (
                <div className="mb-6 rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-green-200">
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5" />
                    <p>{success}</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-200">
                  <p className="font-medium">Error</p>
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {/* Available Integrations */}
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-white mb-4">Available Integrations</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {/* GitHub Integration */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                          <Github className="h-7 w-7 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">GitHub</h3>
                          <p className="text-sm text-white/60">Access your repositories and private repos</p>
                        </div>
                      </div>
                      {isGitHubConnected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    {isGitHubConnected ? (
                      <button
                        onClick={() => {
                          const conn = connections.find(c => c.provider === 'github');
                          if (conn) openDisconnectModal(conn.connection_id, 'github');
                        }}
                        className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => connectToProvider('github')}
                        disabled={connecting}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {connecting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Link2 className="h-4 w-4" />
                            Connect GitHub
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Notion Integration */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                          <IntegrationLogos provider="notion" size={28} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Notion</h3>
                          <p className="text-sm text-white/60">Access and sync your Notion pages</p>
                        </div>
                      </div>
                      {isNotionConnected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    {isNotionConnected ? (
                      <button
                        onClick={() => {
                          const conn = connections.find(c => c.provider === 'notion');
                          if (conn) openDisconnectModal(conn.connection_id, 'notion');
                        }}
                        className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => connectToProvider('notion')}
                        disabled={connecting}
                        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {connecting ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connecting...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Link2 className="h-4 w-4" />
                            Connect Notion
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Confluence Integration */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                          <IntegrationLogos provider="confluence" size={28} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Confluence</h3>
                          <p className="text-sm text-white/60">Access and sync your Confluence pages</p>
                        </div>
                      </div>
                      {isConfluenceConnected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    {isConfluenceConnected ? (
                      <button
                        onClick={() => {
                          const conn = connections.find(c => c.provider === 'confluence');
                          if (conn) openDisconnectModal(conn.connection_id, 'confluence');
                        }}
                        className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Disconnect
                      </button>
                    ) : (<p>Connect Confluence (Coming Soon)</p>
                      // <button
                      //   onClick={() => connectToProvider('confluence')}
                      //   disabled={connecting}
                      //   className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      // >
                      //   {connecting ? (
                      //     <span className="flex items-center justify-center gap-2">
                      //       <Loader2 className="h-4 w-4 animate-spin" />
                      //       Connecting...
                      //     </span>
                      //   ) : (
                      //     <span className="flex items-center justify-center gap-2">
                      //       <Link2 className="h-4 w-4" />
                      //       Connect Confluence (Coming Soon)
                      //     </span>
                      //   )}
                      // </button>
                    )}
                  </div>

                  {/* Google Docs Integration */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/5">
                          <IntegrationLogos provider="google-docs" size={28} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">Google Docs</h3>
                          <p className="text-sm text-white/60">Access and sync your Google Docs</p>
                        </div>
                      </div>
                      {isGoogleDocsConnected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-3 py-1 text-xs text-green-300">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    {isGoogleDocsConnected ? (
                      <button
                        onClick={() => {
                          const conn = connections.find(c => c.provider === 'googledocs');
                          if (conn) openDisconnectModal(conn.connection_id, 'googledocs');
                        }}
                        className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Disconnect
                      </button>
                    ) : (<p>Connect Google Docs (Coming Soon)</p>
                      // <button
                      //   onClick={() => connectToProvider('google-docs')}
                      //   disabled={connecting}
                      //   className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      // >
                      //   {connecting ? (
                      //     <span className="flex items-center justify-center gap-2">
                      //       <Loader2 className="h-4 w-4 animate-spin" />
                      //       Connecting...
                      //     </span>
                      //   ) : (
                      //     <span className="flex items-center justify-center gap-2">
                      //       {/* <Link2 className="h-4 w-4" /> */}
                      //       Connect Google Docs (Coming Soon)
                      //     </span>
                      //   )}
                      // </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Connections */}
              <div>
                <h2 className="text-xl font-semibold text-white mb-4">Active Connections</h2>
                {loading ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-white/50 mx-auto mb-2" />
                    <p className="text-white/60">Loading connections...</p>
                  </div>
                ) : connections.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                    <Link2 className="h-12 w-12 text-white/30 mx-auto mb-4" />
                    <p className="text-white/60">No active connections</p>
                    <p className="text-sm text-white/40 mt-2">Connect an integration above to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {connections.map(connection => (
                      <div key={connection.id} className="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
                              {connection.provider === 'github' ? (
                                <Github className="h-6 w-6 text-white" />
                              ) : (
                                <IntegrationLogos
                                  provider={(connection.provider === 'googledocs' ? 'google-docs' : connection.provider) as 'notion' | 'slack' | 'confluence' | 'google-docs' | 'jira'}
                                  size={24}
                                />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-white">{getProviderName(connection.provider)}</p>
                              <p className="text-xs text-white/60">
                                Connected {formatDate(connection.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {connection.status === 'active' && (
                              <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-300">
                                <Check className="h-3 w-3" />
                                Active
                              </span>
                            )}
                            <button
                              onClick={() => openDisconnectModal(connection.connection_id, connection.provider)}
                              className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-500/20"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'preferences' ? (
            /* Preferences Tab */
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-white mb-2">Preferences</h2>
                <p className="text-white/70">Customize your application preferences</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Sliders className="h-16 w-16 text-white/30 mx-auto mb-4" />
                    <p className="text-white/60 mb-2">Preferences coming soon</p>
                    <p className="text-sm text-white/40">
                      Configure default LLM models, prompt settings, and other preferences here.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Tools Tab */
            <BackfillSummariesUI />
          )}
        </div>
      </div>

      {/* Disconnect Confirmation Modal */}
      {disconnectModalOpen && connectionToDisconnect && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={closeDisconnectModal}
          onKeyDown={(e) => e.key === 'Escape' && closeDisconnectModal()}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-xl font-semibold text-white">Disconnect Integration</h2>
            <p className="mb-6 text-white/70">
              Are you sure you want to disconnect from <span className="font-semibold text-white">
                {getProviderName(connectionToDisconnect.provider)}
              </span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="rounded-lg border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
                onClick={closeDisconnectModal}
              >
                Cancel
              </button>
              <button
                className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-red-300 transition-colors hover:bg-red-500/20"
                onClick={async () => {
                  if (connectionToDisconnect) {
                    await disconnect(connectionToDisconnect.connectionId, connectionToDisconnect.provider);
                    closeDisconnectModal();
                  }
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
