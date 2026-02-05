'use client';

import { useState, useMemo } from 'react';
import { FileText, Layers3, AlertCircle, RefreshCw, ExternalLink, GitBranch, Folder, Code, Clock, Hash, Zap, Github, XCircle, Link as LinkIcon, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LogEntry {
  id: string;
  type:
  | 'document'
  | 'document_error'
  | 'document_regenerated'
  | 'document_deleted'
  | 'automation_execution'
  | 'repo_connection'
  | 'source_connection'
  | 'integration_connection'
  | 'integration_disconnected'
  | 'diagram'
  | 'kb_push';
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
    provider?: string;
  };
}

interface LogsData {
  entries: LogEntry[];
  errors: {
    usageEvents?: string;
    automationRuns?: string;
  };
}

type TimeFilter = '24h' | '3d' | '7d' | '14d' | '30d' | '90d' | '180d' | '1y' | 'all';
type StatusFilter = 'all' | 'completed' | 'processing' | 'failed';
type TypeFilter =
  | 'all'
  | 'document'
  | 'document_error'
  | 'document_regenerated'
  | 'document_deleted'
  | 'automation_execution'
  | 'repo_connection'
  | 'source_connection'
  | 'integration_connection'
  | 'integration_disconnected'
  | 'diagram'
  | 'kb_push';

// Removed unused interface: Repo

