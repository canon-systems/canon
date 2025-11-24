'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Grid3x3, List, MoreVertical, RefreshCw, Loader2, Clock,
  CheckCircle2, AlertCircle, X, Search, Send, FileText, Filter
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface DocItem {
  id: string;
  title: string;
  status: 'pending_review' | 'approved' | 'published' | 'rejected';
  repo: string;
  path: string;
  commit: string;
  createdAt: string;
  updatedAt: string;
  lastPushedProvider?: string;
  lastPushedAt?: string;
  processingStatus: 'processing' | 'completed' | 'failed';
  isOutdated: boolean;
}

interface EditListPageClientProps {
  user: User | null;
}

type ViewMode = 'tile' | 'row';
type ApprovalStatusFilter = 'all' | 'pending_review' | 'approved' | 'published' | 'rejected';

export function EditListPageClient({ user }: EditListPageClientProps) {
  const router = useRouter();
  const supabase = createClient();

  // State
  const [items, setItems] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('row');
  const [statusFilter, setStatusFilter] = useState<ApprovalStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [repoFilter, setRepoFilter] = useState<string>('');
  const [repos, setRepos] = useState<Array<{ id: string; name: string; repo_url: string }>>([]);
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

  // Load docs from API
  useEffect(() => {
    loadDocs();
  }, [statusFilter, searchQuery, repoFilter, page]);

  async function loadRepos() {
    try {
      const response = await fetch('/api/repos');
      if (response.ok) {
        const data = await response.json();
        setRepos(data || []);
      }
    } catch (err) {
      // Ignore errors - repos filter is optional
    }
  }

  async function loadDocs() {
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

      // Debug: Log first item to check push metadata
      if (data.items && data.items.length > 0) {
        console.log('Sample item:', data.items[0]);
        console.log('Last pushed:', data.items[0].lastPushedProvider, data.items[0].lastPushedAt);
      }

      // Load pending count separately
      loadPendingCount();
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingCount() {
    try {
      const response = await fetch('/api/docs/list?status=pending_review&pageSize=1');
      if (response.ok) {
        const data = await response.json();
        setPendingCount(data.pagination.total);
      }
    } catch (err) {
      // Ignore errors for pending count
    }
  }

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
      const { error } = await supabase.from('submissions').delete().eq('id', idToDelete);

      if (error) throw error;

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
  function getStatusBadge(status: DocItem['status']) {
    const badges = {
      pending_review: (
        <span className="inline-flex items-center gap-1 rounded border border-yellow-400/30 bg-yellow-500/20 px-2 py-1 text-xs text-yellow-200">
          Pending Review
        </span>
      ),
      approved: (
        <span className="inline-flex items-center gap-1 rounded border border-green-400/30 bg-green-500/20 px-2 py-1 text-xs text-green-200">
          <CheckCircle2 className="h-3 w-3" />
          Approved
        </span>
      ),
      published: (
        <span className="inline-flex items-center gap-1 rounded border border-blue-400/30 bg-blue-500/20 px-2 py-1 text-xs text-blue-200">
          <Send className="h-3 w-3" />
          Published
        </span>
      ),
      rejected: (
        <span className="inline-flex items-center gap-1 rounded border border-red-400/30 bg-red-500/20 px-2 py-1 text-xs text-red-200">
          Rejected
        </span>
      ),
    };
    return badges[status] || badges.pending_review;
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
          <header className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-white">Documentation Dashboard</h1>
                <p className="text-white/70">
                  Manage and review your documentation.{' '}
                  {pendingCount > 0 && (
                    <span className="font-semibold text-yellow-300">
                      {pendingCount} pending review
                    </span>
                  )}
                </p>
              </div>
              {items.length > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/90 transition-colors hover:bg-white/20 disabled:opacity-60"
                    onClick={refreshAllOutdated}
                    disabled={refreshingAll}
                    title="Check and refresh all outdated documentation"
                  >
                    {refreshingAll ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Refreshing...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        <span>Refresh All</span>
                      </>
                    )}
                  </button>
                  <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 p-1 backdrop-blur-sm">
                    <button
                      type="button"
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${viewMode === 'tile'
                        ? 'bg-white/20 text-white'
                        : 'text-white/70'
                        }`}
                      onClick={() => setViewModeAndSave('tile')}
                      title="Tile view"
                    >
                      <Grid3x3 className="h-4 w-4" />
                      <span className="hidden sm:inline">Tile</span>
                    </button>
                    <button
                      type="button"
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${viewMode === 'row'
                        ? 'bg-white/20 text-white'
                        : 'text-white/70'
                        }`}
                      onClick={() => setViewModeAndSave('row')}
                      title="Row view"
                    >
                      <List className="h-4 w-4" />
                      <span className="hidden sm:inline">Row</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Status filter chips */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setStatusFilter('all');
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${statusFilter === 'all'
                    ? 'bg-purple-500/30 text-purple-200 border border-purple-500/50 shadow-lg shadow-purple-500/20'
                    : 'bg-white/10 text-white/70 border border-white/20 hover:bg-white/20 hover:border-white/30 hover:shadow-md'
                    }`}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setStatusFilter('pending_review');
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${statusFilter === 'pending_review'
                    ? 'bg-yellow-500/30 text-yellow-200 border border-yellow-500/50 shadow-lg shadow-yellow-500/20'
                    : 'bg-white/10 text-white/70 border border-white/20 hover:bg-white/20 hover:border-white/30 hover:shadow-md'
                    }`}
                >
                  Pending Review {pendingCount > 0 && `(${pendingCount})`}
                </button>
                <button
                  onClick={() => {
                    setStatusFilter('approved');
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${statusFilter === 'approved'
                    ? 'bg-green-500/30 text-green-200 border border-green-500/50 shadow-lg shadow-green-500/20'
                    : 'bg-white/10 text-white/70 border border-white/20 hover:bg-white/20 hover:border-white/30 hover:shadow-md'
                    }`}
                >
                  Approved
                </button>
                <button
                  onClick={() => {
                    setStatusFilter('published');
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${statusFilter === 'published'
                    ? 'bg-blue-500/30 text-blue-200 border border-blue-500/50 shadow-lg shadow-blue-500/20'
                    : 'bg-white/10 text-white/70 border border-white/20 hover:bg-white/20 hover:border-white/30 hover:shadow-md'
                    }`}
                >
                  Published
                </button>
                <button
                  onClick={() => {
                    setStatusFilter('rejected');
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${statusFilter === 'rejected'
                    ? 'bg-red-500/30 text-red-200 border border-red-500/50 shadow-lg shadow-red-500/20'
                    : 'bg-white/10 text-white/70 border border-white/20 hover:bg-white/20 hover:border-white/30 hover:shadow-md'
                    }`}
                >
                  Rejected
                </button>
              </div>

              {/* Repo Filter */}
              {repos.length > 0 && (
                <select
                  value={repoFilter}
                  onChange={(e) => {
                    setRepoFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                >
                  <option value="">All Repositories</option>
                  {repos.map((repo) => (
                    <option key={repo.id} value={repo.repo_url}>
                      {repo.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                <input
                  type="text"
                  placeholder="Search by title, repo, or path..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1); // Reset to first page on search
                  }}
                  className="w-full rounded-lg border border-white/20 bg-white/10 pl-10 pr-4 py-2 text-white placeholder-white/60 outline-none focus:border-white/40"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
                {error}
              </div>
            )}
            {refreshAllMsg && (
              <div className="rounded-xl border border-green-400/30 bg-green-500/10 px-3 py-2 text-green-200">
                {refreshAllMsg}
              </div>
            )}
            {refreshAllErr && (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
                Error refreshing: {refreshAllErr}
              </div>
            )}
            {deleteError && (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
                Error deleting document: {deleteError}
              </div>
            )}
          </header>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-white/50" />
              <span className="ml-3 text-white/60">Loading documents...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-white/20 bg-white/10 p-6 text-center text-white/80">
              <p className="mb-3">No documents found.</p>
              <Link
                href="/documentation"
                className="inline-block rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-white hover:from-purple-600 hover:to-pink-600"
              >
                Create your first document
              </Link>
            </div>
          ) : viewMode === 'row' ? (
            <>
              {/* Table view - enhanced with new columns */}
              <div className="rounded-2xl border border-white/20 bg-white/10 overflow-hidden">
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
                            <div className="text-xs text-white/50 font-mono truncate max-w-md">
                              {item.repo}{item.path !== '/' ? item.path : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(item.status)}
                          {item.isOutdated && (
                            <span className="ml-2 inline-flex items-center gap-1 text-xs text-orange-300">
                              <AlertCircle className="h-3 w-3" />
                              Outdated
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/70">
                          {item.repo ? (
                            <span className="font-mono text-xs">{item.repo}</span>
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
                              <div className="flex items-center gap-1">
                                <Send className="h-3 w-3" />
                                <span className="capitalize">{item.lastPushedProvider}</span>
                              </div>
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
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMenu(item.id, e);
                            }}
                            className="rounded-lg border border-white/20 bg-white/5 p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                            title="More options"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openMenuId === item.id && (
                            <div
                              ref={(el) => {
                                if (el) menuRefs.current[item.id] = el;
                              }}
                              className="absolute right-4 z-[100] mt-1 min-w-[160px] rounded-lg border border-white/20 bg-black/95 p-1 shadow-xl backdrop-blur-md"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link
                                href={`/edit/${item.id}`}
                                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/90 transition-colors hover:bg-white/10"
                                onClick={() => setOpenMenuId(null)}
                              >
                                Open Editor
                              </Link>
                              <button
                                type="button"
                                className="edit-menu-button flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-400 transition-colors border-0 bg-transparent text-left outline-none focus:outline-none"
                                onClick={(e) => openDeleteModal(item, e)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-white/70">
                    Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, total)} of {total} documents
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/90 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/20"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-white/70">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/90 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/20"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {items.map(item => (
                <div
                  key={item.id}
                  className={`flex flex-col rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md transition hover:bg-white/15 cursor-pointer ${openMenuId === item.id ? 'relative z-[9999]' : ''}`}
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
                  <div className="mb-3">
                    <div className="mb-2 truncate text-lg font-semibold text-white">{item.title}</div>
                    <div className="mb-1 text-sm text-white/60">{fmt(item.createdAt)}</div>
                    {item.repo && (
                      <div className="truncate font-mono text-xs text-white/50">{item.repo}</div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {getStatusBadge(item.status)}
                      {item.isOutdated && (
                        <span className="inline-flex items-center gap-1 rounded border border-orange-400/30 bg-orange-500/20 px-2 py-0.5 text-xs text-orange-200">
                          <AlertCircle className="h-3 w-3" />
                          Outdated
                        </span>
                      )}
                      {item.lastPushedProvider && (
                        <span className="inline-flex items-center gap-1 rounded border border-blue-400/30 bg-blue-500/20 px-2 py-0.5 text-xs text-blue-200">
                          <Send className="h-3 w-3" />
                          {item.lastPushedProvider}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                    <div className="text-xs text-white/50">
                      Updated {fmtRelative(item.updatedAt)}
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        className="rounded-lg border border-white/20 bg-white/5 p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMenu(item.id, e);
                        }}
                        title="More options"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {openMenuId === item.id && (
                        <div
                          ref={(el) => {
                            if (el) menuRefs.current[item.id] = el;
                          }}
                          className="absolute right-0 top-full z-[100] mt-1 min-w-[160px] rounded-lg border border-white/20 bg-black/95 p-1 shadow-xl backdrop-blur-md"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/edit/${item.id}`}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/90 transition-colors hover:bg-white/10"
                            onClick={() => setOpenMenuId(null)}
                          >
                            Open Editor
                          </Link>
                          <button
                            type="button"
                            className="edit-menu-button flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-400 transition-colors border-0 bg-transparent text-left outline-none focus:outline-none"
                            onClick={(e) => openDeleteModal(item, e)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && itemToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          onClick={cancelDelete}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancelDelete();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/20 bg-black/90 p-6 shadow-xl backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
            role="document"
          >
            <h2 className="mb-4 text-xl font-semibold text-white">Confirm Delete</h2>
            <p className="mb-6 text-white/80">
              Are you sure you want to delete <span className="font-semibold">"{itemToDelete.title}"</span>?
              This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-white/20 px-4 py-2 text-white/90 transition-colors hover:bg-white/10"
                onClick={cancelDelete}
                disabled={deletingId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl border border-red-400/30 bg-red-500/20 px-4 py-2 text-red-300 transition-colors hover:bg-red-500/30 disabled:opacity-50"
                onClick={confirmDelete}
                disabled={deletingId !== null}
              >
                {deletingId === itemToDelete.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
