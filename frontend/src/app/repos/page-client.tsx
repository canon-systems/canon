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
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RepositoryConnectionWizard } from '@/components/RepositoryConnectionWizard';

interface Repository {
  id: string;
  name: string;
  repo_url: string;
  default_branch: string;
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

export default function RepositoriesPageClient({ repositories }: RepositoriesPageClientProps) {
  const router = useRouter();
  const [showConnectionWizard, setShowConnectionWizard] = useState(false);
  const [deletingRepoId, setDeletingRepoId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleConnectRepository = () => setShowConnectionWizard(true);

  const handleConnectionComplete = (repoId: string) => {
    setShowConnectionWizard(false);
    router.push(`/repos/setup?repoId=${repoId}`);
  };

  const handleDeleteRepository = async (repoId: string, repoName: string) => {
    if (!confirm(`Disconnect ${repoName}? This will remove associated data and documents.`)) {
      return;
    }
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

  return (
    <div className="space-y-8 px-1 sm:px-2 md:px-0">
      <Card className="overflow-hidden border-white/10 bg-gradient-to-r from-indigo-900/40 via-slate-900/60 to-cyan-900/40 px-1 sm:px-2 md:px-0">
        <CardHeader className="p-8 pb-4 md:p-10 md:pb-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <Badge variant="default" className="bg-white/10 text-white/80">
                GitHub Repositories
              </Badge>
              <CardTitle className="text-3xl text-white">Connect, analyze, and automate</CardTitle>
              <CardDescription className="text-white/70">
                Link repos, track setup progress, and jump straight into documentation or automation.
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
              placeholder="Search by name or repo URL"
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
              Connect
            </Button>
          </div>
        </CardContent>
      </Card>

      {filteredRepos.length === 0 ? (
        <Card className="border-white/10 bg-white/5 p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
            <Github className="h-6 w-6 text-white/70" />
          </div>
          <CardTitle className="mt-4 text-xl text-white">No repositories match that view</CardTitle>
          <CardDescription className="mt-2 text-white/70">
            Try adjusting filters or connect a new repository.
          </CardDescription>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={handleConnectRepository}>
              <Plus className="h-4 w-4" />
              Connect repository
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/documentation">
                <FileText className="h-4 w-4" />
                Generate docs
              </Link>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 px-1 sm:px-2 md:px-0">
          {filteredRepos.map((repo) => {
            const statusMeta = getStatusMeta(repo);
            const hasSummaries = repo.setup_status === 'ready' && repo.total_files && repo.total_files > 0;
            const summaryProgress = hasSummaries
              ? Math.min(
                  100,
                  Math.round(((repo.file_summary_count || 0) / (repo.total_files || 1)) * 100)
                )
              : 0;

            return (
              <Card key={repo.id} className="border-white/10 bg-gradient-to-b from-white/8 to-black/60">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/20">
                        <Github className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-white">{repo.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2 text-white/70">
                          {repo.repo_url.replace('https://github.com/', '')}
                          <Link href={repo.repo_url} target="_blank" rel="noreferrer" className="text-white/50 hover:text-white/80">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </CardDescription>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full border border-white/10 bg-white/5">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/repos/setup?repoId=${repo.id}`}>
                            <Settings className="mr-2 h-4 w-4" />
                            Setup
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild disabled={repo.setup_status !== 'ready'}>
                          <Link href={`/documentation?repoId=${repo.id}`}>
                            <FileText className="mr-2 h-4 w-4" />
                            Generate Docs
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/automation">
                            <Zap className="mr-2 h-4 w-4" />
                            Automation
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-300 focus:bg-red-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRepository(repo.id, repo.name);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Disconnect
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusMeta.color as any} className="flex items-center gap-1">
                      {statusMeta.icon}
                      {statusMeta.label}
                    </Badge>
                    <Badge variant="outline" className="text-white/80">
                      Branch: {repo.setup_branch || repo.default_branch || 'main'}
                    </Badge>
                    {repo.setup_status === 'ready' && (
                      <Badge variant="success" className="text-emerald-200">
                        Summaries: {repo.file_summary_count || 0}/{repo.total_files || 0}
                      </Badge>
                    )}
                  </div>

                  {hasSummaries && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-white/70">
                        <span>File summaries</span>
                        <span>{summaryProgress}%</span>
                      </div>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="flex flex-wrap justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" asChild>
                      <Link href={`/repos/setup?repoId=${repo.id}`}>
                        <Settings className="h-4 w-4" />
                        Setup
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={repo.setup_status !== 'ready'}
                      asChild
                    >
                      <Link href={`/documentation?repoId=${repo.id}`}>
                        <FileText className="h-4 w-4" />
                        Generate docs
                      </Link>
                    </Button>
                    <Button variant="secondary" asChild>
                      <Link href="/automation">
                        <Zap className="h-4 w-4" />
                        Automation
                      </Link>
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    className="text-red-300 hover:text-red-200"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRepository(repo.id, repo.name);
                    }}
                    disabled={deletingRepoId === repo.id}
                  >
                    <Trash2 className="h-4 w-4" />
                    Disconnect
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}


      <Dialog open={showConnectionWizard} onOpenChange={setShowConnectionWizard}>
        <DialogContent className="p-0">
          <RepositoryConnectionWizard
            onComplete={handleConnectionComplete}
            onCancel={() => setShowConnectionWizard(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