interface LogsPageClientProps {
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

export function LogsPageClient({ logs }: LogsPageClientProps) {
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
      case 'document_deleted':
        return XCircle;
      case 'automation_execution':
        return Zap;
      case 'repo_connection':
        return Github;
      case 'source_connection':
        return LinkIcon;
      case 'integration_connection':
        return LinkIcon;
      case 'integration_disconnected':
        return XCircle;
      case 'diagram':
        return Layers3;
      case 'kb_push':
        return ScrollText;
      default:
        return FileText;
    }
  };

  const getTypeColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'document':
        return 'bg-[#f97316]/15 text-white';
      case 'automation_execution':
        return 'bg-[#f97316]/20 text-white';
      case 'document_error':
        return 'bg-white/10 text-white/80';
      case 'document_regenerated':
        return 'bg-[#f97316]/20 text-white border border-[#f97316]/40';
      case 'document_deleted':
        return 'bg-white/8 text-white/70';
      case 'repo_connection':
        return 'bg-white/10 text-white/80';
      case 'source_connection':
        return 'bg-white/10 text-white/80';
      case 'integration_connection':
        return 'bg-white/10 text-white/80';
      case 'integration_disconnected':
        return 'bg-white/8 text-white/70';
      case 'diagram':
        return 'bg-white/10 text-white/80';
      case 'kb_push':
        return 'bg-white/10 text-white/80';
      default:
        return 'bg-white/8 text-white/70';
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;

    const statusColors: Record<string, string> = {
      completed: 'bg-[#f97316]/15 text-white',
      processing: 'bg-white/10 text-white/80',
      failed: 'bg-white/8 text-white/70',
    };

    return (
      <span className={`inline-block px-2 py-0.5 rounded text-xs ${statusColors[status] || 'bg-white/8 text-white/70'}`}>
        {status}
      </span>
    );
  };

  const hasEntries = filteredEntries.length > 0;

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <ScrollText className="h-8 w-8 text-white" />
            <h1 className="text-3xl font-bold text-white">Logs</h1>
          </div>
          <p className="text-white/70">
            Activity logs and automation runs
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row mt-2.5 mb-2.5">
          <div className="flex items-center gap-2">
            <Select value={timeFilter} onValueChange={(value: TimeFilter) => setTimeFilter(value)}>
              <SelectTrigger className="w-full sm:w-[180px] bg-white/5 border-white/10">
                <SelectValue placeholder="Filter by time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="3d">Last 3 days</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="14d">Last 2 weeks</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 3 months</SelectItem>
                <SelectItem value="180d">Last 6 months</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Select value={statusFilter} onValueChange={(value: StatusFilter) => setStatusFilter(value)}>
            <SelectTrigger className="w-full sm:w-[180px] bg-white/5 border-white/10">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(value: TypeFilter) => setTypeFilter(value)}>
            <SelectTrigger className="w-full sm:w-[200px] bg-white/5 border-white/10">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="automation_execution">Automation Execution</SelectItem>
              <SelectItem value="document">Document</SelectItem>
              <SelectItem value="document_error">Document Error</SelectItem>
              <SelectItem value="document_regenerated">Regenerated</SelectItem>
              <SelectItem value="document_deleted">Deleted</SelectItem>
              <SelectItem value="repo_connection">Repository Connection</SelectItem>
              <SelectItem value="source_connection">Source Connection</SelectItem>
              <SelectItem value="integration_connection">Integration Connected</SelectItem>
              <SelectItem value="integration_disconnected">Integration Disconnected</SelectItem>
              <SelectItem value="diagram">Diagram</SelectItem>
              <SelectItem value="kb_push">KB Push</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(logs.errors.usageEvents || logs.errors.automationRuns) && (
          <Card className="border-white/15 bg-white/5">
            <CardContent className="p-4">
              <p className="text-white/85 text-sm font-medium mb-2">
                Some logs could not be loaded:
              </p>
              <ul className="text-white/70 text-xs space-y-1">
                {logs.errors.usageEvents && <li>• Usage events: {logs.errors.usageEvents}</li>}
                {logs.errors.automationRuns && <li>• Automation runs: {logs.errors.automationRuns}</li>}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card className="border border-white/10 bg-gradient-to-b from-white/5 to-white/0 shadow-lg">
          <CardContent className="p-6">
            <div className="relative">
              {hasEntries && (
                <div className="max-h-[70vh] overflow-y-auto pr-2 space-y-2">
                  {filteredEntries.map((entry, idx) => {
                    const Icon = getIcon(entry.type);
                    const isRegenerated = entry.type === 'document_regenerated';
                    const rowTone = idx % 2 === 0 ? 'bg-white/5' : 'bg-white/0';
                    const content = (
                      <div className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${isRegenerated
                        ? 'border-[#f97316]/50 bg-gradient-to-br from-[#f97316]/10 to-white/5 hover:border-[#f97316]/70 hover:from-[#f97316]/15 hover:to-white/10 shadow-lg shadow-black/30'
                        : `border-white/10 hover:border-white/20 ${rowTone}`
                        }`}>
                        <div className={`rounded-lg p-2 ${getTypeColor(entry.type)} flex-shrink-0 ${isRegenerated ? 'animate-pulse' : ''}`}>
                          <Icon className={`h-4 w-4`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className={`font-medium truncate ${isRegenerated ? 'text-white' : 'text-white'}`}>{entry.title}</h3>
                                {isRegenerated && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f97316]/20 text-white text-xs font-semibold border border-[#f97316]/40">
                                    <RefreshCw className="h-3 w-3" />
                                    Regenerated
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-white/75">{entry.message}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <span className="text-xs text-white/50 whitespace-nowrap">
                                {formatDate(entry.timestamp)}
                              </span>
                              {entry.metadata?.isOutdated && (
                                <span className="text-xs text-white/70 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Outdated
                                </span>
                              )}
                            </div>
                          </div>

                          {(entry.metadata?.repoUrl || entry.metadata?.inputType || entry.metadata?.branch || entry.metadata?.versionNumber || entry.metadata?.automationRuleId || entry.id) && (
                            <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-3 text-xs">
                              <div className="flex items-center gap-1.5 text-white/50 font-mono">
                                <Hash className="h-3 w-3" />
                                <span className="text-xs">{entry.id}</span>
                              </div>
                              {entry.metadata?.automationRuleId && (
                                <div className="flex items-center gap-1.5 text-white/75">
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
                          <div className="text-white/60 flex-shrink-0">
                            <ExternalLink className="h-4 w-4" />
                          </div>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
