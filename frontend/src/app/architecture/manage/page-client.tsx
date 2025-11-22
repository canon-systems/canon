'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trash2, RefreshCw, ExternalLink, Plus } from 'lucide-react';
import type { ArchitectureDiagram } from '@/lib/server/architecture/types';

interface ArchitectureManageClientProps {
  initialDiagrams: ArchitectureDiagram[];
}

export function ArchitectureManageClient({ initialDiagrams }: ArchitectureManageClientProps) {
  const [diagrams, setDiagrams] = useState(initialDiagrams);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  async function handleDelete(diagramId: string) {
    if (!confirm('Are you sure you want to delete this diagram?')) return;

    setDeletingId(diagramId);
    try {
      const response = await fetch(`/api/architecture/${diagramId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setDiagrams(diagrams.filter((d) => d.id !== diagramId));
      }
    } catch (err) {
      console.error('Failed to delete diagram:', err);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRefresh(diagramId: string) {
    setRefreshingId(diagramId);
    try {
      const response = await fetch('/api/architecture/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagramId }),
      });

      if (response.ok) {
        // Reload diagrams
        const refreshResponse = await fetch('/api/architecture/manage');
        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          setDiagrams(data.diagrams || []);
        }
      }
    } catch (err) {
      console.error('Failed to refresh diagram:', err);
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Architecture Diagrams</h1>
          <p className="text-white/70">Manage your saved architecture diagrams</p>
        </div>
        <Link
          href="/architecture"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Diagram
        </Link>
      </div>

      {diagrams.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center">
          <p className="text-white/70 mb-4">No diagrams saved yet.</p>
          <Link
            href="/architecture"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create Your First Diagram
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {diagrams.map((diagram) => (
            <div
              key={diagram.id}
              className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <Link
                    href={`/architecture/${diagram.id}/history`}
                    className="text-xl font-bold text-white mb-1 hover:text-blue-400 transition-colors block"
                  >
                    {diagram.title}
                  </Link>
                  {diagram.description && (
                    <p className="text-white/70 mb-3">{diagram.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm text-white/60">
                    <span>Repo: {diagram.repo_url}</span>
                    <span>Branch: {diagram.branch}</span>
                    {diagram.subdir && <span>Subdir: {diagram.subdir}</span>}
                    <span>Updated: {new Date(diagram.last_updated_at).toLocaleString()}</span>
                    {diagram.auto_update_enabled && (
                      <span className="text-green-400">Auto-update enabled</span>
                    )}
                  </div>
                  {diagram.exports && diagram.exports.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-white/50">
                        Exported to: {diagram.exports.map((e) => e.provider).join(', ')}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/architecture/${diagram.id}/history`}
                    className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
                  >
                    View History
                  </Link>
                  <button
                    onClick={() => handleRefresh(diagram.id)}
                    disabled={refreshingId === diagram.id}
                    className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshingId === diagram.id ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => handleDelete(diagram.id)}
                    disabled={deletingId === diagram.id}
                    className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


