'use client';

import { useState, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { FileText, Layers3, AlertCircle, RefreshCw, ExternalLink, Calendar } from 'lucide-react';
import Link from 'next/link';

interface LogEntry {
  id: string;
  type: 'document' | 'document_error' | 'architecture' | 'architecture_version';
  timestamp: string;
  title: string;
  message: string;
  status?: string;
  link?: string;
}

interface LogsData {
  entries: LogEntry[];
  errors: {
    submissions?: string;
    diagrams?: string;
    versions?: string;
  };
}

type TimeFilter = '7d' | '30d' | '90d' | '1y' | 'all';

interface LogsPageClientProps {
  user: User | null;
  logs: LogsData;
}

export function LogsPageClient({ user, logs }: LogsPageClientProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');

  const filteredEntries = useMemo(() => {
    const now = new Date();
    let cutoffDate: Date | null = null;

    switch (timeFilter) {
      case '7d':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        cutoffDate = null;
        break;
    }

    if (!cutoffDate) return logs.entries;

    return logs.entries.filter((entry) => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= cutoffDate;
    });
  }, [timeFilter, logs.entries]);

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
      case 'architecture':
        return Layers3;
      case 'architecture_version':
        return RefreshCw;
      default:
        return FileText;
    }
  };

  const getTypeColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'document':
        return 'bg-blue-500/20 text-blue-400';
      case 'document_error':
        return 'bg-red-500/20 text-red-400';
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

  return (
    <div className="page-shell space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white mb-2">Logs</h1>
          <p className="text-white/60">Activity and error logs</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-white/60" />
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
            className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
        </div>
      </div>

      {/* Error Display (if any) */}
      {(logs.errors.submissions || logs.errors.diagrams || logs.errors.versions) && (
        <div className="glass-panel p-4 border border-red-500/20 bg-red-500/10">
          <p className="text-red-400 text-sm">
            Some logs could not be loaded. Please refresh the page.
          </p>
        </div>
      )}

      {/* Logs List */}
      <div className="glass-panel p-6">
        {filteredEntries.length === 0 ? (
          <div className="text-center py-12 text-white/60">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No logs available for the selected time period</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((entry) => {
              const Icon = getIcon(entry.type);
              const content = (
                <div className="flex items-start gap-4 p-4 rounded-xl border border-white/10 hover:border-white/20 transition-colors">
                  <div className={`rounded-lg p-2 ${getTypeColor(entry.type)}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <h3 className="text-white font-medium truncate">{entry.title}</h3>
                      <span className="text-xs text-white/50 whitespace-nowrap">
                        {formatDate(entry.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-white/70 mb-2">{entry.message}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded ${getTypeColor(entry.type)}`}>
                        {entry.type.replace('_', ' ')}
                      </span>
                      {getStatusBadge(entry.status)}
                    </div>
                  </div>
                  {entry.link && (
                    <a
                      href={entry.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/60 hover:text-white transition-colors flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              );

              return entry.link ? (
                <Link key={entry.id} href={entry.link} className="block">
                  {content}
                </Link>
              ) : (
                <div key={entry.id}>{content}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

