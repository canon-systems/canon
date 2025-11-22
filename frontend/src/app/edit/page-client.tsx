'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Grid3x3, List, MoreVertical, RefreshCw, Loader2, Clock, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface SubmissionItem {
  id: string;
  created_date: string;
  title: string;
  status: 'processing' | 'completed' | 'failed';
  input_type: 'github_repo' | 'github_repo_directory' | 'zipped_folder' | 'pasted_code' | null;
  last_checked_at: string | null;
  is_outdated: boolean;
}

interface EditListPageClientProps {
  user: User | null;
  items: SubmissionItem[];
  loadError: string | null;
}

type ViewMode = 'tile' | 'row';

function fmt(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function fmtRelative(iso: string | null): string {
  if (!iso) return 'Never checked';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function isGitRepo(item: SubmissionItem): boolean {
  return item.input_type === 'github_repo' || item.input_type === 'github_repo_directory';
}

export function EditListPageClient({ user, items: initialItems, loadError }: EditListPageClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState(initialItems);
  const [viewMode, setViewMode] = useState<ViewMode>('row');
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
      router.refresh();
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
        router.refresh();
      }, 2000);
    } catch (e) {
      setRefreshAllErr(String(e));
    } finally {
      setRefreshingAll(false);
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
        <div className="mx-auto max-w-4xl space-y-6">
          <header className="space-y-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-white">Edit a Document</h1>
                <p className="text-white/70">
                  Choose one of your submissions to open the editor. You will only see your own items
                  due to Row Level Security.
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
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                        viewMode === 'tile'
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
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                        viewMode === 'row'
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
            {loadError && (
              <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
                {loadError}
              </div>
            )}
          </header>

          {items.length === 0 ? (
            <div className="rounded-2xl border border-white/20 bg-white/10 p-6 text-center text-white/80">
              <p className="mb-3">You do not have any submissions yet.</p>
              <Link
                href="/submit"
                className="inline-block rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-white hover:from-purple-600 hover:to-pink-600"
              >
                Create your first submission
              </Link>
            </div>
          ) : viewMode === 'row' ? (
            <ul className="divide-y divide-white/10 rounded-2xl border border-white/20 bg-white/10">
              {items.map(item => (
                <li
                  key={item.id}
                  className="relative flex flex-col gap-3 p-4 text-white md:flex-row md:items-start md:justify-between cursor-pointer transition-colors hover:bg-white/15"
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
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-semibold">{item.title}</div>
                    <div className="text-sm text-white/60">{fmt(item.created_date)}</div>
                    <div className="font-mono text-xs text-white/50">ID: {item.id}</div>
                    {isGitRepo(item) && item.status?.toLowerCase() === 'completed' && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        {item.is_outdated ? (
                          <span
                            className="inline-flex items-center gap-1 rounded border border-orange-400/30 bg-orange-500/20 px-2 py-0.5 text-orange-200"
                            title="Source files have changed"
                          >
                            <AlertCircle className="h-3 w-3" />
                            Outdated
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 rounded border border-green-400/30 bg-green-500/20 px-2 py-0.5 text-green-200"
                            title="Up to date"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Fresh
                          </span>
                        )}
                        {item.last_checked_at && (
                          <span className="inline-flex items-center gap-1 text-white/50" title="Last checked">
                            <Clock className="h-3 w-3" />
                            {fmtRelative(item.last_checked_at)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-3 md:flex-col md:items-end">
                    <div className="shrink-0">
                      {item.status?.toLowerCase() === 'completed' ? (
                        <span className="inline-block rounded border border-green-400/30 bg-green-500/20 px-2 py-1 text-xs text-green-200">
                          completed
                        </span>
                      ) : item.status?.toLowerCase() === 'failed' ? (
                        <span className="inline-block rounded border border-red-400/30 bg-red-500/20 px-2 py-1 text-xs text-red-200">
                          failed
                        </span>
                      ) : (
                        <span className="inline-block rounded border border-yellow-400/30 bg-yellow-500/20 px-2 py-1 text-xs text-yellow-200">
                          processing
                        </span>
                      )}
                    </div>

                    <div className="relative shrink-0">
                      <button
                        type="button"
                        className="rounded-lg border border-white/20 bg-white/5 p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                        onClick={(e) => toggleMenu(item.id, e)}
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
                </li>
              ))}
            </ul>
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
                    <div className="mb-1 text-sm text-white/60">{fmt(item.created_date)}</div>
                    <div className="truncate font-mono text-xs text-white/50">ID: {item.id}</div>
                    {isGitRepo(item) && item.status?.toLowerCase() === 'completed' && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {item.is_outdated ? (
                          <span
                            className="inline-flex items-center gap-1 rounded border border-orange-400/30 bg-orange-500/20 px-2 py-0.5 text-orange-200"
                            title="Source files have changed"
                          >
                            <AlertCircle className="h-3 w-3" />
                            Outdated
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 rounded border border-green-400/30 bg-green-500/20 px-2 py-0.5 text-green-200"
                            title="Up to date"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Fresh
                          </span>
                        )}
                        {item.last_checked_at && (
                          <span className="inline-flex items-center gap-1 text-white/50" title="Last checked">
                            <Clock className="h-3 w-3" />
                            {fmtRelative(item.last_checked_at)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                    <div>
                      {item.status?.toLowerCase() === 'completed' ? (
                        <span className="inline-block rounded border border-green-400/30 bg-green-500/20 px-2 py-1 text-xs text-green-200">
                          completed
                        </span>
                      ) : item.status?.toLowerCase() === 'failed' ? (
                        <span className="inline-block rounded border border-red-400/30 bg-red-500/20 px-2 py-1 text-xs text-red-200">
                          failed
                        </span>
                      ) : (
                        <span className="inline-block rounded border border-yellow-400/30 bg-yellow-500/20 px-2 py-1 text-xs text-yellow-200">
                          processing
                        </span>
                      )}
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        className="rounded-lg border border-white/20 bg-white/5 p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                        onClick={(e) => toggleMenu(item.id, e)}
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

          {deleteError && (
            <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
              Error deleting document: {deleteError}
            </div>
          )}

          {refreshAllMsg && (
            <div className="mt-4 rounded-xl border border-green-400/30 bg-green-500/10 px-3 py-2 text-green-200">
              {refreshAllMsg}
            </div>
          )}

          {refreshAllErr && (
            <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-200">
              Error refreshing: {refreshAllErr}
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

