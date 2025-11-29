'use client';

import { useState, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { FileText, Layers3, AlertCircle, RefreshCw, ExternalLink, Calendar, GitBranch, Folder, Code, Clock, Hash, Zap } from 'lucide-react';
import Link from 'next/link';

interface LogEntry {
  id: string;
  type: 'document' | 'document_error' | 'document_regenerated' | 'architecture' | 'architecture_version' | 'automation_execution';
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
type TypeFilter = 'all' | 'document' | 'document_error' | 'document_regenerated' | 'architecture' | 'architecture_version' | 'automation_execution';

interface LogsPageClientProps {
  user: User | null;
  logs: LogsData;
}

function ListNoDataOverlay({ message }: { message: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-white/60">
      <FileText className="h-12 w-12 mb-4 opacity-50" />
      <p>{message}</p>
    </div>
  );
}

export function LogsPageClient({ user, logs }: LogsPageClientProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

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
          <p className="text-white/60">Activity and error logs</p>
        </div>
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
          </select>
        </div>
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
    </div>
  );
}

