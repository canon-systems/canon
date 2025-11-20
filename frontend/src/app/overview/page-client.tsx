'use client';

import { useState, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { FileText, RefreshCw, Layers3, Activity, Calendar } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: typeof FileText;
  description?: string;
}

function StatCard({ title, value, icon: Icon, description }: StatCardProps) {
  return (
    <div className="glass-panel p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-white/60 mb-1">{title}</p>
          <p className="text-3xl font-semibold text-white mb-2">{value}</p>
          {description && <p className="text-xs text-white/50">{description}</p>}
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 p-3">
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}

interface OverviewStats {
  totalDocuments: number;
  totalRegenerated: number;
  totalArchitectureDiagrams: number;
  totalArchitectureVersions: number;
  rawData: {
    submissions: Array<{ created_at: string; last_checked_at: string | null }>;
    diagrams: Array<{ created_at: string }>;
    versions: Array<{ created_at: string }>;
  };
  errors: {
    submissions?: string;
    diagrams?: string;
    versions?: string;
  };
}

type TimeFilter = '7d' | '30d' | '90d' | '1y' | 'all';

interface OverviewPageClientProps {
  user: User | null;
  stats: OverviewStats;
}

export function OverviewPageClient({ user, stats }: OverviewPageClientProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');

  const filteredStats = useMemo(() => {
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

    const filterByDate = (dateString: string) => {
      if (!cutoffDate) return true;
      return new Date(dateString) >= cutoffDate;
    };

    const filteredSubmissions = stats.rawData.submissions.filter((sub) =>
      filterByDate(sub.created_at)
    );

    const filteredRegenerated = filteredSubmissions.filter((sub) => {
      if (!sub.last_checked_at) return false;
      const created = new Date(sub.created_at);
      const checked = new Date(sub.last_checked_at);
      return checked.getTime() - created.getTime() > 60000;
    });

    const filteredDiagrams = stats.rawData.diagrams.filter((diag) =>
      filterByDate(diag.created_at)
    );

    const filteredVersions = stats.rawData.versions.filter((version) =>
      filterByDate(version.created_at)
    );

    return {
      totalDocuments: filteredSubmissions.length,
      totalRegenerated: filteredRegenerated.length,
      totalArchitectureDiagrams: filteredDiagrams.length,
      totalArchitectureVersions: filteredVersions.length,
    };
  }, [timeFilter, stats.rawData]);

  return (
    <div className="page-shell space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white mb-2">Overview</h1>
          <p className="text-white/60">Dashboard and activity summary</p>
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

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Documents Generated"
          value={filteredStats.totalDocuments}
          icon={FileText}
          description="Total completed documents"
        />
        <StatCard
          title="Documents Regenerated"
          value={filteredStats.totalRegenerated}
          icon={RefreshCw}
          description="Updated after initial creation"
        />
        <StatCard
          title="Architecture Diagrams"
          value={filteredStats.totalArchitectureDiagrams}
          icon={Layers3}
          description="Total diagrams created"
        />
        <StatCard
          title="Diagram Versions"
          value={filteredStats.totalArchitectureVersions}
          icon={Activity}
          description="Total version history"
        />
      </div>

      {/* Error Display (if any) */}
      {(stats.errors.submissions || stats.errors.diagrams || stats.errors.versions) && (
        <div className="glass-panel p-4 border border-red-500/20 bg-red-500/10">
          <p className="text-red-400 text-sm">
            Some data could not be loaded. Please refresh the page.
          </p>
        </div>
      )}
    </div>
  );
}

