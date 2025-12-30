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
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  Link as LinkIcon,
  Github,
  BookOpen,
} from 'lucide-react';
import {
  Area,
  AreaChart,
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
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface UsageEvent {
  id: string;
  event_type: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

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
  usageEvents: UsageEvent[];
  recentActivity: {
    events: UsageEvent[];
  };
  errors: {
    usageEvents?: string;
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
type ActivityFilter = 'all' | 'documents' | 'diagrams' | 'automation' | 'repos' | 'integrations' | 'knowledge-base' | 'other';

const EVENT_CATEGORY_MAP: Record<string, ActivityFilter> = {
  doc_generated: 'documents',
  doc_auto_published: 'documents',
  doc_deleted: 'documents',
  architecture_diagram_generated: 'diagrams',
  architecture_diagram_regenerated: 'diagrams',
  architecture_diagram_deleted: 'diagrams',
  repo_scan_run: 'automation',
  repo_connected: 'repos',
  repo_disconnected: 'repos',
  integration_connected: 'integrations',
  integration_disconnected: 'integrations',
  push_to_kb: 'knowledge-base',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  doc_generated: 'Doc generated',
  doc_auto_published: 'Doc auto-published',
  doc_deleted: 'Doc deleted',
  architecture_diagram_generated: 'Diagram generated',
  architecture_diagram_regenerated: 'Diagram regenerated',
  architecture_diagram_deleted: 'Diagram deleted',
  repo_scan_run: 'Repo scan',
  repo_connected: 'Repo connected',
  repo_disconnected: 'Repo disconnected',
  integration_connected: 'Integration connected',
  integration_disconnected: 'Integration disconnected',
  push_to_kb: 'Pushed to KB',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  doc_generated: '#f5f5f5',
  doc_auto_published: '#e5e7eb',
  doc_deleted: '#d4d4d8',
  architecture_diagram_generated: '#cfcfcf',
  architecture_diagram_regenerated: '#bfbfbf',
  architecture_diagram_deleted: '#a3a3a3',
  repo_scan_run: '#d1d5db',
  repo_connected: '#e7e7e7',
  repo_disconnected: '#b0b0b0',
  integration_connected: '#d6d6d6',
  integration_disconnected: '#9f9f9f',
  push_to_kb: '#ededed',
};

const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
  all: 'All time',
  '24h': 'Last 24 hours',
  '3d': 'Last 3 days',
  '7d': 'Last 7 days',
  '14d': 'Last 2 weeks',
  '30d': 'Last 30 days',
  '90d': 'Last 3 months',
  '180d': 'Last 6 months',
  '1y': 'Last year',
};

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
    indigo: 'from-white/10 to-white/0 border-white/20',
    emerald: 'from-white/10 to-white/0 border-white/20',
    purple: 'from-white/10 to-white/0 border-white/20',
    amber: 'from-white/10 to-white/0 border-white/20',
    red: 'from-white/10 to-white/0 border-white/20',
    blue: 'from-white/10 to-white/0 border-white/20',
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
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');

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

    const getEventCategory = (eventType: string): ActivityFilter => EVENT_CATEGORY_MAP[eventType] ?? 'other';

    const dateFilteredEvents = stats.usageEvents.filter((event) => filterByDate(event.created_at));
    const filteredEvents = activityFilter === 'all'
      ? dateFilteredEvents
      : dateFilteredEvents.filter((event) => getEventCategory(event.event_type) === activityFilter);

    const activityByDay: Record<string, { events: number; date: string }> = {};

    filteredEvents.forEach((event) => {
      const date = new Date(event.created_at).toISOString().split('T')[0];
      if (!activityByDay[date]) {
        activityByDay[date] = { events: 0, date };
      }
      activityByDay[date].events += 1;
    });

    const activityData = Object.values(activityByDay)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    const eventTypeCounts = new Map<string, { value: number; color: string }>();
    filteredEvents.forEach((event) => {
      const label = EVENT_TYPE_LABELS[event.event_type] ?? 'Other';
      const color = EVENT_TYPE_COLORS[event.event_type] ?? '#6b7280';
      const existing = eventTypeCounts.get(label);
      if (existing) {
        existing.value += 1;
      } else {
        eventTypeCounts.set(label, { value: 1, color });
      }
    });

    const statusData = Array.from(eventTypeCounts.entries())
      .map(([name, data]) => ({ name, value: data.value, color: data.color }))
      .sort((a, b) => b.value - a.value);

    const activityHasData = activityData.length > 0;
    const statusHasData = statusData.length > 0;

    const docGeneratedEvents = dateFilteredEvents.filter((event) => event.event_type === 'doc_generated');
    const docAutoPublishedEvents = dateFilteredEvents.filter((event) => event.event_type === 'doc_auto_published');
    const diagramGeneratedEvents = dateFilteredEvents.filter((event) => event.event_type === 'architecture_diagram_generated');
    const diagramRegeneratedEvents = dateFilteredEvents.filter((event) => event.event_type === 'architecture_diagram_regenerated');
    const totalDocuments = docGeneratedEvents.length;
    const totalArchitectureDiagrams = diagramGeneratedEvents.length;

    return {
      totalDocuments,
      totalRegenerated: docAutoPublishedEvents.length,
      totalArchitectureDiagrams,
      totalArchitectureRegenerated: diagramRegeneratedEvents.length,
      activityData: activityHasData
        ? activityData
        : [
          {
            date: new Date().toISOString().split('T')[0],
            events: 0,
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
    };
  }, [timeFilter, activityFilter, stats.usageEvents]);

  const hasAutomationRules = Boolean(stats.automationRules?.length);
  const enabledAutomationRules = stats.automationRules?.filter((rule) => rule.enabled) ?? [];

  const getRepoName = (repoUrl?: string) => {
    if (!repoUrl) return undefined;
    const trimmed = repoUrl.replace(/\/$/, '');
    const name = trimmed.split('/').pop();
    return name?.replace('.git', '');
  };

  const getEventDisplay = (event: UsageEvent) => {
    const metadata = event.metadata ?? {};
    const docId = typeof metadata['doc_id'] === 'string' ? metadata['doc_id'] : undefined;
    const diagramId = typeof metadata['diagram_id'] === 'string' ? metadata['diagram_id'] : undefined;
    const repoUrl = typeof metadata['repo_url'] === 'string' ? metadata['repo_url'] : undefined;
    const provider = typeof metadata['provider'] === 'string' ? metadata['provider'] : undefined;
    const repoName = getRepoName(repoUrl);
    const baseTitle = EVENT_TYPE_LABELS[event.event_type] ?? 'Activity';
    const title = repoName ? `${baseTitle} • ${repoName}` : provider ? `${baseTitle} • ${provider}` : baseTitle;

    switch (event.event_type) {
      case 'doc_generated':
        return { title, icon: CheckCircle2, colorClass: 'bg-white/10 text-white/80', link: docId ? `/edit/${docId}` : undefined };
      case 'doc_auto_published':
        return { title, icon: RefreshCw, colorClass: 'bg-white/10 text-white/70', link: docId ? `/edit/${docId}` : undefined };
      case 'doc_deleted':
        return { title, icon: XCircle, colorClass: 'bg-white/5 text-white/70', link: undefined };
      case 'architecture_diagram_generated':
        return { title, icon: Layers3, colorClass: 'bg-white/10 text-white/80', link: diagramId ? `/architecture-diagrams/view/${diagramId}` : '/architecture-diagrams' };
      case 'architecture_diagram_regenerated':
        return { title, icon: RefreshCw, colorClass: 'bg-white/10 text-white/70', link: diagramId ? `/architecture-diagrams/view/${diagramId}` : '/architecture-diagrams' };
      case 'architecture_diagram_deleted':
        return { title, icon: XCircle, colorClass: 'bg-white/5 text-white/70', link: '/architecture-diagrams' };
      case 'repo_connected':
        return { title, icon: Github, colorClass: 'bg-white/10 text-white/80', link: '/repos' };
      case 'repo_disconnected':
        return { title, icon: Github, colorClass: 'bg-white/5 text-white/70', link: '/repos' };
      case 'integration_connected':
        return { title, icon: LinkIcon, colorClass: 'bg-white/10 text-white/80', link: '/integrations' };
      case 'integration_disconnected':
        return { title, icon: LinkIcon, colorClass: 'bg-white/5 text-white/70', link: '/integrations' };
      case 'repo_scan_run':
        return { title, icon: Activity, colorClass: 'bg-white/10 text-white/70', link: '/repos' };
      case 'push_to_kb':
        return { title, icon: BookOpen, colorClass: 'bg-white/10 text-white/70', link: docId ? `/edit/${docId}` : '/documentation' };
      default:
        return { title, icon: Activity, colorClass: 'bg-white/10 text-white/70', link: undefined };
    }
  };

  return (
    <div className="space-y-8 px-1 sm:px-2 md:px-0">
      <Card className="overflow-hidden border border-white/10 bg-gradient-to-r from-black/70 via-slate-900/50 to-black/70 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <CardHeader className="p-8 pb-4 md:p-10 md:pb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <Badge variant="outline" className="border-white/30 text-white/80">
                Overview
              </Badge>
              <CardTitle className="text-3xl text-white">Welcome to Canon</CardTitle>
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
              <Select value={activityFilter} onValueChange={(v) => setActivityFilter((v as ActivityFilter) ?? 'all')}>
                <SelectTrigger className="w-36 bg-white/5 text-white">
                  <SelectValue placeholder="Activity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All activity</SelectItem>
                  <SelectItem value="documents">Documents</SelectItem>
                  <SelectItem value="diagrams">Diagrams</SelectItem>
                  <SelectItem value="automation">Automation</SelectItem>
                  <SelectItem value="repos">Repositories</SelectItem>
                  <SelectItem value="integrations">Integrations</SelectItem>
                  <SelectItem value="knowledge-base">Knowledge base</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
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
            <CardTitle className="mt-4 text-2xl text-white">Get Started with Canon</CardTitle>
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
        <StatCard title="Architecture Diagrams Generated" value={filteredStats.totalArchitectureDiagrams} icon={Layers3} description="Total completed diagrams" accent="purple" />
        <StatCard title="Architecture Diagrams Regenerated" value={filteredStats.totalArchitectureRegenerated} icon={RefreshCw} description="Updated after initial creation" accent="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/10 bg-white/5 relative">
          <CardHeader className="pb-2">
            <CardTitle className="text-white">Activity Over Time</CardTitle>
            <CardDescription className="text-white/70">{TIME_FILTER_LABELS[timeFilter]}</CardDescription>
          </CardHeader>
          <CardContent className="relative h-[320px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={filteredStats.activityData}>
                <defs>
                  <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
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
                <Area type="monotone" dataKey="events" stackId="1" stroke="#f97316" fill="url(#colorEvents)" name="Events" />
              </AreaChart>
            </ResponsiveContainer>
            {!filteredStats.hasActivityData && <ChartNoDataOverlay message="No activity data for the selected period" />}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 relative">
          <CardHeader className="pb-2">
            <CardTitle className="text-white">Activity Breakdown</CardTitle>
            <CardDescription className="text-white/70">By event type</CardDescription>
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
            {!filteredStats.hasStatusData && <ChartNoDataOverlay message="No activity data available" />}
          </CardContent>
        </Card>
      </div>

      {hasAutomationRules && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-white/10 bg-white/5">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Github className="h-5 w-5 text-white/70" />
                Repositories
              </CardTitle>
                <CardDescription className="text-white/70">Repository setup and automation status</CardDescription>
              </div>
              <Link href="/repos" className="text-sm text-white/80 hover:text-white flex items-center gap-1">
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
                <Zap className="h-5 w-5 text-white/70" />
                Automation Status
              </CardTitle>
              <Link href="/settings" className="text-sm text-white/80 hover:text-white flex items-center gap-1">
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
                            <Link href={`/edit/${rule.lastExecution.doc_id}`} className="text-xs text-white/75 hover:text-white mt-1 inline-block">
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
          <Link href="/logs" className="text-sm text-white/80 hover:text-white flex items-center gap-1">
            View all logs
            <LinkIcon className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {stats.recentActivity.events.slice(0, 5).map((event) => {
              const display = getEventDisplay(event);
              const Icon = display.icon;
              return (
                <Card key={event.id} className="border-white/10 bg-white/5">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full ${display.colorClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{display.title}</p>
                      <p className="text-xs text-white/60">{new Date(event.created_at).toLocaleString()}</p>
                    </div>
                    {display.link && (
                      <Link href={display.link} className="text-white/60 hover:text-white">
                        <LinkIcon className="h-4 w-4" />
                      </Link>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {stats.recentActivity.events.length === 0 && (
              <div className="text-center py-8 text-white/60">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {stats.errors.usageEvents && (
        <Card className="border-white/20 bg-white/5">
          <CardContent className="p-4">
            <p className="text-white/80 text-sm">Some data could not be loaded. Please refresh the page.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
