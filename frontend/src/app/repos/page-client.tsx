'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Github,
  Layers,
  Plus,
  Trash2,
} from 'lucide-react';
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
import { IntegrationLogos } from '@/components/IntegrationLogos';
import { Input } from '@/components/ui/input';

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

interface RepositoriesPageClientProps {
  repositories: Repository[];
}

type StatusFilter = 'all' | 'ready' | 'processing' | 'failed' | 'not_started';

type GithubRepo = { id: string; full_name: string; name: string; default_branch: string };
type JiraProject = { id: string; key: string; name: string };

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
  if (!Array.isArray(projects)) return [];

  return projects
    .map((project) => {
      if (!project || typeof project !== 'object') return null;
      const obj = project as Record<string, unknown>;
      const idSource = obj.id ?? obj.key ?? obj.name;
      if (!idSource) return null;
      const key = obj.key ?? obj.name ?? '';
      const name = obj.name ?? obj.key ?? '';
      return { id: String(idSource), key: String(key), name: String(name) };
    })
    .filter((project): project is JiraProject => Boolean(project?.id));
};

export default function RepositoriesPageClient({ repositories }: RepositoriesPageClientProps) {
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [availableGithub, setAvailableGithub] = useState<Array<{ id: string; full_name: string; name: string; default_branch: string }>>([]);
  const [availableJira, setAvailableJira] = useState<Array<{ id: string; key: string; name: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sourceSearch, setSourceSearch] = useState('');
  const [deletingRepoId, setDeletingRepoId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

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
      const response = await fetch(`/api/repos/${repoId}`, { method: 'DELETE' });
      if (response.ok) {
        window.location.reload();
      } else {
        const error = await response.json();
        alert(`Failed to disconnect repository: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Delete repository error:', error);
      alert('Failed to disconnect repository. Please try again.');
    } finally {
      setDeletingRepoId(null);
    }
  };

  const statusCounts = useMemo(() => {
    const ready = repositories.filter((r) => {
      const status = (r.status_payload?.status as string) || '';
      return status === 'ready' || status === 'draft_ready';
    }).length;
    const processing = repositories.filter((r) => {
      const status = (r.status_payload?.status as string) || '';
      return status === 'queueing' || status === 'ingesting';
    }).length;
    const failed = repositories.filter((r) => {
      const status = (r.status_payload?.status as string) || '';
      return status === 'failed' || status === 'error';
    }).length;
    const notStarted = repositories.filter((r) => {
      const status = (r.status_payload?.status as string) || '';
      return !status || status === 'pending';
    }).length;
    return { total: repositories.length, ready, processing, failed, notStarted };
  }, [repositories]);

  const availableSources = useMemo(() => {
    const repos = availableGithub.map((r) => ({
      key: `github:${r.id}`,
      label: r.name || r.full_name,
      subtitle: `Branch: ${r.default_branch || 'main'}`,
      provider: 'github' as const,
    }));
    const jira = availableJira.map((p) => ({
      key: `jira:${p.id}`,
      label: p.name || p.key,
      subtitle: `Key: ${p.key}`,
      provider: 'jira' as const,
    }));
    return [...repos, ...jira].sort((a, b) => a.label.localeCompare(b.label));
  }, [availableGithub, availableJira]);

  const filteredAvailableSources = useMemo(() => {
    const term = sourceSearch.trim().toLowerCase();
    if (!term) return availableSources;
    return availableSources.filter((s) => s.label.toLowerCase().includes(term) || s.subtitle.toLowerCase().includes(term));
  }, [availableSources, sourceSearch]);

  const filteredRepos = useMemo(() => {
    return repositories.filter((repo) => {
      const term = searchQuery.toLowerCase();
      const matchesSearch =
        !term ||
        repo.name.toLowerCase().includes(term) ||
        JSON.stringify(repo.scope || {}).toLowerCase().includes(term);

      const statusValue = (repo.status_payload?.status as string) || '';
      const status =
        statusValue === 'ready' || statusValue === 'draft_ready'
          ? 'ready'
          : statusValue === 'queueing' || statusValue === 'ingesting'
            ? 'processing'
            : statusValue === 'failed' || statusValue === 'error'
              ? 'failed'
              : 'not_started';

      const matchesStatus = statusFilter === 'all' || statusFilter === status;
      return matchesSearch && matchesStatus;
    });
  }, [repositories, searchQuery, statusFilter]);

  const getStatusMeta = (repo: Repository) => {
    const status = (repo.status_payload?.status as string) || '';
    if (status === 'ready' || status === 'draft_ready') {
      return { label: 'Connected', color: 'success', tone: 'text-emerald-200', icon: <CheckCircle2 className="h-4 w-4" /> };
    }
    if (status === 'queueing' || status === 'ingesting') {
      return { label: 'Processing', color: 'default', tone: 'text-blue-200', icon: <Clock className="h-4 w-4" /> };
    }
    if (status === 'failed' || status === 'error') {
      return { label: 'Failed', color: 'destructive', tone: 'text-red-200', icon: <AlertTriangle className="h-4 w-4" /> };
    }
    return { label: 'Not started', color: 'outline', tone: 'text-white/70', icon: <Activity className="h-4 w-4" /> };
  };

  const displayScope = (repo: Repository) => {
    if (!repo.scope) return 'Scope: —';
    if (repo.provider === 'github' && typeof repo.scope.repo === 'string') {
      return `Repo: ${repo.scope.repo}${repo.scope.branch ? ` @ ${repo.scope.branch}` : ''}`;
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
        return parseJiraProjects(data);
      };

      let jiraProjects: Array<{ id: string; key: string; name: string }> = [];

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
        setLoadError((prev) => prev || 'No Jira projects found. Ensure Jira/Confluence OAuth is connected.');
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
        if (selectedIds.has(key)) {
          sources.push({
            provider: 'github',
            name: repo.full_name,
            scope: { repo: repo.full_name, branch: repo.default_branch || 'main' },
            connection_id: null,
          });
        }
      }

      for (const project of availableJira) {
        const key = `jira:${project.id}`;
        if (selectedIds.has(key)) {
          sources.push({
            provider: 'jira',
            name: project.name || project.key,
            scope: { project: project.key },
            connection_id: null,
          });
        }
      }

      const payload = { sources };

      const response = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.detail || 'Failed to create sources');
      }

      setShowSourceDialog(false);
      // reload to show new sources
      window.location.reload();
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
                Link GitHub and Jira sources, track setup progress, and jump straight into documentation or automation.
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
                    <Github className="h-4 w-4 text-white/70" />
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
            <Button variant="secondary" onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}>
              Clear filters
            </Button>
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
          <div className="mt-6 flex justify-center">
            <Button onClick={handleConnectRepository}>
              <Plus className="h-4 w-4" />
              Add Source
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3 px-1 sm:px-2 md:px-0">
          {filteredRepos.map((repo) => {
            const statusMeta = getStatusMeta(repo);
            return (
              <div key={repo.id} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-white/5 to-black/60 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/20">
                    <IntegrationLogos provider={repo.provider as 'github' | 'jira' | 'slack'} size={20} color="#ffffff" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-white">{repo.name}</div>
                    <div className="flex items-center gap-2 text-sm text-white/70">{displayScope(repo)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusMeta.color as 'default' | 'secondary' | 'destructive' | 'outline'} className="flex items-center gap-1">
                    {statusMeta.icon}
                    {statusMeta.label}
                  </Badge>
                  {typeof repo.status_payload?.progress_pct === 'number' && repo.status_payload.progress_pct > 0 && repo.status_payload.progress_pct < 100 && (
                    <Badge variant="outline" className="text-white/80">
                      {Math.round(repo.status_payload.progress_pct)}%
                    </Badge>
                  )}
                  {repo.last_error && statusMeta.label === 'Failed' && (
                    <Badge variant="destructive" className="text-white/90">
                      {repo.last_error.slice(0, 48)}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="relative group">
                    <Button
                      size="icon"
                      variant="destructive"
                      className="border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                      aria-label="Disconnect"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: repo.id, name: repo.name });
                      }}
                      disabled={deletingRepoId === repo.id}
                    >
                      <Trash2 className="h-4 w-4 text-red-300" />
                    </Button>
                    <span className="pointer-events-none absolute right-1/2 top-0 z-10 -translate-y-10 translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-black/90 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                      Disconnect
                    </span>
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
            setCreateError('');
            setLoadError('');
          }
        }}
      >
        <DialogContent className="max-w-2xl border-white/10 bg-black/95">
          <DialogTitle className="text-white">Add sources</DialogTitle>
          <p className="text-sm text-white/70">
            Select the sources you want to connect, then click “Add sources”. We’ll start ingesting them in the background.
          </p>
          <div className="space-y-6">
            {loadError && <p className="text-sm text-red-300">{loadError}</p>}
            {loadingSources && (
              <div className="flex items-center gap-2 text-sm text-white/70">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-label="Loading" />
                <span>Loading sources…</span>
              </div>
            )}

            <div className="space-y-3">
              <Input
                placeholder="Search sources"
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.currentTarget.value)}
                className="bg-black/50 text-white"
              />

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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
