'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Github,
  Layers,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RepositoryConnectionWizard } from '@/components/RepositoryConnectionWizard';

interface Repository {
  id: string;
  name: string;
  repo_url: string;
  default_branch: string;
  provider?: string;
  settings?: any;
  setup_status?: string | null;
  setup_branch?: string;
  file_summary_status?: 'complete' | 'partial' | 'none';
  file_summary_count?: number;
  total_files?: number;
  created_at: string;
  updated_at: string;
}

interface RepositoriesPageClientProps {
  repositories: Repository[];
}

type StatusFilter = 'all' | 'ready' | 'processing' | 'failed' | 'not_started';
type SourceKey = 'github' | 'jira';

type SourceOption = {
  key: SourceKey;
  label: string;
  description: string;
  helper: string;
  icon: typeof Github;
  onSelect: () => void;
};

export default function RepositoriesPageClient({ repositories }: RepositoriesPageClientProps) {
  const router = useRouter();
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [sourceMode, setSourceMode] = useState<'select' | SourceKey>('select');
  const [deletingRepoId, setDeletingRepoId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [jiraProjects, setJiraProjects] = useState<Array<{ id: string; key: string; name: string }>>([]);
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState('');
  const [jiraWarning, setJiraWarning] = useState('');
  const [jiraSites, setJiraSites] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [jiraSitesLoading, setJiraSitesLoading] = useState(false);
  const [jiraSitesError, setJiraSitesError] = useState('');
  const [jiraCloudId, setJiraCloudId] = useState('');
  const [jiraSiteUrl, setJiraSiteUrl] = useState('');
  const [jiraSiteName, setJiraSiteName] = useState('');
  const [jiraProjectKey, setJiraProjectKey] = useState('');
  const [jiraName, setJiraName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Redirect to ongoing setup if found
  useEffect(() => {
    const checkOngoingSetups = async () => {
      for (const repo of repositories) {
        if (repo.setup_status === 'analyzing') {
          try {
            const response = await fetch(`/api/repos/setup?repoId=${repo.id}`);
            const data = await response.json();
            if (response.ok && data.setup?.setup_status === 'analyzing') {
              router.push(`/repos/setup?repoId=${repo.id}`);
              break;
            }
          } catch (error) {
            console.error('Error checking setup status:', error);
          }
        }
      }
    };
    if (repositories.length > 0) checkOngoingSetups();
  }, [repositories, router]);

  const handleConnectRepository = () => {
    setSourceMode('select');
    setShowSourceDialog(true);
  };

  const handleConnectionComplete = (repoId: string) => {
    setShowSourceDialog(false);
    router.push(`/repos/setup?repoId=${repoId}`);
  };

  const handleJiraCreated = (repoId: string) => {
    setShowSourceDialog(false);
    setJiraProjectKey('');
    setJiraName('');
    setJiraCloudId('');
    setJiraSiteUrl('');
    setJiraSiteName('');
    router.push(`/repos/setup?repoId=${repoId}`);
  };

  const sourceOptions = useMemo<SourceOption[]>(() => ([
    {
      key: 'github',
      label: 'GitHub',
      description: 'Connect repositories and index code.',
      helper: 'Best for codebases and PR-driven updates.',
      icon: Github,
      onSelect: () => setSourceMode('github'),
    },
    {
      key: 'jira',
      label: 'Jira',
      description: 'Connect projects and index tickets.',
      helper: 'Best for product and delivery activity.',
      icon: Activity,
      onSelect: () => {
        setSourceMode('jira');
        loadJiraSites();
      },
    },
  ]), [loadJiraSites]);

  const sourceTitle = sourceMode === 'select'
    ? 'Add Source'
    : `Add ${sourceOptions.find((option) => option.key === sourceMode)?.label ?? 'Source'} Source`;

  const handleDeleteRepository = async (repoId: string, repoName: string) => {
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
    const ready = repositories.filter((r) => r.setup_status === 'ready').length;
    const processing = repositories.filter((r) => r.setup_status === 'analyzing').length;
    const failed = repositories.filter((r) => r.setup_status === 'failed').length;
    const notStarted = repositories.filter((r) => !r.setup_status || r.setup_status === 'pending').length;
    return { total: repositories.length, ready, processing, failed, notStarted };
  }, [repositories]);

  const filteredRepos = useMemo(() => {
    return repositories.filter((repo) => {
      const term = searchQuery.toLowerCase();
      const matchesSearch =
        !term ||
        repo.name.toLowerCase().includes(term) ||
        repo.repo_url.toLowerCase().includes(term);

      const status =
        repo.setup_status === 'ready'
          ? 'ready'
          : repo.setup_status === 'analyzing'
            ? 'processing'
            : repo.setup_status === 'failed'
              ? 'failed'
              : 'not_started';

      const matchesStatus = statusFilter === 'all' || statusFilter === status;
      return matchesSearch && matchesStatus;
    });
  }, [repositories, searchQuery, statusFilter]);

  const getStatusMeta = (repo: Repository) => {
    if (repo.setup_status === 'ready') {
      return { label: 'Connected', color: 'success', tone: 'text-emerald-200', icon: <CheckCircle2 className="h-4 w-4" /> };
    }
    if (repo.setup_status === 'analyzing') {
      return { label: 'Processing', color: 'default', tone: 'text-blue-200', icon: <Clock className="h-4 w-4" /> };
    }
    if (repo.setup_status === 'failed') {
      return { label: 'Failed', color: 'destructive', tone: 'text-red-200', icon: <AlertTriangle className="h-4 w-4" /> };
    }
    return { label: 'Not started', color: 'outline', tone: 'text-white/70', icon: <Activity className="h-4 w-4" /> };
  };

  async function loadJiraSites() {
    if (jiraSitesLoading) return;
    setJiraSitesLoading(true);
    setJiraSitesError('');
    try {
      const response = await fetch('/api/jira/sites');
      const data = await response.json();
      if (!response.ok) {
        const detail = data.error || data.detail || 'Failed to load Jira workspaces';
        throw new Error(detail);
      }
      const sites: Array<{ id: string; name: string; url: string }> = Array.isArray(data.sites)
        ? (data.sites as Array<{ id: string; name: string; url: string }>)
        : [];

      // Deduplicate by id as a safeguard (server should already do this)
      const uniqueSitesMap = new Map<string, { id: string; name: string; url: string }>();
      for (const site of sites) {
        if (!uniqueSitesMap.has(site.id)) {
          uniqueSitesMap.set(site.id, site);
        }
      }
      const uniqueSites = Array.from(uniqueSitesMap.values());

      setJiraSites(uniqueSites);
      if (uniqueSites.length === 1) {
        selectJiraSite(uniqueSites[0]);
      }
    } catch (err: any) {
      setJiraSitesError(err.message || 'Failed to load Jira workspaces');
    } finally {
      setJiraSitesLoading(false);
    }
  }

  async function selectJiraSite(site: { id: string; name: string; url: string }) {
    setJiraCloudId(site.id);
    setJiraSiteUrl(site.url);
    setJiraSiteName(site.name);
    setJiraProjects([]);
    setJiraProjectKey('');
    setJiraWarning('');
    setJiraError('');
    await fetch('/api/jira/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cloudId: site.id,
        siteUrl: site.url,
        siteName: site.name,
      }),
    }).catch(() => { });
    await loadJiraProjects(site.id);
  }

  async function loadJiraProjects(cloudId?: string) {
    if (jiraLoading) return;
    setJiraLoading(true);
    setJiraError('');
    setJiraWarning('');
    try {
      if (!cloudId) {
        throw new Error('Select a Jira workspace to load projects.');
      }
      const response = await fetch(`/api/jira/projects?cloudId=${encodeURIComponent(cloudId)}`);
      const data = await response.json();
      if (!response.ok) {
        const detail = data.error || data.detail || 'Failed to load Jira projects';
        throw new Error(`${detail}. Make sure Confluence is connected with read:jira-work and Jira is enabled for this site.`);
      }
      const projects = Array.isArray(data.projects) ? data.projects : [];
      setJiraProjects(projects);
      if (typeof data.warning === 'string' && data.warning.trim()) {
        setJiraWarning(data.warning.trim());
      }
    } catch (err: any) {
      setJiraError(err.message || 'Failed to load Jira projects');
    } finally {
      setJiraLoading(false);
    }
  }

  async function createJiraSource() {
    try {
      setJiraError('');
      if (!jiraCloudId) {
        throw new Error('Select a Jira workspace before creating a source.');
      }
      const response = await fetch('/api/jira/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectKey: jiraProjectKey || undefined,
          name: jiraName || undefined,
          cloudId: jiraCloudId,
          siteUrl: jiraSiteUrl || undefined,
          siteName: jiraSiteName || undefined,
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.detail || 'Failed to create Jira source');
      }
      handleJiraCreated(data.id);
    } catch (err: any) {
      setJiraError(err.message || 'Failed to create Jira source');
    }
  }

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
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="not_started">Not started</SelectItem>
              </SelectContent>
            </Select>
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
            const isJira = repo.provider === 'jira';
            const sourceLabel = isJira
              ? (repo.settings?.jira_project_key || repo.name)
              : repo.repo_url.replace('https://github.com/', '');
            const sourceLink = repo.repo_url.startsWith('http') ? repo.repo_url : null;

            return (
              <div key={repo.id} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-white/5 to-black/60 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/20">
                    {isJira ? <Activity className="h-5 w-5" /> : <Github className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="text-base font-semibold text-white">{repo.name}</div>
                    <div className="flex items-center gap-2 text-sm text-white/70">
                      <span>{sourceLabel}</span>
                      {sourceLink && (
                        <Link href={sourceLink} target="_blank" rel="noreferrer" className="text-white/50 hover:text-white/80">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusMeta.color as any} className="flex items-center gap-1">
                    {statusMeta.icon}
                    {statusMeta.label}
                  </Badge>
                  <Badge variant="outline" className="text-white/80">
                    {isJira
                      ? `Scope: ${repo.settings?.jira_project_key || 'Jira'}`
                      : `Branch: ${repo.setup_branch || repo.default_branch || 'main'}`}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="relative group">
                    <Button size="icon" variant="secondary" asChild>
                      <Link href={`/repos/setup?repoId=${repo.id}`} aria-label="Setup">
                        <Settings className="h-4 w-4" />
                      </Link>
                    </Button>
                    <span className="pointer-events-none absolute right-1/2 top-0 z-10 -translate-y-10 translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-black/90 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                      Setup
                    </span>
                  </div>
                  <div className="relative group">
                    <Button
                      size="icon"
                      variant="secondary"
                      disabled={repo.setup_status !== 'ready' || isJira}
                      asChild
                    >
                      <Link href={`/documentation?repoId=${repo.id}`} aria-label="Generate Docs">
                        <FileText className="h-4 w-4" />
                      </Link>
                    </Button>
                    <span className="pointer-events-none absolute right-1/2 top-0 z-10 -translate-y-10 translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-black/90 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                      Generate Docs
                    </span>
                  </div>
                  <div className="relative group">
                    <Button size="icon" variant="secondary" asChild>
                      <Link href="/automation" aria-label="Automation">
                        <Zap className="h-4 w-4" />
                      </Link>
                    </Button>
                    <span className="pointer-events-none absolute right-1/2 top-0 z-10 -translate-y-10 translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-black/90 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                      Automation
                    </span>
                  </div>
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
          if (!open) setSourceMode('select');
        }}
      >
        <DialogContent className={sourceMode === 'github' ? 'p-0' : 'max-w-2xl border-white/10 bg-black/95'}>
          <DialogTitle className="sr-only">{sourceTitle}</DialogTitle>

          {sourceMode === 'select' && (
            <div className="space-y-6 p-6">
              <div>
                <h3 className="text-xl font-semibold text-white">Choose a source to connect</h3>
                <p className="text-sm text-white/60">Pick the system you want to index for updates.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {sourceOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={option.onSelect}
                      className="rounded-xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-white/30 hover:bg-white/10"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10">
                            <Icon className="h-6 w-6 text-white" />
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-white">{option.label}</p>
                            <p className="text-sm text-white/60">{option.description}</p>
                          </div>
                        </div>
                      </div>
                      <p className="mt-4 text-xs text-white/50">{option.helper}</p>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => setShowSourceDialog(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {sourceMode === 'github' && (
            <RepositoryConnectionWizard
              onComplete={handleConnectionComplete}
              onCancel={() => setShowSourceDialog(false)}
            />
          )}

          {sourceMode === 'jira' && (
            <div className="space-y-4 p-6">
              <div className="space-y-2">
                <label className="text-sm text-white/80">Workspace</label>
                <select
                  value={jiraCloudId}
                  onChange={(e) => {
                    const selected = jiraSites.find((site) => site.id === e.target.value);
                    if (selected) void selectJiraSite(selected);
                  }}
                  className="w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                >
                  <option value="">Select a Jira workspace</option>
                  {jiraSites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name || site.url}
                    </option>
                  ))}
                </select>
                {jiraSitesLoading && <p className="text-xs text-white/60">Loading Jira workspaces…</p>}
                {jiraSitesError && <p className="text-xs text-red-300">{jiraSitesError}</p>}
                {jiraWarning && !jiraSitesError && (
                  <p className="text-xs text-amber-200">{jiraWarning}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm text-white/80">Project</label>
                <select
                  value={jiraProjectKey}
                  onChange={(e) => setJiraProjectKey(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                >
                  <option value="">Select a Jira project</option>
                  {jiraProjects.map((project) => (
                    <option key={project.key} value={project.key}>
                      {project.key} — {project.name}
                    </option>
                  ))}
                </select>
                {jiraLoading && <p className="text-xs text-white/60">Loading Jira projects…</p>}
                {!jiraLoading && jiraProjects.length === 0 && !jiraError && jiraCloudId && (
                  <p className="text-xs text-white/50">
                    No Jira projects found. Reconnect Confluence with the Jira scope enabled.
                  </p>
                )}
                {!jiraLoading && !jiraCloudId && !jiraError && (
                  <p className="text-xs text-white/50">
                    Select a Jira workspace to load projects.
                  </p>
                )}
              </div>

              {jiraError && (
                <Alert variant="destructive">
                  <AlertDescription>{jiraError}</AlertDescription>
                </Alert>
              )}
              {jiraWarning && !jiraError && (
                <Alert>
                  <AlertDescription>{jiraWarning}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-between gap-2">
                <Button variant="secondary" onClick={() => setSourceMode('select')}>
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setShowSourceDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createJiraSource} disabled={!jiraProjectKey || !jiraCloudId}>
                    Create Source
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
