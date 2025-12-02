'use client';

import { useState, useEffect } from 'react';
import { Github, Loader2, Download, Copy, Check, Save, ExternalLink, Layers3 } from 'lucide-react';
import { ArchitectureFlow } from '@/components/ArchitectureFlow';
import { SearchableSelect } from '@/components/SearchableSelect';
import type { DetectionResult } from '@/lib/server/architecture/detectTools';
import Link from 'next/link';

type Status = 'idle' | 'processing' | 'completed' | 'error';

interface RepoWithSetup {
  id: string;
  name: string;
  repo_url: string;
  default_branch: string;
  setup_branch: string;
  setup_status: string;
}

interface ArchitecturePageClientProps {
  repos?: RepoWithSetup[];
}

export function ArchitecturePageClient({ repos: initialRepos = [] }: ArchitecturePageClientProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [subdir, setSubdir] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  
  const [availableRepos, setAvailableRepos] = useState<RepoWithSetup[]>(initialRepos);
  const [directories, setDirectories] = useState<string[]>([]);
  const [loadingDirectories, setLoadingDirectories] = useState(false);
  
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [diagramMarkdown, setDiagramMarkdown] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Save functionality
  const [saving, setSaving] = useState(false);
  const [savedDiagramId, setSavedDiagramId] = useState<string | null>(null);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveError, setSaveError] = useState('');

  // Initialize repos from props
  useEffect(() => {
    setAvailableRepos(initialRepos);
  }, [initialRepos]);

  // Update branch and repo URL when repo is selected
  useEffect(() => {
    if (selectedRepoId) {
      const repo = availableRepos.find(r => r.id === selectedRepoId);
      if (repo) {
        setRepoUrl(repo.repo_url);
        setBranch(repo.setup_branch || 'main');
      }
    }
  }, [selectedRepoId, availableRepos]);

  // Fetch directories when repo URL or branch changes
  async function fetchDirectories() {
    if (!repoUrl.trim() || !repoUrl.includes('github.com') || !branch) {
      setDirectories([]);
      return;
    }

    setLoadingDirectories(true);
    try {
      const response = await fetch('/api/github/directories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoUrl, branch })
      });

      if (response.ok) {
        const data = await response.json();
        setDirectories(data.directories || []);
      } else {
        setDirectories([]);
        // Don't show error for directories - it's not critical
      }
    } catch (err) {
      console.error('Failed to fetch directories:', err);
      setDirectories([]);
    } finally {
      setLoadingDirectories(false);
    }
  }

  // React to branch changes
  useEffect(() => {
    if (branch && repoUrl && repoUrl.includes('github.com')) {
      fetchDirectories();
    } else {
      setDirectories([]);
      setSubdir('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, repoUrl]);

  async function handleSubmit() {
    if (status === 'processing') return;

    if (!selectedRepoId || !repoUrl || !repoUrl.includes('github.com')) {
      setErrorMessage('Please select a repository from the dropdown.');
      return;
    }

    if (!branch) {
      setErrorMessage('Please select a branch');
      return;
    }

    setStatus('processing');
    setErrorMessage('');
    setDiagramMarkdown('');
    setDetectionResult(null);

    try {
      const formData = new FormData();
      formData.append('method', 'github');
      formData.append('repoUrl', repoUrl.trim());
      formData.append('branch', branch.trim());
      if (subdir.trim()) {
        formData.append('subdir', subdir.trim());
      }

      const response = await fetch('/api/architecture/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      setDiagramMarkdown(result.diagram);
      setDetectionResult(result.tools);
      setStatus('completed');
      
      // Auto-populate title if saved
      if (result.saved && result.diagramId) {
        setSavedDiagramId(result.diagramId);
        // Extract repo name for default title
        if (repoUrl) {
          const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
          if (match) {
            setSaveTitle(`${match[2]} - ${branch}${subdir ? ` (${subdir})` : ''}`);
          }
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate architecture diagram');
      setStatus('error');
    }
  }

  async function copyToClipboard() {
    if (diagramMarkdown) {
      await navigator.clipboard.writeText(diagramMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function downloadMarkdown() {
    if (diagramMarkdown) {
      const blob = new Blob([diagramMarkdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'architecture.md';
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  async function handleSave() {
    if (saving || !diagramMarkdown || !detectionResult) return;
    
    if (!repoUrl) {
      setSaveError('Please select a repository');
      return;
    }

    if (!saveTitle.trim()) {
      setSaveError('Please enter a title');
      return;
    }

    setSaving(true);
    setSaveError('');

    try {
      const formData = new FormData();
      formData.append('method', 'github');
      formData.append('repoUrl', repoUrl.trim());
      formData.append('branch', branch.trim());
      if (subdir.trim()) {
        formData.append('subdir', subdir.trim());
      }
      formData.append('saveDiagram', 'true');
      formData.append('title', saveTitle.trim());
      if (saveDescription.trim()) {
        formData.append('description', saveDescription.trim());
      }

      const response = await fetch('/api/architecture/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      if (result.saved && result.diagramId) {
        setSavedDiagramId(result.diagramId);
      } else {
        throw new Error('Failed to save diagram');
      }
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save diagram');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Architecture Diagram Generator</h1>
          <p className="text-white/70">
            Analyze your codebase and automatically generate a visual architecture diagram showing all tools,
            services, and their connections.
          </p>
        </div>
        <Link
          href="/architecture/manage"
          className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 whitespace-nowrap"
        >
          <Layers3 className="h-4 w-4" />
          Manage Diagrams
        </Link>
      </div>

      {/* Input Form */}
      <section className="form-panel space-y-6 mb-8">
        <div className="space-y-6">
          <div className="field-group">
            <span className="field-label">
              Repository <span className="text-red-400">*</span>
            </span>
            <SearchableSelect
              options={availableRepos.map((r) => ({
                value: r.id,
                label: r.name,
              }))}
              value={selectedRepoId || ''}
              placeholder={availableRepos.length === 0 ? 'No repositories available' : 'Select a repository...'}
              searchPlaceholder="Search repositories..."
              disabled={availableRepos.length === 0}
              onChange={(value) => setSelectedRepoId(value)}
              triggerClassName="field-select"
            />
            {availableRepos.length === 0 ? (
              <div className="field-note flex items-center justify-between">
                <span>No repositories with file summaries found. Complete repository setup first.</span>
                <Link
                  href="/repos"
                  className="text-sm text-blue-400 hover:text-blue-300 underline"
                >
                  Go to Repositories
                </Link>
              </div>
            ) : (
              <p className="field-note">Select a repository that you have connected and set up.</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="field-group">
              <span className="field-label">Branch</span>
              <input
                className="field-input"
                value={branch}
                readOnly
                disabled
                placeholder="Branch from repository setup"
              />
              <p className="field-note">Branch is set from the initial repository setup and cannot be changed.</p>
            </div>
            <div className="field-group">
              <span className="field-label">Subdirectory (optional)</span>
              <SearchableSelect
                options={[
                  { value: '', label: 'Root (all files)' },
                  ...directories.map((d) => ({ value: d, label: d })),
                ]}
                value={subdir}
                placeholder={
                  loadingDirectories
                    ? 'Loading...'
                    : directories.length === 0 && branch
                    ? 'No subdirectories found'
                    : 'Select subfolder...'
                }
                searchPlaceholder="Search directories..."
                disabled={loadingDirectories || !branch}
                onChange={(value) => setSubdir(value)}
                triggerClassName="field-select"
              />
            </div>
          </div>
        </div>

        <button onClick={handleSubmit} disabled={status === 'processing'} className="primary-action w-full">
          {status === 'processing' ? (
            <span className="flex items-center justify-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing codebase...
            </span>
          ) : (
            'Generate Architecture Diagram'
          )}
        </button>
      </section>

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-200">
          <p className="font-medium">Error</p>
          <p className="text-sm">{errorMessage}</p>
        </div>
      )}

      {/* Results */}
      {status === 'completed' && detectionResult && (
        <div className="space-y-6">
          {/* Save Form - Only show if not already saved */}
          {repoUrl && !savedDiagramId && (
            <section className="form-panel space-y-6 mb-8">
              <div>
                <p className="section-label">Save Diagram</p>
                <p className="section-helper">Save this architecture diagram to your account for future reference and updates.</p>
              </div>

              <div className="space-y-6">
                <div className="field-group">
                  <span className="field-label">
                    Title <span className="text-red-400">*</span>
                  </span>
                  <input
                    type="text"
                    value={saveTitle}
                    onChange={(e) => setSaveTitle(e.target.value)}
                    placeholder="e.g., My Project - Main Branch"
                    className="field-input"
                  />
                  <p className="field-note">Give your diagram a descriptive name to easily identify it later.</p>
                </div>

                <div className="field-group">
                  <span className="field-label">Description (optional)</span>
                  <textarea
                    value={saveDescription}
                    onChange={(e) => setSaveDescription(e.target.value)}
                    placeholder="Add a description for this diagram..."
                    rows={3}
                    className="field-input"
                  />
                  <p className="field-note">Optional notes about this architecture diagram.</p>
                </div>

                {saveError && (
                  <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-200">
                    <p className="font-medium">Error</p>
                    <p className="text-sm">{saveError}</p>
                  </div>
                )}

                <button
                  onClick={handleSave}
                  disabled={saving || !saveTitle.trim()}
                  className="primary-action w-full"
                >
                  {saving ? (
                    <span className="flex items-center justify-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Save className="h-4 w-4" />
                      Save Diagram
                    </span>
                  )}
                </button>
              </div>
            </section>
          )}

          {/* Success Message */}
          {savedDiagramId && (
            <div className="rounded-xl border border-green-500/50 bg-green-500/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-200 font-medium">Diagram saved successfully!</p>
                  <p className="text-green-300/80 text-sm mt-1">
                    You can view and manage it from the architecture management page.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/architecture/${savedDiagramId}/history`}
                    className="flex items-center gap-2 rounded-lg border border-green-500/50 bg-green-500/20 px-3 py-2 text-sm text-green-200 transition-colors hover:bg-green-500/30"
                  >
                    View History
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/architecture/manage"
                    className="flex items-center gap-2 rounded-lg border border-green-500/50 bg-green-500/20 px-3 py-2 text-sm text-green-200 transition-colors hover:bg-green-500/30"
                  >
                    Manage Diagrams
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Diagram Display */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Generated Architecture Diagram</h2>
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={downloadMarkdown}
                  className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
              </div>
            </div>

          {/* React Flow Diagram */}
          <div className="mb-6">
            <ArchitectureFlow detectionResult={detectionResult} />
          </div>

          {/* Full Markdown */}
          <div className="mb-6">
            <details className="rounded-lg border border-white/10 bg-white/5">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-white/80">
                View Full Markdown
              </summary>
              <pre className="max-h-96 overflow-auto p-4 text-xs text-white/70">
                <code>{diagramMarkdown}</code>
              </pre>
            </details>
          </div>

          {/* Detected Tools Summary */}
          {detectionResult.tools && (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 text-lg font-semibold text-white">Detected Tools ({detectionResult.tools.length})</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {detectionResult.tools.map((tool) => (
                  <div key={tool.name} className="rounded border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{tool.icon || '📦'}</span>
                      <div>
                        <p className="text-sm font-medium text-white">{tool.name}</p>
                        <p className="text-xs text-white/60">{tool.description || 'No description'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

