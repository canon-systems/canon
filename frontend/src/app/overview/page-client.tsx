'use client';

import { useState, useMemo } from 'react';
import type { User } from '@supabase/supabase-js';
import { FileText, RefreshCw, Layers3, Activity, Calendar, AlertCircle, Clock, CheckCircle2, XCircle, Zap, TrendingUp, Link as LinkIcon, Github, BookOpen } from 'lucide-react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: typeof FileText;
  description?: string;
  trend?: number;
  color?: 'blue' | 'green' | 'purple' | 'yellow' | 'red' | 'orange';
}

function StatCard({ title, value, icon: Icon, description, trend, color = 'blue' }: StatCardProps) {
  const colorClasses = {
    blue: 'from-blue-500/20 to-purple-500/20',
    green: 'from-green-500/20 to-emerald-500/20',
    purple: 'from-purple-500/20 to-pink-500/20',
    yellow: 'from-yellow-500/20 to-orange-500/20',
    red: 'from-red-500/20 to-pink-500/20',
    orange: 'from-orange-500/20 to-red-500/20',
  };

  return (
    <div className="glass-panel p-6 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-white/60 mb-1">{title}</p>
          <div className="flex items-baseline gap-2 mb-2">
            <p className="text-3xl font-semibold text-white">{value}</p>
            {trend !== undefined && trend > 0 && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {trend}
              </span>
            )}
          </div>
          {description && <p className="text-xs text-white/50">{description}</p>}
        </div>
        <div className={`rounded-2xl bg-gradient-to-br ${colorClasses[color]} p-3`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function ChartNoDataOverlay({ message }: { message: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="rounded-lg border border-dashed border-white/20 bg-black/40 px-4 py-2 text-sm text-white/70">
        {message}
      </div>
    </div>
  );
}

interface OverviewStats {
  totalDocuments: number;
  totalSubmissions: number;
  processingDocuments: number;
  failedDocuments: number;
  outdatedDocuments: number;
  totalRegenerated: number;
  autoUpdateEnabled: number;
  inputTypeBreakdown: Record<string, number>;
  rawData: {
    submissions: Array<{
      created_at: string;
      last_checked_at: string | null;
      status: string;
      is_outdated: boolean;
      input_type: string | null;
    }>;
  };
  recentActivity: {
    submissions: Array<{
      id: string;
      created_at: string;
      status: string;
      is_outdated: boolean;
    }>;
  };
  errors: {
    submissions?: string;
    repos?: string;
  };
  automationRules?: Array<{
    repoId: string;
    repoName: string;
    repoUrl: string;
    ruleId: string;
    ruleName: string;
    enabled: boolean;
    lastRunAt?: string;
    lastRunStatus?: string;
    lastExecution?: any;
  }>;
  connectedReposCount: number;
}

type TimeFilter = '24h' | '3d' | '7d' | '14d' | '30d' | '90d' | '180d' | '1y' | 'all';
type StatusFilter = 'all' | 'completed' | 'processing' | 'failed' | 'outdated';
type InputTypeFilter = 'all' | 'github_repo' | 'github_repo_directory' | 'zipped_folder' | 'pasted_code';

interface OverviewPageClientProps {
  user: User | null;
  stats: OverviewStats;
}

export function OverviewPageClient({ user, stats }: OverviewPageClientProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [inputTypeFilter, setInputTypeFilter] = useState<InputTypeFilter>('all');

  const filteredStats = useMemo(() => {
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

    const filterByDate = (dateString: string) => {
      if (!cutoffDate) return true;
      return new Date(dateString) >= cutoffDate;
    };

    const filteredSubmissions = stats.rawData.submissions.filter((sub) => {
      if (!filterByDate(sub.created_at)) return false;

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'outdated') {
          if (!sub.is_outdated) return false;
        } else {
          if (sub.status !== statusFilter) return false;
        }
      }

      // Input type filter
      if (inputTypeFilter !== 'all') {
        if (sub.input_type !== inputTypeFilter) return false;
      }

      return true;
    });

    const filteredRegenerated = filteredSubmissions.filter((sub) => {
      if (!sub.last_checked_at) return false;
      const created = new Date(sub.created_at);
      const checked = new Date(sub.last_checked_at);
      return checked.getTime() - created.getTime() > 60000;
    });


    // Calculate status breakdown
    const completed = filteredSubmissions.filter(s => s.status === 'completed').length;
    const processing = filteredSubmissions.filter(s => s.status === 'processing').length;
    const failed = filteredSubmissions.filter(s => s.status === 'failed').length;
    const outdated = filteredSubmissions.filter(s => s.is_outdated).length;

    // Calculate activity over time (group by day)
    const activityByDay: Record<string, { documents: number; date: string }> = {};

    filteredSubmissions.forEach(sub => {
      const date = new Date(sub.created_at).toISOString().split('T')[0];
      if (!activityByDay[date]) {
        activityByDay[date] = { documents: 0, date };
      }
      activityByDay[date].documents++;
    });

    const activityData = Object.values(activityByDay)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30); // Last 30 days

    // Input type breakdown (filtered by time)
    const inputTypeCounts: Record<string, number> = {};
    filteredSubmissions.forEach(sub => {
      const type = sub.input_type || 'unknown';
      inputTypeCounts[type] = (inputTypeCounts[type] || 0) + 1;
    });

    const inputTypeData = Object.entries(inputTypeCounts)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => ({
        name: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value: count,
      }))
      .sort((a, b) => b.value - a.value);

    // Status breakdown for pie chart
    const statusData = [
      { name: 'Completed', value: completed, color: '#10b981' },
      { name: 'Processing', value: processing, color: '#f59e0b' },
      { name: 'Failed', value: failed, color: '#ef4444' },
      { name: 'Outdated', value: outdated, color: '#8b5cf6' },
    ].filter(item => item.value > 0);

    const activityHasData = activityData.length > 0;
    const statusHasData = statusData.length > 0;
    const inputTypeHasData = inputTypeData.length > 0;

    return {
      totalDocuments: filteredSubmissions.filter(s => s.status === 'completed').length,
      totalRegenerated: filteredRegenerated.length,
      activityData: activityHasData ? activityData : [{
        date: new Date().toISOString().split('T')[0],
        documents: 0,
      }],
      inputTypeData: inputTypeHasData ? inputTypeData : [{
        name: 'No Data',
        value: 0,
      }],
      statusData: statusHasData ? statusData : [{
        name: 'No Data',
        value: 1,
        color: '#4b5563',
      }],
      hasActivityData: activityHasData,
      hasStatusData: statusHasData,
      hasInputTypeData: inputTypeHasData,
      completed,
      processing,
      failed,
      outdated,
    };
  }, [timeFilter, statusFilter, inputTypeFilter, stats.rawData]);

  return (
    <div className="page-shell space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white mb-2">Welcome to Sync</h1>
          <p className="text-white/60">Your AI-powered documentation platform for software teams</p>
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
            <option value="outdated">Outdated</option>
          </select>
          <select
            value={inputTypeFilter}
            onChange={(e) => setInputTypeFilter(e.target.value as InputTypeFilter)}
            className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="all">All input types</option>
            <option value="github_repo">GitHub Repo</option>
            <option value="github_repo_directory">GitHub Directory</option>
            <option value="zipped_folder">Zipped Folder</option>
            <option value="pasted_code">Pasted Code</option>
          </select>
        </div>
      </div>

      {/* Welcome Section for New Users */}
      {stats.connectedReposCount === 0 && (
        <div className="glass-panel p-8 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold text-white mb-4">Get Started with Sync</h2>
            <p className="text-white/70 mb-6">
              Transform your codebase into clear, comprehensive documentation with AI-powered analysis.
              Connect your first repository to begin generating professional documentation automatically.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/repos" className="btn btn-primary flex items-center gap-2">
                <Github className="h-4 w-4" />
                Connect Repository
              </Link>
              <Link href="/documentation" className="btn btn-secondary">
                Generate Documentation
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {stats.rawData.submissions.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Link
            href="/repos"
            className="glass-panel p-6 hover:border-white/20 transition-colors text-center"
          >
            <Github className="h-8 w-8 text-blue-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-white mb-2">Connect Repository</h3>
            <p className="text-sm text-white/60">Add a new GitHub repository to analyze</p>
          </Link>
          <Link
            href="/documentation"
            className="glass-panel p-6 hover:border-white/20 transition-colors text-center"
          >
            <FileText className="h-8 w-8 text-green-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-white mb-2">Generate Docs</h3>
            <p className="text-sm text-white/60">Create documentation from your code</p>
          </Link>
          <Link
            href="/edit"
            className="glass-panel p-6 hover:border-white/20 transition-colors text-center"
          >
            <BookOpen className="h-8 w-8 text-purple-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-white mb-2">Edit Documents</h3>
            <p className="text-sm text-white/60">Review and modify generated content</p>
          </Link>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Documents Generated"
          value={filteredStats.totalDocuments}
          icon={FileText}
          description="Total completed documents"
          color="blue"
        />
        <StatCard
          title="Documents Regenerated"
          value={filteredStats.totalRegenerated}
          icon={RefreshCw}
          description="Updated after initial creation"
          color="green"
        />
      </div>

      {/* Additional Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Processing"
          value={stats.processingDocuments}
          icon={Clock}
          description="Currently processing"
          color="yellow"
        />
        <StatCard
          title="Failed"
          value={stats.failedDocuments}
          icon={XCircle}
          description="Failed documents"
          color="red"
        />
        <StatCard
          title="Outdated"
          value={stats.outdatedDocuments}
          icon={AlertCircle}
          description="Need regeneration"
          color="orange"
        />
        <StatCard
          title="Auto-Update"
          value={stats.autoUpdateEnabled}
          icon={Zap}
          description="Documents with auto-update"
          color="green"
        />
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Activity Over Time */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Activity Over Time</h3>
          <div className="relative h-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={filteredStats.activityData}>
                <defs>
                  <linearGradient id="colorDocuments" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.5)"
                  tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.5)"
                  tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  labelFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  }}
                />
                <Legend
                  wrapperStyle={{ color: 'rgba(255,255,255,0.8)' }}
                />
                <Area
                  type="monotone"
                  dataKey="documents"
                  stackId="1"
                  stroke="#3b82f6"
                  fill="url(#colorDocuments)"
                  name="Documents"
                />
              </AreaChart>
            </ResponsiveContainer>
            {!filteredStats.hasActivityData && (
              <ChartNoDataOverlay message="No activity data for the selected period" />
            )}
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Document Status</h3>
          <div className="relative h-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={filteredStats.statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {filteredStats.statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {!filteredStats.hasStatusData && (
              <ChartNoDataOverlay message="No status data available" />
            )}
          </div>
        </div>

        {/* Input Type Distribution */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Input Type Distribution</h3>
          <div className="relative h-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={filteredStats.inputTypeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis
                  dataKey="name"
                  stroke="rgba(255,255,255,0.5)"
                  tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.5)"
                  tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {!filteredStats.hasInputTypeData && (
              <ChartNoDataOverlay message="No input type data available" />
            )}
          </div>
        </div>

        {/* Repositories Overview */}
        {stats.automationRules && stats.automationRules.length > 0 && (
          <div className="glass-panel p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Github className="h-5 w-5 text-blue-400" />
                  Repositories
                </h3>
                <p className="text-sm text-white/60 mt-1">Repository setup and automation status</p>
              </div>
              <Link
                href="/repos"
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                Manage repos
                <LinkIcon className="h-3 w-3" />
              </Link>
            </div>

            <div className="space-y-4">
              {stats.automationRules
                .reduce((uniqueRepos, rule) => {
                  const existing = uniqueRepos.find(r => r.repoId === rule.repoId);
                  if (!existing) {
                    uniqueRepos.push({
                      repoId: rule.repoId,
                      repoName: rule.repoName,
                      repoUrl: rule.repoUrl,
                      rulesCount: 1,
                      activeRules: rule.enabled ? 1 : 0,
                      lastActivity: rule.lastRunAt,
                    });
                  } else {
                    existing.rulesCount++;
                    if (rule.enabled) existing.activeRules++;
                  }
                  return uniqueRepos;
                }, [] as Array<{
                  repoId: string;
                  repoName: string;
                  repoUrl: string;
                  rulesCount: number;
                  activeRules: number;
                  lastActivity?: string;
                }>)
                .slice(0, 5)
                .map((repo) => (
                  <div key={repo.repoId} className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                          <Github className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="font-medium text-white">{repo.repoName}</div>
                          <div className="text-sm text-white/60">{repo.repoUrl.replace('https://github.com/', '')}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-medium text-white">
                          {repo.activeRules}/{repo.rulesCount} active
                        </div>
                        <div className="text-xs text-white/60">
                          {repo.lastActivity ? new Date(repo.lastActivity).toLocaleDateString() : 'Never'}
                        </div>
                      </div>

                      <Link
                        href={`/repos/setup?repoId=${repo.repoId}`}
                        className="px-3 py-1 text-xs bg-blue-500/20 text-blue-300 rounded-full hover:bg-blue-500/30 transition-colors"
                      >
                        Setup
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Automation Status */}
        {stats.automationRules && stats.automationRules.length > 0 && (
          <div className="glass-panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-400" />
                Automation Status
              </h3>
              <Link
                href="/settings"
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                Manage rules
                <LinkIcon className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {stats.automationRules
                .filter(rule => rule.enabled)
                .slice(0, 5)
                .map((rule) => {
                  const formatDate = (dateString?: string) => {
                    if (!dateString) return 'Never';
                    try {
                      const date = new Date(dateString);
                      const now = new Date();
                      const diffMs = now.getTime() - date.getTime();
                      const diffMins = Math.floor(diffMs / 60000);
                      const diffHours = Math.floor(diffMs / 3600000);
                      const diffDays = Math.floor(diffMs / 86400000);

                      if (diffMins < 1) return 'Just now';
                      if (diffMins < 60) return `${diffMins}m ago`;
                      if (diffHours < 24) return `${diffHours}h ago`;
                      if (diffDays < 7) return `${diffDays}d ago`;
                      return date.toLocaleDateString();
                    } catch {
                      return dateString;
                    }
                  };

                  const getStatusColor = (status?: string) => {
                    if (status === 'success') return 'bg-green-500/20 text-green-400';
                    if (status === 'failed') return 'bg-red-500/20 text-red-400';
                    if (status === 'skipped') return 'bg-yellow-500/20 text-yellow-400';
                    return 'bg-white/10 text-white/60';
                  };

                  const getStatusIcon = (status?: string) => {
                    if (status === 'success') return <CheckCircle2 className="h-4 w-4" />;
                    if (status === 'failed') return <XCircle className="h-4 w-4" />;
                    if (status === 'skipped') return <Clock className="h-4 w-4" />;
                    return <Clock className="h-4 w-4" />;
                  };

                  return (
                    <div key={`${rule.repoId}-${rule.ruleId}`} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                      <div className={`rounded-full p-2 ${getStatusColor(rule.lastRunStatus)}`}>
                        {getStatusIcon(rule.lastRunStatus)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {rule.ruleName}
                        </p>
                        <p className="text-xs text-white/50 truncate">
                          {rule.repoName}
                        </p>
                        <p className="text-xs text-white/40 mt-1">
                          Last run: {formatDate(rule.lastRunAt)}
                        </p>
                        {rule.lastExecution?.doc_id && (
                          <Link
                            href={`/edit/${rule.lastExecution.doc_id}`}
                            className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
                          >
                            View generated doc →
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              {stats.automationRules.filter(rule => rule.enabled).length === 0 && (
                <div className="text-center py-8 text-white/60">
                  <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No enabled automation rules</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Activity Timeline */}
        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
            <Link
              href="/logs"
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              View all logs
              <LinkIcon className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
            {stats.recentActivity.submissions.slice(0, 5).map((sub) => (
              <div key={sub.id} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                <div className={`rounded-full p-2 ${sub.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                  sub.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                  {sub.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> :
                    sub.status === 'processing' ? <Clock className="h-4 w-4" /> :
                      <XCircle className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    Document {sub.status === 'completed' ? 'completed' : sub.status}
                    {sub.is_outdated && <span className="text-yellow-400 ml-2">(Outdated)</span>}
                  </p>
                  <p className="text-xs text-white/50">
                    {new Date(sub.created_at).toLocaleString()}
                  </p>
                </div>
                <Link href={`/edit/${sub.id}`} className="text-white/60 hover:text-white">
                  <LinkIcon className="h-4 w-4" />
                </Link>
              </div>
            ))}
            {stats.recentActivity.submissions.length === 0 && (
              <div className="text-center py-8 text-white/60">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Display (if any) */}
      {stats.errors.submissions && (
        <div className="glass-panel p-4 border border-red-500/20 bg-red-500/10">
          <p className="text-red-400 text-sm">
            Some data could not be loaded. Please refresh the page.
          </p>
        </div>
      )}
    </div>
  );
}

