'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Grid3x3, List, MoreVertical, RefreshCw, Loader2,
  CheckCircle2, AlertCircle, Search, Send, Github, GitBranch, ExternalLink
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DocItem {
  id: string;
  title: string;
  status: 'published' | 'pending_review';
  repo: string;
  branch: string;
  path: string;
  commit: string;
  createdAt: string;
  updatedAt: string;
  lastPushedProvider?: string;
  lastPushedAt?: string;
  lastPushedUrl?: string | null;
  processingStatus: 'processing' | 'completed' | 'failed';
  isOutdated: boolean;
  needsReview?: boolean;
  reviewId?: string | null;
  reviewCreatedAt?: string | null;
}

interface EditListPageClientProps {
  user: User | null;
}

type ViewMode = 'tile' | 'row';
type StatusFilter = 'all' | 'published';

export function EditListPageClient({ user }: EditListPageClientProps) {
  const router = useRouter();
  const supabase = createClient();

  // State
  const [items, setItems] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('row');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [repoFilter, setRepoFilter] = useState<string>('');
  const [repos, setRepos] = useState<Array<{ id: string; name: string; repo_url: string }>>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshAllMsg, setRefreshAllMsg] = useState('');
  const [refreshAllErr, setRefreshAllErr] = useState('');
  const menuRefs = useRef<Record<string, HTMLDivElement>>({});

  // Load view preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('edit-view-mode') as ViewMode | null;
    if (saved === 'tile' || saved === 'row') {
      setViewMode(saved);
    }
  }, []);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!openMenuId) return;
      const target = event.target as HTMLElement;
      const menu = menuRefs.current[openMenuId];
      const button = target.closest('button[title="More options"]');
      if (menu && !menu.contains(target) && !button) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openMenuId]);

  // Load repos for filter dropdown
  useEffect(() => {
    loadRepos();
    // Check if there's a repo filter from navigation
    const savedRepoFilter = sessionStorage.getItem('edit-repo-filter');
    if (savedRepoFilter) {
      setRepoFilter(savedRepoFilter);
      sessionStorage.removeItem('edit-repo-filter');
    }
  }, []);

  async function loadRepos() {
    try {
      const response = await fetch('/api/repos');
      if (response.ok) {
        const data = await response.json();
        setRepos(data || []);
      }
    } catch {
      // Ignore errors - repos filter is optional
    }
  }

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '20',
      });
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      if (repoFilter) {
        params.append('repo', repoFilter);
      }

      const response = await fetch(`/api/docs/list?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to load documents');
      }

      const data = await response.json();
      setItems(data.items || []);
      setTotal(data.pagination.total);
      setTotalPages(Math.ceil(data.pagination.total / data.pagination.pageSize));
      setPendingTotal(data.pendingTotal || 0);

      // Debug: Log first item to check push metadata
      if (data.items && data.items.length > 0) {
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchQuery, repoFilter, setLoading, setError, setItems, setTotal, setTotalPages, setPendingTotal]);

  function setViewModeAndSave(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem('edit-view-mode', mode);
  }

  function toggleMenu(id: string, event: React.MouseEvent) {
    event.stopPropagation();
    setOpenMenuId(openMenuId === id ? null : id);
  }

  function openDeleteModal(item: { id: string; title: string }, event: React.MouseEvent) {
    event.stopPropagation();
    setItemToDelete(item);
    setShowDeleteModal(true);
    setOpenMenuId(null);
  }

  async function confirmDelete() {
    if (!itemToDelete) return;

    const idToDelete = itemToDelete.id;
    setDeletingId(idToDelete);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/docs/${idToDelete}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete document');
      }

      setItems(items.filter(item => item.id !== idToDelete));
      setShowDeleteModal(false);
      setItemToDelete(null);
      loadDocs(); // Reload to refresh counts
    } catch (e) {
      setDeleteError(String(e));
      console.error('Delete failed:', e);
    } finally {
      setDeletingId(null);
    }
  }

  function cancelDelete() {
    setShowDeleteModal(false);
    setItemToDelete(null);
  }

  async function refreshAllOutdated() {
    setRefreshingAll(true);
    setRefreshAllMsg('');
    setRefreshAllErr('');

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        throw new Error('No authenticated user available');
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('No session token available');
      }

      const checkRes = await fetch('/api/docs/batch-check', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        }
      });

      const checkResult = await checkRes.json().catch(() => ({}));
      if (!checkRes.ok) {
        throw new Error(checkResult?.error || `Check failed (${checkRes.status})`);
      }

      const { outdated } = checkResult;

      if (outdated === 0) {
        setRefreshAllMsg('All documentation is up to date!');
        return;
      }

      const refreshRes = await fetch('/api/docs/batch-refresh', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        }
      });

      const refreshResult = await refreshRes.json().catch(() => ({}));
      if (!refreshRes.ok) {
        throw new Error(refreshResult?.error || `Refresh failed (${refreshRes.status})`);
      }

      const { refreshed, failed } = refreshResult;
      setRefreshAllMsg(`Refreshed ${refreshed} submission${refreshed === 1 ? '' : 's'}. ${failed > 0 ? `${failed} failed.` : ''}`);

      setTimeout(() => {
        loadDocs(); // Reload docs
      }, 2000);
    } catch (e) {
      setRefreshAllErr(String(e));
    } finally {
      setRefreshingAll(false);
    }
  }

  // Status badge component
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function getStatusBadge(_status: DocItem['status']) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-blue-400/30 bg-blue-500/20 px-2 py-1 text-xs text-blue-200">
        <Send className="h-3 w-3" />
        Published
      </span>
    );
  }

  // Format functions
  function fmt(iso: string): string {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  }

  function fmtRelative(iso: string | null | undefined): string {
    if (!iso) return 'Never';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) {
        console.warn('Invalid date:', iso);
        return 'Invalid date';
      }
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } catch (e) {
      console.error('Error formatting date:', iso, e);
      return 'Invalid date';
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-2xl border border-white/20 bg-white/10 p-6 text-center text-white">
          <p className="mb-4">You must be signed in to edit</p>
          <Link href="/login" className="rounded bg-white/20 px-4 py-2 hover:bg-white/30">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <Card className="border border-white/10 bg-gradient-to-b from-white/5 to-white/0 shadow-lg">
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-2xl font-semibold text-white">Documentation</CardTitle>
              <CardDescription className="text-white/70">
                Manage and review your documentation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                {items.length > 0 && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button
                      variant="secondary"
                      onClick={refreshAllOutdated}
                      disabled={refreshingAll}
                      title="Check and refresh all outdated documentation"
                    >
                      {refreshingAll ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Refreshing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          Refresh All
                        </>
                      )}
                    </Button>
                    <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-1 backdrop-blur-sm">
                      <Button
                        type="button"
                        variant={viewMode === 'tile' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-8"
                        onClick={() => setViewModeAndSave('tile')}
                        title="Tile view"
                      >
                        <Grid3x3 className="h-4 w-4" />
                        <span className="hidden sm:inline">Tile</span>
                      </Button>
                      <Button
                        type="button"
                        variant={viewMode === 'row' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-8"
                        onClick={() => setViewModeAndSave('row')}
                        title="Row view"
                      >
                        <List className="h-4 w-4" />
                        <span className="hidden sm:inline">Row</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {pendingTotal > 0 && (
                <Alert>
                  <AlertDescription>
                    <span className="font-medium text-white">Review needed:</span>{' '}
                    {pendingTotal} document{pendingTotal === 1 ? '' : 's'} have automated updates waiting for approval.
                  </AlertDescription>
                </Alert>
              )}

              {/* Filters */}
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-medium text-white">Filters</Label>
                  <p className="text-sm text-white/60">Filter and search your documentation.</p>
                </div>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  {/* Status filter chips */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={statusFilter === 'all' ? 'default' : 'secondary'}
                      size="sm"
                      onClick={() => {
                        setStatusFilter('all');
                        setPage(1);
                      }}
                    >
                      All
                    </Button>
                    <Button
                      type="button"
                      variant={statusFilter === 'published' ? 'default' : 'secondary'}
                      size="sm"
                      onClick={() => {
                        setStatusFilter('published');
                        setPage(1);
                      }}
                    >
                      Published
                    </Button>
                  </div>

                  {/* Repo Filter */}
                  {repos.length > 0 && (
                    <Select
                      value={repoFilter || 'all'}
                      onValueChange={(value) => {
                        setRepoFilter(value === 'all' ? '' : value);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="All Repositories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Repositories</SelectItem>
                        {repos.map((repo) => (
                          <SelectItem key={repo.id} value={repo.repo_url}>
                            {repo.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Search */}
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                    <Input
                      type="text"
                      placeholder="Search by title, repo, or path..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(1);
                      }}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              {(error || refreshAllMsg || refreshAllErr || deleteError) && (
                <div className="space-y-2">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  {refreshAllMsg && (
                    <Alert variant="success">
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>{refreshAllMsg}</AlertDescription>
                    </Alert>
                  )}
                  {refreshAllErr && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>Error refreshing: {refreshAllErr}</AlertDescription>
                    </Alert>
                  )}
                  {deleteError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>Error deleting document: {deleteError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Content */}
          {loading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-white/50" />
                <span className="ml-3 text-white/60">Loading documents...</span>
              </CardContent>
            </Card>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="mb-4 text-white/80">No documents found.</p>
                <Button asChild>
                  <Link href="/documentation">Create your first document</Link>
                </Button>
              </CardContent>
            </Card>
          ) : viewMode === 'row' ? (
            <>
              {/* Table view - enhanced with new columns */}
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                <table className="w-full">
                  <thead className="border-b border-white/10 bg-white/5">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Title</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Repo</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Last Updated</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-white/90">Last Pushed</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-white/90">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className="cursor-pointer transition-all hover:bg-white/15 hover:shadow-lg hover:shadow-white/5"
                        onClick={() => router.push(`/edit/${item.id}`)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-white">{item.title}</div>
                          {item.repo && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                              <div className="flex items-center gap-1 font-mono">
                                <Github className="h-3 w-3" />
                                <span className="truncate max-w-md">{item.repo.replace('https://github.com/', '')}</span>
                              </div>
                              {item.branch && (
                                <div className="flex items-center gap-1">
                                  <GitBranch className="h-3 w-3" />
                                  <span className="font-mono">{item.branch}</span>
                                </div>
                              )}
                              {item.path !== '/' && (
                                <span className="text-white/40">{item.path}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(item.status)}
                          {item.needsReview && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded border border-purple-400/30 bg-purple-500/20 px-2 py-1 text-xs text-purple-200">
                              <AlertCircle className="h-3 w-3" />
                              Needs review
                            </span>
                          )}
                          {item.isOutdated && (
                            <span className="ml-2 inline-flex items-center gap-1 text-xs text-orange-300">
                              <AlertCircle className="h-3 w-3" />
                              Outdated
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/70">
                          {item.repo ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 font-mono text-xs">
                                <Github className="h-3 w-3 text-white/40" />
                                <span className="truncate max-w-xs">{item.repo.replace('https://github.com/', '')}</span>
                              </div>
                              {item.branch && (
                                <div className="flex items-center gap-1 text-xs text-white/50">
                                  <GitBranch className="h-3 w-3" />
                                  <span>{item.branch}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-white/40">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/70">
                          {fmtRelative(item.updatedAt)}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/70">
                          {item.lastPushedProvider ? (
                            <div>
                              {item.lastPushedUrl ? (
                                <a
                                  href={item.lastPushedUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-300 hover:text-blue-200 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Send className="h-3 w-3" />
                                  <span className="capitalize">{item.lastPushedProvider}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Send className="h-3 w-3" />
                                  <span className="capitalize">{item.lastPushedProvider}</span>
                                </div>
                              )}
                              {item.lastPushedAt ? (
                                <div className="text-xs text-white/50 mt-1">
                                  {fmtRelative(item.lastPushedAt)}
                                </div>
                              ) : (
                                <div className="text-xs text-white/40 mt-1">No date</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-white/40">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMenu(item.id, e);
                            }}
                            title="More options"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                          {openMenuId === item.id && (
                            <div
                              ref={(el) => {
                                if (el) menuRefs.current[item.id] = el;
                              }}
                              className="absolute right-4 z-[100] mt-1 min-w-[160px] rounded-lg border border-white/20 bg-black/95 p-1 shadow-xl backdrop-blur-md"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.needsReview && (
                                <Link
                                  href={`/review/${item.id}`}
                                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-purple-200 transition-colors hover:bg-purple-500/10"
                                  onClick={() => setOpenMenuId(null)}
                                >
                                  Review Update
                                </Link>
                              )}
                              <Link
                                href={`/edit/${item.id}`}
                                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/90 transition-colors hover:bg-white/10"
                                onClick={() => setOpenMenuId(null)}
                              >
                                Open Editor
                              </Link>
                              <Button
                                type="button"
                                variant="ghost"
                                className="edit-menu-button flex w-full items-center gap-2 justify-start rounded-md px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                                onClick={(e) => openDeleteModal(item, e)}
                              >
                                Delete
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </CardContent>
              </Card>

              {/* Pagination */}
              {totalPages > 1 && (
                <Card>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="text-sm text-white/70">
                      Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, total)} of {total} documents
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-white/70">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {items.map(item => (
                <Card
                  key={item.id}
                  className={`cursor-pointer transition-all hover:shadow-lg ${openMenuId === item.id ? 'relative z-[9999]' : ''}`}
                  onClick={() => router.push(`/edit/${item.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/edit/${item.id}`);
                    }
                  }}
                >
                  <CardContent className="p-5">
                  <div className="mb-3">
                    <div className="mb-2 truncate text-lg font-semibold text-white">{item.title}</div>
                    <div className="mb-1 text-sm text-white/60">{fmt(item.createdAt)}</div>
                    {item.repo && (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-1 truncate font-mono text-xs text-white/50">
                          <Github className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{item.repo.replace('https://github.com/', '')}</span>
                        </div>
                        {item.branch && (
                          <div className="flex items-center gap-1 text-xs text-white/40">
                            <GitBranch className="h-3 w-3 flex-shrink-0" />
                            <span>{item.branch}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {getStatusBadge(item.status)}
                      {item.needsReview && (
                        <span className="inline-flex items-center gap-1 rounded border border-purple-400/30 bg-purple-500/20 px-2 py-0.5 text-xs text-purple-200">
                          <AlertCircle className="h-3 w-3" />
                          Needs review
                        </span>
                      )}
                      {item.isOutdated && (
                        <span className="inline-flex items-center gap-1 rounded border border-orange-400/30 bg-orange-500/20 px-2 py-0.5 text-xs text-orange-200">
                          <AlertCircle className="h-3 w-3" />
                          Outdated
                        </span>
                      )}
                      {item.lastPushedProvider && (
                        item.lastPushedUrl ? (
                          <a
                            href={item.lastPushedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-blue-400/30 bg-blue-500/20 px-2 py-0.5 text-xs text-blue-200 hover:bg-blue-500/30 hover:border-blue-400/50 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Send className="h-3 w-3" />
                            {item.lastPushedProvider}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded border border-blue-400/30 bg-blue-500/20 px-2 py-0.5 text-xs text-blue-200">
                            <Send className="h-3 w-3" />
                            {item.lastPushedProvider}
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                    <div className="text-xs text-white/50">
                      Updated {fmtRelative(item.updatedAt)}
                    </div>
                    <div className="relative">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMenu(item.id, e);
                        }}
                        title="More options"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                      {openMenuId === item.id && (
                        <div
                          ref={(el) => {
                            if (el) menuRefs.current[item.id] = el;
                          }}
                          className="absolute right-0 top-full z-[100] mt-1 min-w-[160px] rounded-lg border border-white/20 bg-black/95 p-1 shadow-xl backdrop-blur-md"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.needsReview && (
                            <Link
                              href={`/review/${item.id}`}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-purple-200 transition-colors hover:bg-purple-500/10"
                              onClick={() => setOpenMenuId(null)}
                            >
                              Review Update
                            </Link>
                          )}
                          <Link
                            href={`/edit/${item.id}`}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/90 transition-colors hover:bg-white/10"
                            onClick={() => setOpenMenuId(null)}
                          >
                            Open Editor
                          </Link>
                          <Button
                            type="button"
                            variant="ghost"
                            className="edit-menu-button flex w-full items-center gap-2 justify-start rounded-md px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                            onClick={(e) => openDeleteModal(item, e)}
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={(open) => !open && cancelDelete()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold">&quot;{itemToDelete?.title}&quot;</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={cancelDelete}
              disabled={deletingId !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={deletingId !== null}
            >
              {deletingId === itemToDelete?.id ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
