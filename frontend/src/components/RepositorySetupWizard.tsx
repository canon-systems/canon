'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, CheckCircle2, Github, FileText, Loader2, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RepositorySetupWizardProps {
  sourceId: string;
  onComplete?: () => void;
}

type SetupStep = 'connect' | 'analyze';

interface SetupStatus {
  status: string;
  totalFiles: number;
  summarizedFiles: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  currentFile?: string;
  processingStatus?: string;
  lastProgressUpdate?: string;
  processingRate?: number;
  estimatedTimeRemaining?: number;
  recentFiles?: Array<{ path: string; status: 'completed' | 'skipped' | 'processing'; timestamp: number }>;
  progress?: number;
}


interface Repository {
  id: string;
  name: string;
  repo_url?: string;
  external_url?: string;
  default_branch: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function RepositorySetupWizard({ sourceId, onComplete: _onComplete }: RepositorySetupWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<SetupStep>('connect');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repository, setRepository] = useState<Repository | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [isLoadingSetupStatus, setIsLoadingSetupStatus] = useState(true);
  const [setupProgress, setSetupProgress] = useState<{
    step: string;
    message: string;
    progress: number;
    startTime: number;
    phase?: string;
    currentFile?: string;
    processingStatus?: string;
    recentFiles?: Array<{ path: string; status: 'completed' | 'skipped' | 'processing'; timestamp: number }>;
    processingRate?: number; // files per minute
    estimatedTimeRemaining?: number; // in seconds
  } | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const steps = [
    { id: 'connect' as SetupStep, title: '1. Repository Status', icon: Github },
    { id: 'analyze' as SetupStep, title: '2. File Analysis', icon: FileText },
  ];

