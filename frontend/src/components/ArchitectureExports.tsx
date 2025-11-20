'use client';

import { useState } from 'react';
import { ExternalLink, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import type { DiagramExport } from '@/lib/server/architecture/types';

interface ArchitectureExportsProps {
  diagramId: string;
  exports: DiagramExport[];
  onExport: (provider: string, workspaceInfo: any, autoSync: boolean) => Promise<void>;
  onSync: (exportIndex: number) => Promise<void>;
  onDelete: (exportIndex: number) => Promise<void>;
  onToggleAutoSync: (exportIndex: number, autoSync: boolean) => Promise<void>;
}

export function ArchitectureExports({
  diagramId,
  exports,
  onExport,
  onSync,
  onDelete,
  onToggleAutoSync,
}: ArchitectureExportsProps) {
  const [syncingIndex, setSyncingIndex] = useState<number | null>(null);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);

  const handleSync = async (index: number) => {
    setSyncingIndex(index);
    try {
      await onSync(index);
    } finally {
      setSyncingIndex(null);
    }
  };

  const handleDelete = async (index: number) => {
    if (!confirm('Are you sure you want to remove this export?')) return;
    setDeletingIndex(index);
    try {
      await onDelete(index);
    } finally {
      setDeletingIndex(null);
    }
  };

  if (exports.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-white/70">No exports yet. Export to a workspace to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {exports.map((exportItem, index) => (
        <div
          key={index}
          className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white capitalize">{exportItem.provider}</span>
              {exportItem.autoSync && (
                <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-300">
                  Auto-sync
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-white/60">
              Last synced: {new Date(exportItem.lastSyncedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={exportItem.autoSync}
                onChange={(e) => onToggleAutoSync(index, e.target.checked)}
                className="h-4 w-4 text-blue-500"
              />
              <span className="text-xs text-white/70">Auto</span>
            </label>
            <button
              onClick={() => handleSync(index)}
              disabled={syncingIndex === index}
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncingIndex === index ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </button>
            <button
              onClick={() => handleDelete(index)}
              disabled={deletingIndex === index}
              className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deletingIndex === index ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}


