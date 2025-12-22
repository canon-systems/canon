'use client';

import { useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import {
  FileText,
  RefreshCw,
  Layers3,
  Activity,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  TrendingUp,
  Link as LinkIcon,
  Github,
  BookOpen,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface OverviewStats {
  totalDocuments: number;
  totalSubmissions: number;
  processingDocuments: number;
  failedDocuments: number;
  outdatedDocuments: number;
  totalRegenerated: number;
  autoUpdateEnabled: number;
  totalArchitectureDiagrams: number;
  totalArchitectureRegenerated: number;
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

interface OverviewPageClientProps {
  user: User | null;
  stats: OverviewStats;
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  accent = 'indigo',
}: {
  title: string;
  value: number | string;
  icon: typeof FileText;
  description?: string;
  accent?: 'indigo' | 'emerald' | 'purple' | 'amber' | 'red' | 'blue';
}) {
  const accentMap: Record<string, string> = {
    indigo: 'from-indigo-500/20 to-cyan-400/15 border-indigo-400/30',
    emerald: 'from-emerald-500/20 to-lime-400/15 border-emerald-400/30',
    purple: 'from-purple-500/20 to-pink-400/15 border-purple-400/30',
    amber: 'from-amber-500/20 to-orange-400/15 border-amber-400/30',
    red: 'from-red-500/20 to-pink-500/15 border-red-400/30',
    blue: 'from-blue-500/20 to-cyan-400/15 border-blue-400/30',
  };
  return (
    <Card className={`border ${accentMap[accent]} bg-white/5`}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex flex-col">
          <CardDescription className="text-white/70">{title}</CardDescription>
          <CardTitle className="text-3xl text-white">{value}</CardTitle>
          {description && <p className="text-xs text-white/60 mt-2">{description}</p>}
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white shadow-inner shadow-black/30">
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
    </Card>
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

export function OverviewPageClient({ user, stats }: OverviewPageClientProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

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

      if (statusFilter !== 'all') {
        if (statusFilter === 'outdated') {
          if (!sub.is_outdated) return false;
        } else {
          if (sub.status !== statusFilter) return false;
        }
      }

      return true;
    });

    const filteredRegenerated = filteredSubmissions.filter((sub) => {
      if (!sub.last_checked_at) return false;
      const created = new Date(sub.created_at);
      const checked = new Date(sub.last_checked_at);
      return checked.getTime() - created.getTime() > 60000;
    });

    const completed = filteredSubmissions.filter((s) => s.status === 'completed').length;
    const processing = filteredSubmissions.filter((s) => s.status === 'processing').length;
    const failed = filteredSubmissions.filter((s) => s.status === 'failed').length;
    const outdated = filteredSubmissions.filter((s) => s.is_outdated).length;

    const activityByDay: Record<string, { documents: number; date: string }> = {};

    filteredSubmissions.forEach((sub) => {
      const date = new Date(sub.created_at).toISOString().split('T')[0];
      if (!activityByDay[date]) {
        activityByDay[date] = { documents: 0, date };
      }
      activityByDay[date].documents++;
    });

    const activityData = Object.values(activityByDay)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);


    const statusData = [
      { name: 'Completed', value: completed, color: '#10b981' },
      { name: 'Processing', value: processing, color: '#f59e0b' },
      { name: 'Failed', value: failed, color: '#ef4444' },
      { name: 'Outdated', value: outdated, color: '#8b5cf6' },
    ].filter((item) => item.value > 0);

    const activityHasData = activityData.length > 0;
    const statusHasData = statusData.length > 0;

    return {
      totalDocuments: filteredSubmissions.filter((s) => s.status === 'completed').length,
      totalRegenerated: filteredRegenerated.length,
      activityData: activityHasData
        ? activityData
        : [
          {
            date: new Date().toISOString().split('T')[0],
            documents: 0,
          },
        ],
      statusData: statusHasData
        ? statusData
        : [
          {
            name: 'No Data',
            value: 1,
            color: '#4b5563',
          },
        ],
      hasActivityData: activityHasData,
      hasStatusData: statusHasData,
      completed,
      processing,
      failed,
      outdated,
    };
  }, [timeFilter, statusFilter, stats.rawData]);

  const hasAutomationRules = Boolean(stats.automationRules?.length);
  const enabledAutomationRules = stats.automationRules?.filter((rule) => rule.enabled) ?? [];

  return (
    <div className="space-y-8 px-1 sm:px-2 md:px-0">
      <Card className="overflow-hidden border border-white/10 bg-gradient-to-r from-black/70 via-slate-900/50 to-black/70 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <CardHeader className="p-8 pb-4 md:p-10 md:pb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <Badge variant="outline" className="border-amber-400/50 text-amber-200">
                Overview
              </Badge>
              <CardTitle className="text-3xl text-white">Welcome to Sync</CardTitle>
              <CardDescription className="text-white/70">
                Your AI-powered documentation platform for software teams
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <Calendar className="h-4 w-4 text-white/60" />
                <Select value={timeFilter} onValueChange={(v) => setTimeFilter((v as TimeFilter) ?? 'all')}>
                  <SelectTrigger className="w-44 bg-transparent text-white">
                    <SelectValue placeholder="All time" />
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
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v as StatusFilter) ?? 'all')}>
                <SelectTrigger className="w-36 bg-white/5 text-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="outdated">Outdated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {stats.connectedReposCount === 0 && (
        <Card className="border border-white/10 bg-white/5">
          <CardContent className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
              <Github className="h-6 w-6" />
            </div>
            <CardTitle className="mt-4 text-2xl text-white">Get Started with Sync</CardTitle>
            <CardDescription className="mt-2 text-white/70">
              Transform your codebase into clear, comprehensive documentation with AI-powered analysis. Connect your first repository to begin generating professional documentation automatically.
            </CardDescription>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href="/repos">
                  <Github className="h-4 w-4" />
                  Connect Repository
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/documentation">Generate Documentation</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}


      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Documents Generated" value={filteredStats.totalDocuments} icon={FileText} description="Total completed documents" accent="indigo" />
        <StatCard title="Documents Regenerated" value={filteredStats.totalRegenerated} icon={RefreshCw} description="Updated after initial creation" accent="emerald" />
        <StatCard title="Architecture Diagrams Generated" value={stats.totalArchitectureDiagrams} icon={Layers3} description="Total completed diagrams" accent="purple" />
        <StatCard title="Architecture Diagrams Regenerated" value={stats.totalArchitectureRegenerated} icon={RefreshCw} description="Updated after initial creation" accent="amber" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Processing" value={stats.processingDocuments} icon={Clock} description="Currently processing" accent="amber" />
        <StatCard title="Failed" value={stats.failedDocuments} icon={XCircle} description="Failed documents" accent="red" />
        <StatCard title="Outdated" value={stats.outdatedDocuments} icon={AlertCircle} description="Need regeneration" accent="purple" />
        <StatCard title="Auto-Update" value={stats.autoUpdateEnabled} icon={Zap} description="Documents with auto-update" accent="emerald" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/10 bg-white/5 relative">
          <CardHeader className="pb-2">
            <CardTitle className="text-white">Activity Over Time</CardTitle>
            <CardDescription className="text-white/70">Last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="relative h-[320px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={filteredStats.activityData}>
                <defs>
                  <linearGradient id="colorDocuments" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.5)"
                  tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  labelFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  }}
                />
                <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.8)' }} />
                <Area type="monotone" dataKey="documents" stackId="1" stroke="#fbbf24" fill="url(#colorDocuments)" name="Documents" />
              </AreaChart>
            </ResponsiveContainer>
            {!filteredStats.hasActivityData && <ChartNoDataOverlay message="No activity data for the selected period" />}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 relative">
          <CardHeader className="pb-2">
            <CardTitle className="text-white">Document Status</CardTitle>
            <CardDescription className="text-white/70">Latest snapshot</CardDescription>
          </CardHeader>
          <CardContent className="relative h-[320px]">
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
                    color: '#fff',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {!filteredStats.hasStatusData && <ChartNoDataOverlay message="No status data available" />}
          </CardContent>
        </Card>
      </div>

      {hasAutomationRules && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-white/10 bg-white/5">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <Github className="h-5 w-5 text-blue-300" />
                  Repositories
                </CardTitle>
                <CardDescription className="text-white/70">Repository setup and automation status</CardDescription>
              </div>
              <Link href="/repos" className="text-sm text-amber-200 hover:text-amber-100 flex items-center gap-1">
                Manage repos
                <LinkIcon className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.automationRules
                ?.reduce((uniqueRepos, rule) => {
                  const existing = uniqueRepos.find((r) => r.repoId === rule.repoId);
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
                  <Card key={repo.repoId} className="border-white/10 bg-white/5">
                    <CardContent className="flex items-center justify-between gap-4 p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                          <Github className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-white">{repo.repoName}</p>
                          <p className="text-sm text-white/60">{repo.repoUrl.replace('https://github.com/', '')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium text-white">
                            {repo.activeRules}/{repo.rulesCount} active
                          </p>
                          <p className="text-xs text-white/60">
                            {repo.lastActivity ? new Date(repo.lastActivity).toLocaleDateString() : 'Never'}
                          </p>
                        </div>
                        <Button asChild variant="secondary" className="text-sm px-3 py-1">
                          <Link href={`/repos/setup?repoId=${repo.repoId}`}>Setup</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-300" />
                Automation Status
              </CardTitle>
              <Link href="/settings" className="text-sm text-amber-200 hover:text-amber-100 flex items-center gap-1">
                Manage rules
                <LinkIcon className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {enabledAutomationRules.slice(0, 5).map((rule) => {
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
                    if (status === 'success') return 'success';
                    if (status === 'failed') return 'destructive';
                    if (status === 'skipped') return 'warning';
                    return 'outline';
                  };

                  const getStatusIcon = (status?: string) => {
                    if (status === 'success') return <CheckCircle2 className="h-4 w-4" />;
                    if (status === 'failed') return <XCircle className="h-4 w-4" />;
                    if (status === 'skipped') return <Clock className="h-4 w-4" />;
                    return <Clock className="h-4 w-4" />;
                  };

                  return (
                    <Card key={`${rule.repoId}-${rule.ruleId}`} className="border-white/10 bg-white/5">
                      <CardContent className="flex items-center gap-3 p-3">
                        <Badge variant={getStatusColor(rule.lastRunStatus) as any} className="flex items-center gap-1">
                          {getStatusIcon(rule.lastRunStatus)}
                          {rule.lastRunStatus ?? 'Pending'}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{rule.ruleName}</p>
                          <p className="text-xs text-white/60 truncate">{rule.repoName}</p>
                          <p className="text-xs text-white/50 mt-1">Last run: {formatDate(rule.lastRunAt)}</p>
                          {rule.lastExecution?.doc_id && (
                            <Link href={`/edit/${rule.lastExecution.doc_id}`} className="text-xs text-amber-200 hover:text-amber-100 mt-1 inline-block">
                              View generated doc →
                            </Link>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {enabledAutomationRules.length === 0 && (
                  <div className="text-center py-8 text-white/60">
                    <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No enabled automation rules</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-white/10 bg-white/5">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white">Recent Activity</CardTitle>
          <Link href="/logs" className="text-sm text-amber-200 hover:text-amber-100 flex items-center gap-1">
            View all logs
            <LinkIcon className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {stats.recentActivity.submissions.slice(0, 5).map((sub) => (
              <Card key={sub.id} className="border-white/10 bg-white/5">
                <CardContent className="flex items-center gap-3 p-3">
                  <div
                    className={`
                      flex h-9 w-9 items-center justify-center rounded-full
                      ${sub.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : sub.status === 'processing'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-red-500/20 text-red-300'}
                    `}
                  >
                    {sub.status === 'completed' ? <CheckCircle2 className="h-5 w-5" /> : sub.status === 'processing' ? <Clock className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      Document {sub.status === 'completed' ? 'completed' : sub.status}
                      {sub.is_outdated && <span className="text-amber-300 ml-2">(Outdated)</span>}
                    </p>
                    <p className="text-xs text-white/60">{new Date(sub.created_at).toLocaleString()}</p>
                  </div>
                  <Link href={`/edit/${sub.id}`} className="text-white/60 hover:text-white">
                    <LinkIcon className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            ))}
            {stats.recentActivity.submissions.length === 0 && (
              <div className="text-center py-8 text-white/60">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {stats.errors.submissions && (
        <Card className="border-red-500/20 bg-red-500/10">
          <CardContent className="p-4">
            <p className="text-red-400 text-sm">Some data could not be loaded. Please refresh the page.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
