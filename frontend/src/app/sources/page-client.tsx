'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Layers,
  Link2,
  Plus,
  Square,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { IntegrationLogos } from '@/components/IntegrationLogos';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

interface Repository {
  id: string;
  name: string;
  provider: string;
  scope: Record<string, unknown>;
  connection_id?: string | null;
  status_payload?: Record<string, unknown> | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

interface SourcesPageClientProps {
  userId: string;
  repositories: Repository[];
}

type StatusFilter = 'all' | 'ready' | 'processing' | 'failed' | 'not_started';

type GithubRepo = { id: string; full_name: string; name: string; default_branch: string };
type JiraProject = { id: string; key: string; name: string; cloudId?: string };

const processingStatuses = new Set([
  'queueing',
  'ingesting',
  'fetching',
  'indexing',
  'summarizing',
  'building_akus',
]);

const terminalStatuses = new Set(['ready', 'draft_ready', 'failed', 'error']);

const progressByStatus: Record<string, number> = {
  queueing: 5,
  fetching: 12,
  indexing: 40,
  summarizing: 65,
  building_akus: 85,
  ingesting: 60,
  ready: 100,
  draft_ready: 100,
  failed: 0,
  error: 0,
};

const stepByStatus: Record<string, string> = {
  queueing: 'Queued for setup',
  fetching: 'Fetching source data',
  indexing: 'Indexing source data',
  summarizing: 'Summarizing source data',
  building_akus: 'Building knowledge outputs',
  ingesting: 'Ingesting source data',
  ready: 'Setup complete',
  draft_ready: 'Draft ready',
  failed: 'Setup failed',
  error: 'Setup failed',
};

const repoNameOnly = (value: string) => {
  if (typeof value !== 'string') return '';
  const lastSlash = value.lastIndexOf('/');
  return lastSlash >= 0 ? value.slice(lastSlash + 1) : value;
};

const addedDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const addedTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const formatAddedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { date: '—', time: '' };
  }
  return {
    date: addedDateFormatter.format(parsed),
    time: addedTimeFormatter.format(parsed),
  };
};

const parseGithubRepos = (data: unknown): GithubRepo[] => {
  const repos = (data as { repos?: unknown })?.repos;
  if (!Array.isArray(repos)) return [];

  return repos
    .map((repo) => {
      if (!repo || typeof repo !== 'object') return null;
      const obj = repo as Record<string, unknown>;
      const fullName =
        typeof obj.full_name === 'string'
          ? obj.full_name
          : typeof obj.name === 'string'
            ? obj.name
            : '';
      const name =
        typeof obj.name === 'string'
          ? obj.name
          : fullName.split('/').pop() || fullName || '';
      const idValue = obj.id ?? fullName ?? name;
      if (!idValue) return null;
      const defaultBranch = typeof obj.default_branch === 'string' ? obj.default_branch : 'main';
      return {
        id: String(idValue),
        full_name: fullName || name,
        name: name || fullName,
        default_branch: defaultBranch,
      };
    })
    .filter((repo): repo is GithubRepo => Boolean(repo?.id));
};

const parseJiraProjects = (data: unknown): JiraProject[] => {
  const projects = (data as { projects?: unknown })?.projects;
  const cloudId = (data as { cloudId?: unknown })?.cloudId;
  if (!Array.isArray(projects)) return [];

  return projects
    .map((project) => {
      if (!project || typeof project !== 'object') return null;
      const obj = project as Record<string, unknown>;
      const idSource = obj.id ?? obj.key ?? obj.name;
      if (!idSource) return null;
      const key = obj.key ?? obj.name ?? '';
      const name = obj.name ?? obj.key ?? '';
      const result: JiraProject = { id: String(idSource), key: String(key), name: String(name) };
      if (typeof cloudId === 'string') {
        result.cloudId = cloudId;
      }
      return result;
    })
    .filter((project): project is JiraProject => project !== null);
};

const getRawStatus = (repo: Repository) => ((repo.status_payload?.status as string) || '').toLowerCase();

const getStatusBucket = (repo: Repository): Exclude<StatusFilter, 'all'> => {
  const status = getRawStatus(repo);
  if (status === 'ready' || status === 'draft_ready') return 'ready';
  if (status === 'failed' || status === 'error') return 'failed';
  if (processingStatuses.has(status)) return 'processing';
  return 'not_started';
};

