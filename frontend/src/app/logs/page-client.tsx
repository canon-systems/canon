'use client';

import { useState, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { FileText, Layers3, AlertCircle, RefreshCw, ExternalLink, Calendar, GitBranch, Folder, Code, Clock, Hash, Zap, Github, PlayCircle, StopCircle, XCircle, ChevronDown, Link as LinkIcon, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface LogEntry {
  id: string;
  type: 'document' | 'document_error' | 'document_regenerated' | 'architecture' | 'architecture_version' | 'automation_execution' | 'repo_connection';
  timestamp: string;
  title: string;
  message: string;
  status?: string;
  link?: string;
  metadata?: {
    inputType?: string;
    repoUrl?: string;
    branch?: string;
    subdir?: string;
    isOutdated?: boolean;
    versionNumber?: number;
    changeSummary?: string;
    automationRuleId?: string;
    isAutomation?: boolean;
  };
}

interface LogsData {
  entries: LogEntry[];
  errors: {
    submissions?: string;
    diagrams?: string;
    versions?: string;
  };
}

type TimeFilter = '24h' | '3d' | '7d' | '14d' | '30d' | '90d' | '180d' | '1y' | 'all';
type StatusFilter = 'all' | 'completed' | 'processing' | 'failed';
type TypeFilter = 'all' | 'document' | 'document_error' | 'document_regenerated' | 'architecture' | 'architecture_version' | 'automation_execution' | 'repo_connection';

interface Repo {
  id: string;
  repo_url: string;
  name: string;
  default_branch: string;
  settings?: any;
}

interface LogsPageClientProps {
  user: User | null;
  logs: LogsData;
  repos?: Repo[];
}

function ListNoDataOverlay({ message }: { message: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-white/60">
      <FileText className="h-12 w-12 mb-4 opacity-50" />
      <p>{message}</p>
    </div>
  );
}

type LogsTab = 'activity' | 'runs';

export function LogsPageClient({ user, logs, repos = [] }: LogsPageClientProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [activeTab, setActiveTab] = useState<LogsTab>('activity');
  const [expandedErrors, setExpandedErrors] = useState<Record<string, boolean>>({});

  // Process automation rules from repos
  const automationRules = useMemo(() => {
    const rules: Array<{
      repoId: string;
      ruleId: string;
      ruleName: string;
      enabled: boolean;
      repo: Repo;
      executionHistory: any[];
    }> = [];

    repos.forEach(repo => {
      const repoSettings = repo.settings || {};
      const automationRules = repoSettings.automation_rules || [];

      automationRules.forEach((rule: any) => {
        if (rule.enabled) {
          rules.push({
            repoId: repo.id,
            ruleId: rule.id || rule.name,
            ruleName: rule.name || rule.id,
            enabled: rule.enabled,
            repo,
            executionHistory: (repoSettings.automation_metadata?.[rule.id || rule.name]?.execution_history || []),
          });
        }
      });
    });

    return rules;
  }, [repos]);

  const filteredEntries = useMemo(() => {
    const now = new Date();
    let cutoffDate: Date | null = null;

    switch (timeFilter) {
      case '24h':
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '3d':
        cutoffDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '14d':
        cutoffDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '180d':
        cutoffDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        cutoffDate = null;
        break;
    }

    return logs.entries.filter((entry) => {
      // Time filter
      if (cutoffDate) {
        const entryDate = new Date(entry.timestamp);
        if (entryDate < cutoffDate) return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        if (!entry.status || entry.status.toLowerCase() !== statusFilter) {
          return false;
        }
      }

      // Type filter
      if (typeFilter !== 'all') {
        if (entry.type !== typeFilter) {
          return false;
        }
      }

      return true;
    });
  }, [timeFilter, statusFilter, typeFilter, logs.entries]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRunsDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'document':
        return FileText;
      case 'document_error':
        return AlertCircle;
      case 'document_regenerated':
        return RefreshCw;
      case 'architecture':
        return Layers3;
      case 'architecture_version':
        return RefreshCw;
      case 'automation_execution':
        return Zap;
      case 'repo_connection':
        return Github;
      default:
        return FileText;
    }
  };

  const getTypeColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'document':
        return 'bg-blue-500/20 text-blue-400';
      case 'automation_execution':
        return 'bg-purple-500/20 text-purple-400';
      case 'document_error':
        return 'bg-red-500/20 text-red-400';
      case 'document_regenerated':
        return 'bg-gradient-to-br from-purple-500/30 to-pink-500/30 text-purple-200 border border-purple-500/50';
      case 'architecture':
        return 'bg-purple-500/20 text-purple-400';
      case 'architecture_version':
        return 'bg-green-500/20 text-green-400';
      case 'repo_connection':
        return 'bg-indigo-500/20 text-indigo-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;

    const statusColors: Record<string, string> = {
      completed: 'bg-green-500/20 text-green-400',
      processing: 'bg-yellow-500/20 text-yellow-400',
      failed: 'bg-red-500/20 text-red-400',
    };

    return (
      <span className={`inline-block px-2 py-0.5 rounded text-xs ${statusColors[status] || 'bg-gray-500/20 text-gray-400'}`}>
        {status}
      </span>
    );
  };

  const hasEntries = filteredEntries.length > 0;

  return (
    <div className="page-shell space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white mb-2">Logs</h1>
          <p className="text-white/60">Activity logs and automation runs</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-white/10">
        <nav className="flex gap-1" aria-label="Logs tabs">
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'activity'
                ? 'border-purple-500 text-white'
                : 'border-transparent text-white/60 hover:text-white hover:border-white/20'
            }`}
          >
            <FileText className="h-4 w-4" />
            Activity
          </button>
          <button
            onClick={() => setActiveTab('runs')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'runs'
                ? 'border-purple-500 text-white'
                : 'border-transparent text-white/60 hover:text-white hover:border-white/20'
            }`}
          >
            <PlayCircle className="h-4 w-4" />
            Runs
          </button>
        </nav>
      </div>

      {activeTab === 'activity' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-white/60" />
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
                className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="all">All time</option>
                <option value="24h">Last 24 hours</option>
                <option value="3d">Last 3 days</option>
                <option value="7d">Last 7 days</option>
                <option value="14d">Last 2 weeks</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 3 months</option>
                <option value="180d">Last 6 months</option>
                <option value="1y">Last year</option>
              </select>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="all">All types</option>
              <option value="automation_execution">Automation Execution</option>
              <option value="document">Document</option>
              <option value="document_error">Document Error</option>
              <option value="document_regenerated">Regenerated</option>
              <option value="architecture">Architecture</option>
              <option value="architecture_version">Architecture Version</option>
              <option value="repo_connection">Repository Connection</option>
            </select>
          </div>
          {/* Error Display (if any) */}
          {(logs.errors.submissions || logs.errors.diagrams || logs.errors.versions) && (
            <div className="glass-panel p-4 border border-red-500/20 bg-red-500/10">
              <p className="text-red-400 text-sm font-medium mb-2">
                Some logs could not be loaded:
              </p>
              <ul className="text-red-300 text-xs space-y-1">
                {logs.errors.submissions && (
                  <li>• Submissions: {logs.errors.submissions}</li>
                )}
                {logs.errors.diagrams && (
                  <li>• Architecture Diagrams: {logs.errors.diagrams}</li>
                )}
                {logs.errors.versions && (
                  <li>• Architecture Versions: {logs.errors.versions}</li>
                )}
              </ul>
            </div>
          )}

          {/* Logs List */}
          <div className="glass-panel p-6">
        <div className="relative">
          {hasEntries && (
            <div className="max-h-[calc(100vh-300px)] overflow-y-auto pr-2 space-y-3">
              {filteredEntries.map((entry) => {
                const Icon = getIcon(entry.type);
                const isRegenerated = entry.type === 'document_regenerated';
                const content = (
                  <div className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                    isRegenerated 
                      ? 'border-purple-500/50 bg-gradient-to-br from-purple-500/10 to-pink-500/10 hover:border-purple-500/70 hover:from-purple-500/15 hover:to-pink-500/15 shadow-lg shadow-purple-500/10' 
                      : 'border-white/10 hover:border-white/20'
                  }`}>
                    <div className={`rounded-lg p-2 ${getTypeColor(entry.type)} flex-shrink-0 ${isRegenerated ? 'animate-pulse' : ''}`}>
                      <Icon className={`h-4 w-4 ${isRegenerated ? 'text-purple-200' : ''}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className={`font-medium truncate ${isRegenerated ? 'text-purple-200' : 'text-white'}`}>{entry.title}</h3>
                            {isRegenerated && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 text-xs font-semibold border border-purple-500/50">
                                <RefreshCw className="h-3 w-3" />
                                Regenerated
                              </span>
                            )}
                          </div>
                          <p className={`text-sm ${isRegenerated ? 'text-purple-100/90' : 'text-white/70'}`}>{entry.message}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-xs text-white/50 whitespace-nowrap">
                            {formatDate(entry.timestamp)}
                          </span>
                          {entry.metadata?.isOutdated && (
                            <span className="text-xs text-yellow-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Outdated
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Metadata Section */}
                      {(entry.metadata?.repoUrl || entry.metadata?.inputType || entry.metadata?.branch || entry.metadata?.versionNumber || entry.metadata?.automationRuleId || entry.id) && (
                        <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-3 text-xs">
                          <div className="flex items-center gap-1.5 text-white/50 font-mono">
                            <Hash className="h-3 w-3" />
                            <span className="text-xs">{entry.id}</span>
                          </div>
                          {entry.metadata?.automationRuleId && (
                            <div className="flex items-center gap-1.5 text-purple-300">
                              <Zap className="h-3 w-3" />
                              <span>Rule: {entry.metadata.automationRuleId}</span>
                            </div>
                          )}
                          {entry.metadata?.inputType && (
                            <div className="flex items-center gap-1.5 text-white/60">
                              <Code className="h-3 w-3" />
                              <span className="capitalize">{entry.metadata!.inputType.replace(/_/g, ' ')}</span>
                            </div>
                          )}
                          {entry.metadata?.repoUrl && (
                            <div className="flex items-center gap-1.5 text-white/60 max-w-xs truncate">
                              <Layers3 className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{entry.metadata!.repoUrl}</span>
                            </div>
                          )}
                          {entry.metadata?.branch && (
                            <div className="flex items-center gap-1.5 text-white/60">
                              <GitBranch className="h-3 w-3" />
                              <span>{entry.metadata!.branch}</span>
                            </div>
                          )}
                          {entry.metadata?.subdir && (
                            <div className="flex items-center gap-1.5 text-white/60">
                              <Folder className="h-3 w-3" />
                              <span>{entry.metadata!.subdir}</span>
                            </div>
                          )}
                          {entry.metadata?.versionNumber && (
                            <div className="flex items-center gap-1.5 text-white/60">
                              <RefreshCw className="h-3 w-3" />
                              <span>v{entry.metadata!.versionNumber}</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 flex-wrap mt-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${getTypeColor(entry.type)}`}>
                          {entry.type.replace('_', ' ')}
                        </span>
                        {getStatusBadge(entry.status)}
                      </div>
                    </div>
                    {entry.link && (
                      <Link
                        href={entry.link}
                        className="text-white/60 hover:text-white transition-colors flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                );

                return (
                  <div key={entry.id}>
                    {entry.link ? (
                      <Link href={entry.link} className="block">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!hasEntries && (
            <div className="min-h-[320px]">
              <ListNoDataOverlay message="No logs available for the selected filters" />
            </div>
          )}
        </div>
          </div>
        </>
      )}

      {activeTab === 'runs' && (
        <div className="space-y-6">
          <div className="glass-panel p-6">
            <h2 className="text-2xl font-semibold text-white mb-4">Automation Runs</h2>
            <p className="text-white/70 mb-6">View all automation rule executions across your repositories</p>

            {automationRules.length === 0 ? (
              <div className="text-center py-12">
                <PlayCircle className="h-16 w-16 text-white/30 mx-auto mb-4" />
                <p className="text-white/60 mb-2">No automation rules configured</p>
                <p className="text-white/50 text-sm">Set up automation rules in the Automation section to see runs here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {automationRules.map((rule) => (
                  <div key={`${rule.repoId}-${rule.ruleId}`} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Github className="h-4 w-4 text-white/60" />
                      <div>
                        <h3 className="text-lg font-semibold text-white">{rule.repo.name}</h3>
                        <p className="text-xs text-white/50 flex items-center gap-1">
                          <GitBranch className="h-3 w-3" />
                          {rule.repo.default_branch}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-white/90">{rule.ruleName}</p>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {rule.executionHistory.length === 0 ? (
                            <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-white">{rule.ruleName}</p>
                                  <p className="text-xs text-white/50">No runs yet</p>
                                </div>
                                <Clock className="h-4 w-4 text-white/40" />
                              </div>
                            </div>
                          ) : (
                            rule.executionHistory.map((execution: any, idx: number) => {
                              const hasErrors = execution.errors && execution.errors.length > 0;
                              const errorKey = `${rule.repoId}-${rule.ruleId}-${idx}`;
                              const showErrors = expandedErrors[errorKey] || false;

                              // Check if this was a cancelled run
                              const isCancelled = !execution.success && !execution.skipped &&
                                execution.errors?.some((e: string) => e.toLowerCase().includes('cancelled'));

                              return (
                                <div
                                  key={idx}
                                  className="rounded-lg border border-white/10 bg-black/40 p-3"
                                >
                                  <div className="flex items-start gap-3">
                                    <div className={`mt-0.5 ${
                                      execution.success ? 'text-green-400' :
                                      execution.skipped ? 'text-yellow-400' :
                                      isCancelled ? 'text-orange-400' :
                                      'text-red-400'
                                    }`}>
                                      {execution.success ? (
                                        <CheckCircle2 className="h-4 w-4" />
                                      ) : execution.skipped ? (
                                        <Clock className="h-4 w-4" />
                                      ) : isCancelled ? (
                                        <StopCircle className="h-4 w-4" />
                                      ) : (
                                        <XCircle className="h-4 w-4" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className="text-xs text-white/60">{formatRunsDate(execution.timestamp)}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                          execution.success ? 'bg-green-500/20 text-green-300' :
                                          execution.skipped ? 'bg-yellow-500/20 text-yellow-300' :
                                          isCancelled ? 'bg-orange-500/20 text-orange-300' :
                                          'bg-red-500/20 text-red-300'
                                        }`}>
                                          {execution.success ? 'Success' : execution.skipped ? 'Skipped' : isCancelled ? 'Cancelled' : 'Failed'}
                                        </span>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                          execution.trigger === 'manual'
                                            ? 'bg-purple-500/20 text-purple-300'
                                            : 'bg-blue-500/20 text-blue-300'
                                        }`}>
                                          {execution.trigger === 'manual' ? 'Manual' : 'Scheduled'}
                                        </span>
                                      </div>
                                      {execution.actions && execution.actions.length > 0 && (
                                        <p className="text-xs text-white/50 mb-1">Actions: {execution.actions.join(', ')}</p>
                                      )}
                                      {execution.skip_reason && (
                                        <p className="text-xs text-yellow-300 mb-1">Reason: {execution.skip_reason}</p>
                                      )}
                                      {hasErrors && (
                                        <button
                                          onClick={() => setExpandedErrors(prev => ({ ...prev, [errorKey]: !showErrors }))}
                                          className="flex items-center gap-1 text-xs text-red-300 hover:text-red-200 mt-1"
                                        >
                                          <ChevronDown className={`h-3 w-3 transition-transform ${showErrors ? 'rotate-180' : ''}`} />
                                          {showErrors ? 'Hide' : 'Show'} Errors ({execution.errors.length})
                                        </button>
                                      )}
                                      {hasErrors && showErrors && (
                                        <div className="mt-2 pl-4 border-l-2 border-red-500/30">
                                          <ul className="list-disc list-inside text-xs text-red-200 space-y-1">
                                            {execution.errors.map((error: string, errorIdx: number) => (
                                              <li key={errorIdx}>{error}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      <div className="flex items-center gap-3 mt-2">
                                        {execution.doc_id && (
                                          <Link
                                            href={`/edit/${execution.doc_id}`}
                                            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                          >
                                            <FileText className="h-3 w-3" />
                                            View Document
                                          </Link>
                                        )}
                                        {execution.diagram_id && (
                                          <Link
                                            href={`/architecture/${execution.diagram_id}`}
                                            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                          >
                                            <LinkIcon className="h-3 w-3" />
                                            View Diagram
                                          </Link>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