  // Prevent navigation away during setup process and handle cleanup
  useEffect(() => {
    if (setupProgress && setupProgress.phase !== 'complete' && setupProgress.phase !== 'failed') {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = 'Repository setup is in progress. Are you sure you want to leave?';
        return 'Repository setup is in progress. Are you sure you want to leave?';
      };

      window.addEventListener('beforeunload', handleBeforeUnload);

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [setupProgress]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      // Clear the polling interval when component unmounts
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Define pollSetupStatus first since it's used by loadSetupStatus
  const pollSetupStatus = useCallback(() => {
    let pollCount = 0;
    let previousSummarizedFiles = 0;
    let processingStartTime: number | null = null;
    const recentFiles: Array<{ path: string; status: 'completed' | 'skipped' | 'processing'; timestamp: number }> = [];

    pollIntervalRef.current = setInterval(async () => {
      pollCount++;
      const response = await fetch(`/api/repos/setup?sourceId=${sourceId}`);
      const data = await response.json();

      if (response.ok && data.setup) {
        setSetupStatus(data.setup);

        const now = Date.now();
        const elapsed = setupProgress ? now - setupProgress.startTime : 0;
        const elapsedSeconds = Math.floor(elapsed / 1000);

        const totalFiles = data.setup.totalFiles || 0;
        const summarizedFiles = data.setup.summarizedFiles || 0;
        const currentFile = data.setup.currentFile;
        const processingStatus = data.setup.processingStatus;

        // Track processing rate (files per minute)
        let processingRate = 0;
        if (processingStartTime && summarizedFiles > previousSummarizedFiles) {
          const processedSinceStart = summarizedFiles - previousSummarizedFiles;
          const timeSinceStart = (now - processingStartTime) / 1000 / 60; // minutes
          processingRate = processedSinceStart / timeSinceStart;
        }

        // Update recent files list
        if (currentFile && processingStatus) {
          // Remove existing entry for this file
          const existingIndex = recentFiles.findIndex(f => f.path === currentFile);
          if (existingIndex >= 0) {
            recentFiles.splice(existingIndex, 1);
          }

          // Add current file to recent files
          recentFiles.unshift({
            path: currentFile,
            status: processingStatus.includes('completed') ? 'completed' :
              processingStatus.includes('skipped') ? 'skipped' : 'processing',
            timestamp: now
          });

          // Keep only last 10 files
          if (recentFiles.length > 10) {
            recentFiles.splice(10);
          }
        }

        // Calculate estimated time remaining
        let estimatedTimeRemaining: number | undefined;
        const remainingFiles = totalFiles - summarizedFiles;
        if (processingRate > 0 && remainingFiles > 0) {
          estimatedTimeRemaining = (remainingFiles / processingRate) * 60; // seconds
        }

        let progress: number;
        let step: string;
        let message: string;
        let phase: string;

        if (data.setup.status === 'ready') {
          // Setup completed successfully
          progress = 100;
          step = '✅ Setup Complete!';
          message = `Successfully processed ${totalFiles} files with ${summarizedFiles} AI-generated summaries. Redirecting to repositories...`;
          phase = 'complete';

          setSetupProgress(prev => prev ? {
            ...prev,
            step,
            message,
            progress,
            phase,
            currentFile: undefined,
            processingStatus: 'completed',
            recentFiles,
            processingRate,
            estimatedTimeRemaining: 0
          } : null);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          pollIntervalRef.current = null;

          // Redirect to repositories route after showing success message
          setTimeout(() => {
            router.push(`/repos`);
          }, 3000);

          setTimeout(() => setSetupProgress(null), 5000);

        } else if (data.setup.status === 'failed') {
          // Setup failed
          progress = 0;
          step = '❌ Setup Failed';
          message = data.setup.errorMessage || 'Repository setup encountered an error.';
          phase = 'failed';

          setSetupProgress(prev => prev ? {
            ...prev,
            step,
            message,
            progress,
            phase,
            currentFile,
            processingStatus,
            recentFiles,
            processingRate,
            estimatedTimeRemaining
          } : null);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          pollIntervalRef.current = null;
          setError(data.setup.errorMessage || 'Setup failed');
          setTimeout(() => {
            router.push('/repos');
          }, 2000);

        } else if (data.setup.status === 'analyzing') {
          // Set processing start time when we first see summarized files
          if (processingStartTime === null && summarizedFiles > 0) {
            processingStartTime = now;
          }

          if (summarizedFiles > 0 && totalFiles > 0) {
            // AI summary generation phase - most time-consuming
            progress = Math.min(95, 20 + (summarizedFiles / totalFiles) * 75);
            step = '🤖 Generating AI Summaries';

            if (currentFile) {
              const fileName = currentFile.split('/').pop() || currentFile;
              message = `Processing: ${fileName} (${summarizedFiles}/${totalFiles})`;
            } else {
              message = `AI processing file ${summarizedFiles} of ${totalFiles}... ${Math.round((summarizedFiles / totalFiles) * 100)}% complete`;
            }

            phase = 'ai-processing';
          } else if (totalFiles > 0) {
            // Analysis complete, about to start AI processing
            progress = 20;
            step = '🔄 Preparing AI Processing';
            message = `Repository scanned: ${totalFiles} files found. Starting AI analysis...`;
            phase = 'transitioning';
          } else {
            // Still scanning files
            const baseProgress = Math.min(15, 5 + (pollCount * 2));
            progress = baseProgress;
            step = '🔍 Scanning Repository';
            message = `Discovering files and structure... (${elapsedSeconds}s)`;
            phase = 'scanning';
          }
        } else {
          // Unknown status or still initializing
          progress = Math.max(5, Math.min(10, pollCount * 2));
          step = '⚙️ Initializing Setup';
          message = `Starting repository analysis... (${elapsedSeconds}s)`;
          phase = 'initializing';
        }

        setSetupProgress(prev => prev ? {
          ...prev,
          step,
          message,
          progress,
          phase,
          currentFile,
          processingStatus,
          recentFiles: [...recentFiles],
          processingRate,
          estimatedTimeRemaining
        } : null);

        previousSummarizedFiles = summarizedFiles;
      }
    }, 1500); // Poll every 1.5 seconds for even more responsive updates

    // Stop polling after 25 minutes (increased timeout)
    setTimeout(() => {
      if (!setupProgress || setupProgress.progress < 100) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        setSetupProgress(prev => prev ? {
          ...prev,
          step: '⏱️ Taking Longer Than Expected',
          message: 'Setup is taking longer than usual. The process continues in the background. Refresh this page to check the latest status.',
          progress: Math.max(10, setupProgress?.progress || 10)
        } : null);
      }
    }, 1500000); // 25 minutes
  }, [sourceId, setSetupStatus, setSetupProgress, setError, setupProgress, pollIntervalRef, router]);

  const loadSetupStatus = useCallback(async () => {
    try {
      setIsLoadingSetupStatus(true);
      const response = await fetch(`/api/repos/setup?sourceId=${sourceId}`);
      const data = await response.json();

      if (response.ok) {
        setSetupStatus(data.setup);

        // Check if there's an ongoing setup process that we need to resume
        if (data.setup?.status === 'analyzing') {
          // Restore progress state from database
          const progressFromDB = data.setup;
          const progressPercent = progressFromDB.progress || (progressFromDB.totalFiles > 0 ? (progressFromDB.summarizedFiles / progressFromDB.totalFiles) * 100 : 0);

          // Calculate current phase based on progress and status
          let phase: string = 'analyzing';
          if (progressFromDB.processingStatus?.includes('ai-processing') || progressPercent >= 20) {
            phase = 'ai-processing';
          } else if (progressFromDB.processingStatus?.includes('scanning') || progressPercent < 5) {
            phase = 'scanning';
          } else if (progressFromDB.processingStatus?.includes('transitioning') || (progressPercent >= 5 && progressPercent < 20)) {
            phase = 'transitioning';
          }

          // Calculate estimated time remaining based on stored data
          let estimatedTimeRemaining = progressFromDB.estimatedTimeRemaining;
          if (!estimatedTimeRemaining && progressFromDB.processingRate && progressFromDB.processingRate > 0) {
            const remainingFiles = progressFromDB.totalFiles - progressFromDB.summarizedFiles;
            estimatedTimeRemaining = (remainingFiles / progressFromDB.processingRate) * 60;
          }

          setSetupProgress({
            step: progressFromDB.currentFile ? `Processing: ${progressFromDB.currentFile.split('/').pop()}` : 'Resuming file analysis...',
            message: progressFromDB.currentFile ?
              `Currently processing ${progressFromDB.currentFile.split('/').pop()}` :
              'Resuming repository setup process...',
            progress: progressPercent,
            startTime: Date.now(),
            phase,
            currentFile: progressFromDB.currentFile,
            processingStatus: progressFromDB.processingStatus,
            recentFiles: progressFromDB.recentFiles || [],
            processingRate: progressFromDB.processingRate,
            estimatedTimeRemaining,
          });

          // Resume polling for the ongoing process
          pollSetupStatus();
        } else if (data.setup?.status === 'ready') {
          // Setup is ready, will redirect to documentation when progress completes
        }
      } else {
        setError(data.error || 'Failed to load setup status');
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
      setError('Failed to load setup status');
    } finally {
      setIsLoadingSetupStatus(false);
    }
  }, [sourceId, setIsLoadingSetupStatus, setSetupStatus, setSetupProgress, pollSetupStatus]);

  const loadRepositoryData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // First load repository data
      const repoResponse = await fetch(`/api/repos/${sourceId}`);
      if (!repoResponse.ok) {
        throw new Error('Failed to load source data');
      }
      const repoData = await repoResponse.json();
      setRepository(repoData);

      // Then load setup status
      await loadSetupStatus();
    } catch (err: unknown) {
      console.error('Failed to load source data:', err);
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to load source data';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [sourceId, setIsLoading, setError, setRepository, loadSetupStatus]);

  // Load repository and setup data on mount
  useEffect(() => {
    loadRepositoryData();
  }, [sourceId, loadRepositoryData]);

  const handleStartSetup = async () => {
    if (!repository) {
      setError('Repository data not loaded');
      return;
    }

    setIsLoading(true);
    setError(null);

    // Initialize progress tracking
    setSetupProgress({
      step: 'Initializing',
      message: 'Preparing repository analysis...',
      progress: 0,
      startTime: Date.now(),
      phase: 'initializing'
    });

    try {
      const response = await fetch('/api/repos/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId,
          repoUrl: repository.repo_url || repository.external_url, // Use actual source URL
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSetupStatus(data.setup);
        setCurrentStep('analyze');

        // Update progress for analysis phase
        setSetupProgress(prev => prev ? {
          ...prev,
          step: 'Analyzing Repository',
          message: 'Scanning repository files and structure...',
          progress: 10
        } : null);

        // Poll for completion
        pollSetupStatus();
      } else {
        setSetupProgress(null);
        setError(data.error || 'Failed to start setup');
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
      setSetupProgress(null);
      setError('Failed to start repository setup');
    } finally {
      setIsLoading(false);
    }
  };

  const getStepStatus = (stepId: SetupStep) => {
    if (setupStatus?.status === 'ready' && ['connect', 'analyze'].includes(stepId)) {
      return 'completed';
    }
    if (currentStep === stepId) return 'active';
    if (steps.findIndex(s => s.id === currentStep) > steps.findIndex(s => s.id === stepId)) {
      return 'completed';
    }
    return 'pending';
  };

  if (isLoading && !setupProgress) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
          <div>
            <p className="text-white font-medium">Loading Repository Information</p>
            <p className="text-white/60 text-sm mt-1">Fetching repository details and current setup status...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !repository) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">{error}</p>
        <Button
          onClick={() => loadRepositoryData()}
          variant="secondary"
        >
          Try Again
        </Button>
      </div>
    );
  }