const getProgressPct = (repo: Repository): number => {
  const raw = repo.status_payload?.progress_pct;
  const status = getRawStatus(repo);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.min(100, Math.round(raw)));
  }
  return progressByStatus[status] ?? 0;
};

const getStepLabel = (repo: Repository): string => {
  const explicit = repo.status_payload?.step_label;
  if (typeof explicit === 'string' && explicit.trim().length > 0) return explicit;
  return stepByStatus[getRawStatus(repo)] || 'Waiting to start';
};

function rowToRepository(row: Record<string, unknown>): Repository {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    provider: String(row.provider ?? ''),
    scope: (row.scope as Record<string, unknown>) ?? {},
    connection_id: row.connection_id as string | null | undefined,
    status_payload: (row.status_payload as Record<string, unknown>) ?? null,
    last_error: row.last_error as string | null | undefined,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

export default function SourcesPageClient({ userId, repositories }: SourcesPageClientProps) {
  const [repoList, setRepoList] = useState<Repository[]>(repositories);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [availableGithub, setAvailableGithub] = useState<Array<{ id: string; full_name: string; name: string; default_branch: string }>>([]);
  const [availableJira, setAvailableJira] = useState<Array<{ id: string; key: string; name: string; cloudId?: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addSourceTab, setAddSourceTab] = useState<'single' | 'multi'>('single');
  const [sourceSearch, setSourceSearch] = useState('');
  const [deletingRepoId, setDeletingRepoId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const refreshSources = useCallback(async () => {
    const response = await fetch('/api/sources');
    if (!response.ok) {
      throw new Error('Failed to load sources');
    }
    const data = await response.json();
    const rows = Array.isArray(data) ? (data as Repository[]) : [];
    setRepoList(rows);
    return rows;
  }, []);

  useEffect(() => {
    setRepoList(repositories);
  }, [repositories]);

  const handleConnectRepository = () => {
    setShowSourceDialog(true);
    setCreateError('');
    setLoadError('');
    void loadAvailableSources();
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDeleteRepository = async (repoId: string, _repoName: string) => {
    setDeletingRepoId(repoId);
    try {
      const response = await fetch(`/api/sources/${repoId}`, { method: 'DELETE' });
      if (response.ok) {
        setRepoList((prev) => prev.filter((repo) => repo.id !== repoId));
      } else {
        const error = await response.json();
        alert(`Failed to disconnect source: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Delete source error:', error);
      alert('Failed to disconnect source. Please try again.');
    } finally {
      setDeletingRepoId(null);
    }
  };

  const statusCounts = useMemo(() => {
    const ready = repoList.filter((r) => getStatusBucket(r) === 'ready').length;
    const processing = repoList.filter((r) => getStatusBucket(r) === 'processing').length;
    const failed = repoList.filter((r) => getStatusBucket(r) === 'failed').length;
    const notStarted = repoList.filter((r) => getStatusBucket(r) === 'not_started').length;
    return { total: repoList.length, ready, processing, failed, notStarted };
  }, [repoList]);

  const existingSourceKeys = useMemo(() => {
    const set = new Set<string>();
    repoList.forEach((r) => {
      if (r.provider === 'github' && typeof (r.scope as { repo?: unknown })?.repo === 'string') {
        set.add(`github:${String((r.scope as { repo?: string }).repo).toLowerCase()}`);
      }
      if (r.provider === 'jira' && typeof (r.scope as { project?: unknown })?.project === 'string') {
        set.add(`jira:${String((r.scope as { project?: string }).project).toLowerCase()}`);
      }
    });
    return set;
  }, [repoList]);

  const availableSources = useMemo(() => {
    const repos = availableGithub
      .map((r) => {
        const scopeKey = `github:${(r.full_name || r.name).toLowerCase()}`;
        if (existingSourceKeys.has(scopeKey)) return null;
        return {
          key: `github:${r.id}`,
          scopeKey,
          label: repoNameOnly(r.name || r.full_name),
          subtitle: `Branch: ${r.default_branch || 'main'}`,
          provider: 'github' as const,
        };
      })
      .filter(Boolean) as Array<{ key: string; scopeKey: string; label: string; subtitle: string; provider: 'github' }>;

    const jira = availableJira
      .map((p) => {
        const scopeKey = `jira:${p.key.toLowerCase()}`;
        if (existingSourceKeys.has(scopeKey)) return null;
        return {
          key: `jira:${p.id}`,
          scopeKey,
          label: p.name || p.key,
          subtitle: `Key: ${p.key}`,
          provider: 'jira' as const,
        };
      })
      .filter(Boolean) as Array<{ key: string; scopeKey: string; label: string; subtitle: string; provider: 'jira' }>;

    return [...repos, ...jira].sort((a, b) => a.label.localeCompare(b.label));
  }, [availableGithub, availableJira, existingSourceKeys]);

  const filteredAvailableSources = useMemo(() => {
    const term = sourceSearch.trim().toLowerCase();
    if (!term) return availableSources;
    return availableSources.filter((s) => s.label.toLowerCase().includes(term) || s.subtitle.toLowerCase().includes(term));
  }, [availableSources, sourceSearch]);

  const filteredRepos = useMemo(() => {
    return repoList.filter((repo) => {
      const term = searchQuery.toLowerCase();
      const matchesSearch =
        !term ||
        repo.name.toLowerCase().includes(term) ||
        JSON.stringify(repo.scope || {}).toLowerCase().includes(term);

      const status = getStatusBucket(repo);
      const matchesStatus = statusFilter === 'all' || statusFilter === status;
      return matchesSearch && matchesStatus;
    });
  }, [repoList, searchQuery, statusFilter]);

  const getStatusMeta = (repo: Repository) => {
    const status = getStatusBucket(repo);
    if (status === 'ready') {
      return { label: 'Connected', color: 'success', tone: 'text-emerald-200', isProcessing: false, icon: <CheckCircle2 className="h-4 w-4" /> };
    }
    if (status === 'processing') {
      return { label: 'Processing', color: 'default', tone: 'text-blue-200', isProcessing: true, icon: <Clock className="h-4 w-4" /> };
    }
    if (status === 'failed') {
      return { label: 'Failed', color: 'destructive', tone: 'text-red-200', isProcessing: false, icon: <AlertTriangle className="h-4 w-4" /> };
    }
    return { label: 'Not started', color: 'outline', tone: 'text-white/70', isProcessing: false, icon: <Activity className="h-4 w-4" /> };
  };

  const displayScope = (repo: Repository) => {
    if (!repo.scope) return 'Scope: —';
    if (repo.provider === 'github' && typeof repo.scope.repo === 'string') {
      return `Branch: ${repo.scope.branch ? ` ${repo.scope.branch}` : ''}`;
    }
    if (repo.provider === 'jira' && typeof repo.scope.project === 'string') {
      return `Jira: ${repo.scope.project}`;
    }
    if (repo.provider === 'slack' && typeof repo.scope.channel === 'string') {
      return `Slack: #${repo.scope.channel}`;
    }
    return 'Scope: configured';
  };

  const loadAvailableSources = useCallback(async () => {
    setLoadingSources(true);
    setLoadError('');
    try {
      const [ghRes, jiraRes] = await Promise.allSettled([
        fetch('/api/github/repos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
        fetch('/api/jira/projects'),
      ]);

      let ghRepos: Array<{ id: string; full_name: string; name: string; default_branch: string }> = [];

      if (ghRes.status === 'fulfilled') {
        const ghData = await ghRes.value.json();
        ghRepos = parseGithubRepos(ghData);
      } else {
        setLoadError('Failed to load GitHub repositories.');
      }

      const fetchProjectsForCloud = async (cloudId: string) => {
        const res = await fetch(`/api/jira/projects?cloudId=${encodeURIComponent(cloudId)}`);
        if (!res.ok) return [];
        const data = await res.json();
        return parseJiraProjects({ ...data, cloudId });
      };

      let jiraProjects: Array<{ id: string; key: string; name: string; cloudId?: string }> = [];

      // First attempt: default projects call
      if (jiraRes.status === 'fulfilled') {
        const jiraData = await jiraRes.value.json();
        jiraProjects = parseJiraProjects(jiraData);
      }

      // Fallback: iterate sites until we find projects
      if (jiraProjects.length === 0) {
        const sitesRes = await fetch('/api/jira/sites');
        if (sitesRes.ok) {
          const sitesData = await sitesRes.json();
          const sites = Array.isArray(sitesData?.sites) ? sitesData.sites : [];
          for (const site of sites) {
            if (!site?.id) continue;
            jiraProjects = await fetchProjectsForCloud(String(site.id));
            if (jiraProjects.length > 0) break;
          }
        }
      }

      // Apply both sets at once to avoid staggered rendering
      setAvailableGithub(ghRepos);
      setAvailableJira(jiraProjects);
      if (jiraProjects.length === 0) {
        setLoadError((prev) => prev || 'No Jira projects found. Ensure Atlassian is connected.');
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load sources.');
    } finally {
      setLoadingSources(false);
    }
  }, [setLoadingSources, setLoadError, setAvailableGithub, setAvailableJira]);

  useEffect(() => {
    if (showSourceDialog) {
      void loadAvailableSources();
    }
  }, [showSourceDialog, loadAvailableSources]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createSources = async () => {
    setCreating(true);
    setCreateError('');
    try {
      if (selectedIds.size === 0) {
        throw new Error('Select at least one source to add.');
      }

      const sources: Array<{ provider: string; name: string; scope: Record<string, unknown>; connection_id: string | null }> = [];

      for (const repo of availableGithub) {
        const key = `github:${repo.id}`;
        const scopeKey = `github:${(repo.full_name || repo.name).toLowerCase()}`;
        if (selectedIds.has(key) && !existingSourceKeys.has(scopeKey)) {
          const repoLabel = repoNameOnly(repo.name || repo.full_name);
          sources.push({
            provider: 'github',
            name: repoLabel,
            scope: { repo: repo.full_name, branch: repo.default_branch || 'main' },
            connection_id: null,
          });
        }
      }

      for (const project of availableJira) {
        const key = `jira:${project.id}`;
        const scopeKey = `jira:${project.key.toLowerCase()}`;
        if (selectedIds.has(key) && !existingSourceKeys.has(scopeKey)) {
          sources.push({
            provider: 'jira',
            name: project.name || project.key,
            scope: { project: project.key, cloudId: project.cloudId },
            connection_id: null,
          });
        }
      }

      const payload = { sources, mode: addSourceTab };

      const response = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.detail || 'Failed to create sources');
      }

      setSelectedIds(new Set());
      setSourceSearch('');
      await refreshSources();
      setShowSourceDialog(false);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create sources');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8 px-1 sm:px-2 md:px-0">
      <Card className="overflow-hidden border-white/10 bg-gradient-to-r from-indigo-900/40 via-slate-900/60 to-cyan-900/40 px-1 sm:px-2 md:px-0">
        <CardHeader className="p-8 pb-4 md:p-10 md:pb-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <Badge variant="default" className="bg-white/10 text-white/80">
                Sources
              </Badge>
              <CardTitle className="text-3xl text-white">Connect, index, and automate</CardTitle>
              <CardDescription className="text-white/70">
                Link known sources, track setup progress, and jump straight into automation.
              </CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:w-[360px]">
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="success">Ready</Badge>
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-white">{statusCounts.ready}</p>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Badge>Processing</Badge>
                    <Clock className="h-4 w-4 text-blue-200" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-white">{statusCounts.processing}</p>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">Failed</Badge>
                    <AlertTriangle className="h-4 w-4 text-red-200" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-white">{statusCounts.failed}</p>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Total</Badge>
                    <Database className="h-4 w-4 text-white/70" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-white">{statusCounts.total}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-white/10 bg-white/5 px-1 sm:px-2 md:px-0">
        <CardContent className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between md:px-6">
          <div className="flex flex-1 items-center gap-3">
            <Input
              placeholder="Search by name or source URL"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              className="max-w-lg"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.currentTarget.value as StatusFilter)}
              className="w-48 rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            >
              <option value="all">All statuses</option>
              <option value="ready">Ready</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
              <option value="not_started">Not started</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleConnectRepository}>
              <Plus className="h-4 w-4" />
              Add Source
            </Button>
          </div>
        </CardContent>
      </Card>

      {filteredRepos.length === 0 ? (
        <Card className="border-white/10 bg-white/5 p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
            <Layers className="h-6 w-6 text-white/70" />
          </div>
          <CardTitle className="mt-4 text-xl text-white">No sources yet</CardTitle>
          <p className="mt-2 text-sm text-white/60">
            Add a source from your connected integrations, or connect GitHub or Jira in Settings.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={handleConnectRepository}>
              <Plus className="h-4 w-4" />
              Add Source
            </Button>
            <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white" asChild>
              <Link href="/settings?tab=integrations">
                <Link2 className="h-4 w-4" />
                Connect integrations
              </Link>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3 px-1 sm:px-2 md:px-0">
          {/* Column headers — grid at all breakpoints so Added column always has a slot */}
          <div
            className="grid grid-cols-[1fr_auto_minmax(10rem,1fr)_auto] gap-2 rounded-t-2xl border border-b-0 border-white/10 bg-zinc-800/80 px-4 py-3 sm:gap-3 sm:px-5 md:grid-cols-[minmax(200px,1.6fr)_minmax(140px,1fr)_minmax(10rem,auto)_auto] md:items-center"
            aria-hidden="true"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">Source</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">Status</div>
            <div className="min-w-0 text-xs font-semibold uppercase tracking-wider text-white/60">Added</div>
            <div className="text-right text-xs font-semibold uppercase tracking-wider text-white/60">Actions</div>
          </div>
          {filteredRepos.map((repo) => {
            const statusMeta = getStatusMeta(repo);
            const repoLabel = repoNameOnly(repo.name);
            const addedAt = formatAddedAt(repo.created_at);
            return (
              <div
                key={repo.id}
                className="grid grid-cols-[1fr_auto_minmax(10rem,1fr)_auto] gap-2 rounded-2xl border border-white/10 bg-gradient-to-r from-white/5 to-black/60 px-4 py-4 sm:gap-3 sm:px-5 md:min-h-[88px] md:grid-cols-[minmax(200px,1.6fr)_minmax(140px,1fr)_minmax(10rem,auto)_auto] md:items-center"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/20">
                    <IntegrationLogos provider={repo.provider as 'github' | 'jira' | 'slack'} size={20} color="#ffffff" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-white">{repoLabel}</div>
                    <div className="flex items-center gap-2 text-sm text-white/70">{displayScope(repo)}</div>
                  </div>
                </div>

                <div className="min-w-[180px] space-y-2 md:justify-start">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusMeta.color as 'default' | 'secondary' | 'destructive' | 'outline'} className="flex items-center gap-1">
                      {statusMeta.icon}
                      {statusMeta.label}
                    </Badge>
                    {statusMeta.isProcessing && (
                      <Badge variant="outline" className="text-white/80">
                        {getProgressPct(repo)}%
                      </Badge>
                    )}
                  </div>
                  {statusMeta.isProcessing && (
                    <div className="space-y-1">
                      <p className="truncate text-xs text-white/70">{getStepLabel(repo)}</p>
                      <Progress value={getProgressPct(repo)} className="h-1.5 bg-white/15" />
                    </div>
                  )}
                  {repo.last_error && statusMeta.label === 'Failed' && (
                    <Badge variant="destructive" className="max-w-[220px] truncate text-white/90">
                      {repo.last_error.slice(0, 48)}
                    </Badge>
                  )}
                </div>

                <div className="min-w-0 text-right md:text-left">
                  <p className="text-sm text-white">{addedAt.date}</p>
                  {addedAt.time && <p className="text-xs text-white/60">{addedAt.time}</p>}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="relative group">
                    {getStatusBucket(repo) === 'processing' ? (
                      <>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                          aria-label="Stop setup"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({ id: repo.id, name: repoLabel });
                          }}
                          disabled={deletingRepoId === repo.id}
                        >
                          <Square className="h-4 w-4 fill-current text-red-300" />
                        </Button>
                        <span className="pointer-events-none absolute right-1/2 top-0 z-10 -translate-y-10 translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-black/90 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                          Stop setup
                        </span>
                      </>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                          aria-label="Disconnect"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({ id: repo.id, name: repoLabel });
                          }}
                          disabled={deletingRepoId === repo.id}
                        >
                          <Trash2 className="h-4 w-4 text-red-300" />
                        </Button>
                        <span className="pointer-events-none absolute right-1/2 top-0 z-10 -translate-y-10 translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-black/90 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                          Disconnect
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}


      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md border-white/10 bg-black/95">
          <DialogTitle className="text-white">Disconnect source?</DialogTitle>
          <div className="space-y-4 text-sm text-white/70">
            <p>
              This will delete the record for{' '}
              <span className="font-semibold text-white">{deleteTarget?.name}</span> and remove associated data.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                onClick={() => {
                  if (deleteTarget) {
                    void handleDeleteRepository(deleteTarget.id, deleteTarget.name);
                    setDeleteTarget(null);
                  }
                }}
              >
                Disconnect
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showSourceDialog}
        onOpenChange={(open) => {
          setShowSourceDialog(open);
          if (!open) {
            setSelectedIds(new Set());
            setAddSourceTab('single');
            setCreateError('');
            setLoadError('');
            setSourceSearch('');
          }
        }}
      >
        <DialogContent className="max-w-2xl border-white/10 bg-black/95">
          <DialogTitle className="text-white">Add sources</DialogTitle>
          <p className="text-sm text-white/70">
            Select the sources you want to connect, then click “Add sources”. We’ll start ingesting them in the background.
          </p>
          <Tabs
            value={addSourceTab}
            onValueChange={(v) => {
              setAddSourceTab(v as 'single' | 'multi');
              setSelectedIds(new Set());
            }}
            className="w-full"
          >
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="single">Single source</TabsTrigger>
              <TabsTrigger value="multi">Multi source</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="mt-4 space-y-6">
              {loadError && <p className="text-sm text-red-300">{loadError}</p>}
              {loadingSources && (
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-label="Loading" />
                  <span>Loading sources…</span>
                </div>
              )}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    placeholder="Search sources"
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.currentTarget.value)}
                    className="flex-1 min-w-[220px] max-w-xl !bg-neutral-800 !border-white text-white placeholder:text-white/70"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          filteredAvailableSources.forEach((src) => next.add(src.key));
                          return next;
                        })
                      }
                      disabled={filteredAvailableSources.length === 0}
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedIds(new Set())}
                      disabled={selectedIds.size === 0}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {filteredAvailableSources.length === 0 && !loadingSources && (
                    <p className="text-sm text-white/60">No available sources found. Connect integrations first.</p>
                  )}
                  {filteredAvailableSources.map((src) => {
                    const selected = selectedIds.has(src.key);
                    return (
                      <label
                        key={src.key}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:border-white/30"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-indigo-500"
                          checked={selected}
                          onChange={() => toggleSelection(src.key)}
                        />
                        <IntegrationLogos provider={src.provider} size={18} color="#ffffff" />
                        <div className="flex flex-col">
                          <span className="font-medium text-white">{src.label}</span>
                          <span className="text-xs text-white/60">{src.subtitle}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="multi" className="mt-4 space-y-6">
              {loadError && <p className="text-sm text-red-300">{loadError}</p>}
              {loadingSources && (
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-label="Loading" />
                  <span>Loading sources…</span>
                </div>
              )}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    placeholder="Search sources"
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.currentTarget.value)}
                    className="flex-1 min-w-[220px] max-w-xl !bg-neutral-800 !border-white text-white placeholder:text-white/70"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          filteredAvailableSources.forEach((src) => next.add(src.key));
                          return next;
                        })
                      }
                      disabled={filteredAvailableSources.length === 0}
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedIds(new Set())}
                      disabled={selectedIds.size === 0}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {filteredAvailableSources.length === 0 && !loadingSources && (
                    <p className="text-sm text-white/60">No available sources found. Connect integrations first.</p>
                  )}
                  {filteredAvailableSources.map((src) => {
                    const selected = selectedIds.has(src.key);
                    return (
                      <label
                        key={src.key}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:border-white/30"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-indigo-500"
                          checked={selected}
                          onChange={() => toggleSelection(src.key)}
                        />
                        <IntegrationLogos provider={src.provider} size={18} color="#ffffff" />
                        <div className="flex flex-col">
                          <span className="font-medium text-white">{src.label}</span>
                          <span className="text-xs text-white/60">{src.subtitle}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {createError && <p className="text-sm text-red-300">{createError}</p>}

          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="h-11 !rounded-full !border !border-white/50 !bg-white/10 px-5 text-white shadow-sm transition hover:!bg-white/20 hover:shadow"
              onClick={() => setShowSourceDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="lg"
              className="h-11 !rounded-full !bg-white px-6 !text-slate-900 font-semibold shadow-lg transition hover:!bg-slate-100 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              onClick={createSources}
              disabled={creating}
            >
              {creating ? 'Adding…' : 'Add sources'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
