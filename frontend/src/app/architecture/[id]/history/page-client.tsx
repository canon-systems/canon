'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, GitBranch, TrendingUp } from 'lucide-react';
import type { ArchitectureDiagram, ArchitectureDiagramVersion } from '@/lib/server/architecture/types';

interface ArchitectureHistoryClientProps {
  diagram: ArchitectureDiagram;
  history: {
    versions: ArchitectureDiagramVersion[];
    metrics: {
      totalVersions: number;
      totalTools: number;
      toolsAddedOverTime: number;
      toolsRemovedOverTime: number;
      firstVersionDate: string | null;
      lastVersionDate: string | null;
    };
  };
}

export function ArchitectureHistoryClient({ diagram, history }: ArchitectureHistoryClientProps) {
  const [selectedVersion1, setSelectedVersion1] = useState<string | null>(null);
  const [selectedVersion2, setSelectedVersion2] = useState<string | null>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [comparing, setComparing] = useState(false);

  async function compareVersions() {
    if (!selectedVersion1 || !selectedVersion2) return;

    setComparing(true);
    try {
      const response = await fetch(`/api/architecture/${diagram.id}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId1: selectedVersion1,
          versionId2: selectedVersion2,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setComparison(data.comparison);
      }
    } catch (err) {
      console.error('Failed to compare versions:', err);
    } finally {
      setComparing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Link
          href="/architecture/manage"
          className="mb-4 inline-flex items-center gap-2 text-white/70 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Diagrams
        </Link>
        <h1 className="text-3xl font-bold text-white mb-2">{diagram.title}</h1>
        <p className="text-white/70">{diagram.repo_url} - {diagram.branch}</p>
      </div>

      {/* Metrics */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-2xl font-bold text-white">{history.metrics.totalVersions}</div>
          <div className="text-sm text-white/60">Total Versions</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-2xl font-bold text-white">{history.metrics.totalTools}</div>
          <div className="text-sm text-white/60">Current Tools</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-2xl font-bold text-green-400">{history.metrics.toolsAddedOverTime}</div>
          <div className="text-sm text-white/60">Tools Added</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-2xl font-bold text-red-400">{history.metrics.toolsRemovedOverTime}</div>
          <div className="text-sm text-white/60">Tools Removed</div>
        </div>
      </div>

      {/* Version Comparison */}
      {history.versions.length > 1 && (
        <div className="mb-8 rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-xl font-bold text-white">Compare Versions</h2>
          <div className="flex gap-4">
            <select
              value={selectedVersion1 || ''}
              onChange={(e) => setSelectedVersion1(e.target.value)}
              className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white"
            >
              <option value="">Select version 1...</option>
              {history.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.version_number} - {new Date(v.created_at).toLocaleString()}
                </option>
              ))}
            </select>
            <select
              value={selectedVersion2 || ''}
              onChange={(e) => setSelectedVersion2(e.target.value)}
              className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white"
            >
              <option value="">Select version 2...</option>
              {history.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.version_number} - {new Date(v.created_at).toLocaleString()}
                </option>
              ))}
            </select>
            <button
              onClick={compareVersions}
              disabled={!selectedVersion1 || !selectedVersion2 || comparing}
              className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Compare
            </button>
          </div>
          {comparison && (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 font-semibold text-white">Comparison Result</h3>
              <p className="text-sm text-white/70">{comparison.summary}</p>
              {comparison.toolsAdded.length > 0 && (
                <div className="mt-2">
                  <span className="text-sm font-medium text-green-400">Added: </span>
                  <span className="text-sm text-white/70">{comparison.toolsAdded.join(', ')}</span>
                </div>
              )}
              {comparison.toolsRemoved.length > 0 && (
                <div className="mt-2">
                  <span className="text-sm font-medium text-red-400">Removed: </span>
                  <span className="text-sm text-white/70">{comparison.toolsRemoved.join(', ')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Version Timeline */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Version History</h2>
        {history.versions.map((version, index) => (
          <div
            key={version.id}
            className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <GitBranch className="h-5 w-5 text-blue-400" />
                  <h3 className="text-lg font-bold text-white">Version {version.version_number}</h3>
                  {index === 0 && (
                    <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-300">
                      Latest
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/60 mb-3">
                  {new Date(version.created_at).toLocaleString()}
                </p>
                {version.change_summary && (
                  <p className="text-sm text-white/80 mb-3">{version.change_summary}</p>
                )}
                {version.tools_added.length > 0 && (
                  <div className="mb-2">
                    <span className="text-xs font-medium text-green-400">Added: </span>
                    <span className="text-xs text-white/70">{version.tools_added.join(', ')}</span>
                  </div>
                )}
                {version.tools_removed.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-red-400">Removed: </span>
                    <span className="text-xs text-white/70">{version.tools_removed.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