  // Show setup progress if active
  if (setupProgress) {
    const elapsed = Math.floor((Date.now() - setupProgress.startTime) / 1000);
    const elapsedDisplay = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

    return (
      <div className="max-w-2xl mx-auto">
        <div className="glass-panel p-8 text-center">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              {setupProgress.phase === 'complete' ? '✅ Setup Complete!' :
                setupProgress.phase === 'failed' ? '❌ Setup Failed' :
                  'Setting Up Repository'}
            </h2>
            <p className="text-white/70 mb-6">
              {setupProgress.phase === 'scanning' &&
                '🔍 Scanning your repository structure and discovering all relevant files. This initial phase identifies what needs to be analyzed.'
              }
              {setupProgress.phase === 'transitioning' &&
                '🔄 Repository scan complete! Preparing for AI-powered analysis of all discovered files. This next phase creates intelligent summaries for change detection.'
              }
              {setupProgress.phase === 'ai-processing' &&
                '🤖 AI is now analyzing your codebase and generating comprehensive summaries. This is the most valuable step - creating intelligent insights for automated documentation updates.'
              }
              {setupProgress.phase === 'complete' &&
                '🎉 Repository setup completed successfully! Your codebase is now ready for intelligent, automated documentation updates.'
              }
              {setupProgress.phase === 'failed' &&
                '❌ Repository setup encountered an error. Please check the details below and try again.'
              }
              {!setupProgress.phase &&
                'This process analyzes your entire codebase and creates AI-powered summaries for intelligent change detection. This is the most comprehensive step and may take several minutes depending on repository size.'
              }
            </p>
          </div>

          <div className="space-y-6">
            {/* Progress bar with phases */}
            <div className="space-y-3">
              <div className="w-full bg-white/10 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 h-4 rounded-full transition-all duration-700 ease-out relative"
                  style={{ width: `${setupProgress.progress}%` }}
                >
                  {/* Animated shimmer effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
                </div>
              </div>

              {/* Phase indicators */}
              <div className="flex justify-between text-xs text-white/50 px-1">
                <div className={`transition-colors duration-300 ${setupProgress.phase === 'scanning' || setupProgress.phase === 'initializing' ? 'text-blue-400 font-medium' : setupProgress.progress >= 5 ? 'text-green-400' : ''}`}>
                  Scan
                </div>
                <div className={`transition-colors duration-300 ${setupProgress.phase === 'transitioning' ? 'text-purple-400 font-medium' : setupProgress.progress >= 20 ? 'text-green-400' : ''}`}>
                  Prepare
                </div>
                <div className={`transition-colors duration-300 ${setupProgress.phase === 'ai-processing' ? 'text-purple-400 font-medium animate-pulse' : setupProgress.progress >= 95 ? 'text-green-400' : ''}`}>
                  AI Process
                </div>
                <div className={`transition-colors duration-300 ${setupProgress.phase === 'complete' ? 'text-green-400 font-medium' : ''}`}>
                  Complete
                </div>
              </div>
            </div>

            {/* Current step */}
            <div className="text-center">
              <h3 className="text-lg font-medium text-white mb-2">{setupProgress.step}</h3>
              <p className="text-white/60 text-sm mb-4">{setupProgress.message}</p>
              <div className="flex justify-center items-center gap-4 text-xs text-white/50 mb-4">
                <span>Progress: {setupProgress.progress}%</span>
                <span>•</span>
                <span>Elapsed: {elapsedDisplay}</span>
                {setupProgress.processingRate && setupProgress.processingRate > 0 && (
                  <>
                    <span>•</span>
                    <span>Rate: {setupProgress.processingRate.toFixed(1)} files/min</span>
                  </>
                )}
              </div>

              {/* Current file being processed */}
              {setupProgress.currentFile && setupProgress.phase === 'ai-processing' && (
                <div className="glass-panel p-3 bg-blue-500/10 border border-blue-500/20 mb-4">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                    <span className="text-sm text-blue-300 font-medium">Processing:</span>
                    <code className="text-sm text-blue-200 font-mono bg-blue-500/20 px-2 py-1 rounded">
                      {setupProgress.currentFile.split('/').pop()}
                    </code>
                  </div>
                </div>
              )}

              {/* Recent files processed */}
              {setupProgress.recentFiles && setupProgress.recentFiles.length > 0 && setupProgress.phase === 'ai-processing' && (
                <div className="glass-panel p-4 bg-white/5 mb-4">
                  <h4 className="font-medium text-white mb-3 text-sm">Recent Activity</h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {setupProgress.recentFiles.slice(0, 8).map((file, index) => (
                      <div
                        key={`${file.path}-${file.timestamp}`}
                        className={`flex items-center justify-between text-xs transition-all duration-300 ${index === 0 ? 'bg-white/5 rounded px-2 py-1' : ''
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-all duration-300 ${file.status === 'completed' ? 'bg-green-400 shadow-green-400/50 shadow-sm' :
                            file.status === 'skipped' ? 'bg-yellow-400 shadow-yellow-400/50 shadow-sm' :
                              'bg-blue-400 animate-pulse shadow-blue-400/50 shadow-sm'
                            }`}></div>
                          <code className="text-white/80 font-mono truncate max-w-48">
                            {file.path.split('/').pop()}
                          </code>
                        </div>
                        <span className={`text-xs transition-colors duration-300 ${file.status === 'completed' ? 'text-green-400' :
                          file.status === 'skipped' ? 'text-yellow-400' :
                            'text-blue-400'
                          }`}>
                          {file.status === 'completed' ? '✓' :
                            file.status === 'skipped' ? '⊘' : '⟳'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Live stats from backend */}
              {isLoadingSetupStatus ? (
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="glass-panel p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20">
                    <div className="flex justify-center items-center h-8 mb-1">
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <div className="text-xs text-blue-200/80 font-medium">Loading...</div>
                  </div>
                  <div className="glass-panel p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20">
                    <div className="flex justify-center items-center h-8 mb-1">
                      <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <div className="text-xs text-green-200/80 font-medium">Loading...</div>
                  </div>
                </div>
              ) : setupStatus ? (
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="glass-panel p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 hover:border-blue-400/30 transition-all duration-300">
                    <div className="text-2xl font-bold text-blue-300 mb-1">
                      {setupStatus.totalFiles || 0}
                    </div>
                    <div className="text-xs text-blue-200/80 font-medium">
                      {setupStatus.totalFiles === 0 && setupStatus.status === 'analyzing'
                        ? 'Scanning repository...'
                        : 'Files Found'}
                    </div>
                    {setupProgress.phase === 'scanning' && (
                      <div className="mt-2 flex justify-center">
                        <div className="w-1 h-1 bg-blue-400 rounded-full animate-ping"></div>
                      </div>
                    )}
                  </div>
                  <div className="glass-panel p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 hover:border-green-400/30 transition-all duration-300">
                    <div className="text-2xl font-bold text-green-300 mb-1">
                      {setupStatus.summarizedFiles || 0}
                    </div>
                    <div className="text-xs text-green-200/80 font-medium">
                      {setupStatus.summarizedFiles === 0 && setupStatus.status === 'analyzing'
                        ? 'Preparing AI processing...'
                        : 'AI Summaries'}
                    </div>
                    {setupProgress.phase === 'ai-processing' && (
                      <div className="mt-2 flex justify-center">
                        <div className="w-1 h-1 bg-green-400 rounded-full animate-ping"></div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Estimated time */}
            <div className="glass-panel p-4 bg-white/5">
              <h4 className="font-medium text-white mb-2">⏱️ Estimated Time Remaining</h4>
              <p className="text-white/70 text-sm">
                {isLoadingSetupStatus ? (
                  '⏳ Loading setup status...'
                ) : setupProgress.phase === 'scanning' ? (
                  '⏳ ~1-3 minutes remaining for repository scanning'
                ) : setupProgress.phase === 'transitioning' ? (
                  '⏳ ~10-20 minutes remaining for AI processing (this is the most valuable step!)'
                ) : setupProgress.phase === 'ai-processing' ? (
                  setupProgress.estimatedTimeRemaining
                    ? setupProgress.estimatedTimeRemaining < 60
                      ? `⏳ ~${Math.ceil(setupProgress.estimatedTimeRemaining)} seconds remaining`
                      : `⏳ ~${Math.ceil(setupProgress.estimatedTimeRemaining / 60)} minutes remaining`
                    : '⏳ ~5-15 minutes remaining depending on repository size'
                ) : setupProgress.phase === 'complete' ? (
                  '✅ Setup completed successfully!'
                ) : setupStatus?.status === 'analyzing' ? (
                  '⏳ Analysis in progress... please wait'
                ) : setupStatus?.status === 'ready' ? (
                  '✅ Repository setup is complete!'
                ) : setupStatus?.status === 'failed' ? (
                  '❌ Setup failed. Please try again.'
                ) : (
                  '⏳ ~15-25 minutes total depending on repository size and complexity'
                )}
              </p>
              {setupProgress.processingRate && setupProgress.processingRate > 0 && setupProgress.phase === 'ai-processing' && (
                <p className="text-white/50 text-xs mt-2">
                  Processing at {setupProgress.processingRate.toFixed(1)} files per minute
                </p>
              )}
            </div>

            {/* Cancel option for ongoing setup */}
            {setupProgress.phase !== 'complete' && setupProgress.phase !== 'failed' && (
              <div className="glass-panel p-4 bg-red-500/10 border border-red-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-red-300 mb-1">⚠️ Need to Cancel?</h4>
                    <p className="text-red-200/80 text-sm">
                      You can cancel this setup process at any time. The setup will stop and you can restart it later.
                    </p>
                  </div>
                  <Button
                    onClick={async () => {
                      if (window.confirm('Are you sure you want to cancel the repository setup? This will stop the analysis process.')) {
                        try {
                          setIsLoading(true);
                          const response = await fetch(`/api/repos/setup?sourceId=${sourceId}`, {
                            method: 'DELETE',
                          });

                          if (response.ok) {
                            setSetupProgress(prev => prev ? {
                              ...prev,
                              phase: 'failed',
                              step: '❌ Setup Cancelled',
                              message: 'Repository setup was cancelled by user.',
                              progress: 0
                            } : null);
                            // Redirect to repos page after successful cancellation
                            router.push('/repos');
                          } else {
                            alert('Failed to cancel setup. Please try again.');
                          }
                        } catch (error) {
                          console.error('Failed to cancel setup:', error);
                          alert('Failed to cancel setup. Please try again.');
                        } finally {
                          setIsLoading(false);
                        }
                      }
                    }}
                    disabled={isLoading}
                    className="ml-4 bg-red-600 text-white hover:bg-red-700"
                    variant="secondary"
                  >
                    {isLoading ? 'Cancelling...' : 'Cancel Setup'}
                  </Button>
                </div>
              </div>
            )}

            {/* What happens during setup */}
            <div className="glass-panel p-4 bg-white/5 text-left">
              <h4 className="font-medium text-white mb-3">🔄 Current Phase</h4>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${setupProgress.phase === 'scanning' ? 'bg-blue-400 animate-pulse' :
                    setupProgress.phase === 'transitioning' || setupProgress.phase === 'ai-processing' ? 'bg-green-400' :
                      setupProgress.phase === 'complete' ? 'bg-green-400' : 'bg-white/30'
                    }`}></div>
                  <div>
                    <div className={`font-medium ${setupProgress.phase === 'scanning' ? 'text-blue-300' : 'text-white/80'}`}>
                      🔍 Repository Scanning
                    </div>
                    <div className="text-white/60 text-xs">Discovering files and structure</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${setupProgress.phase === 'ai-processing' ? 'bg-blue-400 animate-pulse' :
                    setupProgress.phase === 'complete' ? 'bg-green-400' : 'bg-white/30'
                    }`}></div>
                  <div>
                    <div className={`font-medium ${setupProgress.phase === 'ai-processing' ? 'text-blue-300' : 'text-white/80'}`}>
                      🤖 AI Analysis
                    </div>
                    <div className="text-white/60 text-xs">Generating intelligent summaries</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${setupProgress.phase === 'complete' ? 'bg-green-400' : 'bg-white/30'
                    }`}></div>
                  <div>
                    <div className={`font-medium ${setupProgress.phase === 'complete' ? 'text-green-300' : 'text-white/80'}`}>
                      ✅ Setup Complete
                    </div>
                    <div className="text-white/60 text-xs">Ready for documentation generation</div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 'connect':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">Repository Setup</h3>
              <p className="text-white/70">
                Set up your repository for efficient automated documentation updates.
                This process analyzes all files and creates summaries for intelligent change detection.
              </p>
            </div>

            {repository && (
              <div className="glass-panel p-6">
                <h4 className="font-medium text-white mb-3">Repository Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/60">Name:</span>
                    <span className="text-white">{repository.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">URL:</span>
                    <span className="text-white font-mono text-xs">{repository.repo_url}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Branch:</span>
                    <span className="text-white">{repository.default_branch}</span>
                  </div>
                </div>
              </div>
            )}

            {setupStatus && (
              <div className="glass-panel p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium text-white">Setup Status</h4>
                  <span className={`px-3 py-1 rounded-full text-sm ${(setupStatus.status || 'unknown') === 'ready'
                    ? 'bg-green-500/20 text-green-300'
                    : (setupStatus.status || 'unknown') === 'analyzing'
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-gray-500/20 text-gray-300'
                    }`}>
                    {(setupStatus.status || 'unknown').replace('_', ' ').toUpperCase()}
                  </span>
                </div>

                {(setupStatus.status || 'unknown') === 'ready' ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/70">Files Analyzed:</span>
                      <span className="text-white">{setupStatus.totalFiles}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/70">Summaries Created:</span>
                      <span className="text-white">{setupStatus.summarizedFiles}</span>
                    </div>
                  </div>
                ) : (setupStatus.status || 'unknown') === 'analyzing' ? (
                  <div className="space-y-4">
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: setupStatus.totalFiles > 0
                            ? `${(setupStatus.summarizedFiles / setupStatus.totalFiles) * 100}%`
                            : '0%'
                        }}
                      />
                    </div>
                    <p className="text-sm text-white/60">
                      Analyzing files... {setupStatus.summarizedFiles} of {setupStatus.totalFiles || '?'} completed
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex items-start space-x-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <h5 className="font-medium text-blue-300 mb-1">What happens next?</h5>
                <ul className="text-sm text-blue-200 space-y-1">
                  <li>• Scan all repository files for documentation potential</li>
                  <li>• Generate AI summaries for intelligent change detection</li>
                  <li>• Create file relationships for targeted updates</li>
                </ul>
              </div>
            </div>
          </div>
        );

      case 'analyze':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">Analyzing Repository</h3>
              <p className="text-white/70">Scanning files and generating summaries...</p>
            </div>

            <div className="glass-panel p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                <div>
                  <p className="font-medium text-white">Analysis in Progress</p>
                  <p className="text-sm text-white/60">This may take several minutes for large repositories</p>
                </div>
              </div>

              {setupStatus && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-white/5 rounded-lg">
                      <div className="text-2xl font-bold text-blue-400">{setupStatus.totalFiles}</div>
                      <div className="text-sm text-white/70">Files Found</div>
                    </div>
                    <div className="text-center p-4 bg-white/5 rounded-lg">
                      <div className="text-2xl font-bold text-green-400">{setupStatus.summarizedFiles}</div>
                      <div className="text-sm text-white/70">Summaries Created</div>
                    </div>
                  </div>

                  <div className="w-full bg-white/10 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-500"
                      style={{
                        width: setupStatus.totalFiles > 0
                          ? `${(setupStatus.summarizedFiles / setupStatus.totalFiles) * 100}%`
                          : '0%'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div>
      <div className="max-w-4xl mx-auto p-6">
        {/* Warning banner for ongoing setup */}
        {setupProgress && (
          <div className="mb-6 glass-panel p-4 bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse"></div>
              <div className="flex-1">
                <h3 className="font-medium text-amber-300">Setup In Progress</h3>
                <p className="text-sm text-amber-200/80">
                  Repository setup is currently running. Please don&apos;t navigate away until it&apos;s complete to ensure accurate progress tracking.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Repository Setup</h1>
              <p className="text-white/70">Transform your repository into an efficient documentation system</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (setupProgress) {
                  if (window.confirm('Repository setup is in progress. Are you sure you want to leave? The process will continue in the background.')) {
                    router.push('/repos');
                  }
                } else {
                  router.push('/repos');
                }
              }}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {steps.map((step, index) => {
            const status = getStepStatus(step.id);

            return (
              <div key={step.id} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${status === 'completed'
                  ? 'bg-green-500 border-green-500 text-white'
                  : status === 'active'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-white/20 text-white/40'
                  }`}>
                  {status === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <step.icon className="w-5 h-5" />
                  )}
                </div>
                <div className="ml-3 hidden sm:block">
                  <div className={`text-sm font-medium ${status === 'active' ? 'text-white' : 'text-white/60'
                    }`}>
                    {step.title}
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <ChevronRight className="w-5 h-5 text-white/40 mx-4 hidden sm:block" />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="glass-panel p-8 mb-8">
          {renderStepContent()}

          {error && (
            <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h5 className="font-medium text-red-300 mb-1">Error</h5>
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => router.push('/repos')}
            className="px-6 py-3 text-white/70 hover:text-white"
          >
            Cancel
          </Button>

          <div className="flex items-center space-x-4">
            {currentStep === 'connect' && setupStatus?.status !== 'ready' && (
              <Button
                onClick={handleStartSetup}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Starting Setup...</span>
                  </>
                ) : (
                  <>
                    <span>Start Repository Setup</span>
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
