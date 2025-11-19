'use client';

import { useState, useEffect } from 'react';
import { Github, Upload, Loader2, Download, Copy, Check, RefreshCw } from 'lucide-react';
import { ArchitectureFlow } from '@/components/ArchitectureFlow';
import { SearchableSelect } from '@/components/SearchableSelect';
import type { DetectionResult } from '@/lib/server/architecture/detectTools';

type InputType = 'github_repo_directory' | 'zipped_folder';
type Status = 'idle' | 'processing' | 'completed' | 'error';

export function ArchitecturePageClient() {
  const [method, setMethod] = useState<InputType>('github_repo_directory');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [subdir, setSubdir] = useState('');
  
  const [ownerInput, setOwnerInput] = useState('');
  const [baseOwner, setBaseOwner] = useState('');
  const [showRepoSelector, setShowRepoSelector] = useState(false);
  const [repos, setRepos] = useState<Array<{ name: string; full_name: string; url: string; private: boolean }>>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  
  const [branches, setBranches] = useState<string[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingDirectories, setLoadingDirectories] = useState(false);
  
  const [zipFile, setZipFile] = useState<File | null>(null);
  
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [diagramMarkdown, setDiagramMarkdown] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Diagram persistence state
  const [diagramTitle, setDiagramTitle] = useState('');
  const [diagramDescription, setDiagramDescription] = useState('');
  const [saveDiagram, setSaveDiagram] = useState(false);
  const [savedDiagramId, setSavedDiagramId] = useState<string | null>(null);
  const [existingDiagrams, setExistingDiagrams] = useState<any[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<{ outdated: boolean; message?: string } | null>(null);

  // Function to search for repos (matches SvelteKit behavior)
  function searchRepos() {
    if (ownerInput.trim()) {
      setShowRepoSelector(true);
      const trimmed = ownerInput.trim();
      // Remove github.com/ prefix if present
      const cleanOwner = trimmed
        .replace(/^https?:\/\/github\.com\//, '')
        .replace(/\/$/, '')
        .split('/')[0];
      if (cleanOwner && cleanOwner !== baseOwner) {
        setBaseOwner(cleanOwner);
        fetchRepos(cleanOwner);
      }
    } else {
      setShowRepoSelector(false);
      setBaseOwner('');
      setRepos([]);
    }
  }

  // Fetch repos for an owner
  async function fetchRepos(owner: string) {
    if (!owner || loadingRepos) return;

    setLoadingRepos(true);
    try {
      const response = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner })
      });

      if (response.ok) {
        const data = await response.json();
        setRepos((data.repos || [])
          .filter((r: any) => r && r.name && r.full_name && r.url)
          .map((r: { name: string; full_name: string; url: string; private: boolean }) => ({
            name: r.name,
            full_name: r.full_name,
            url: r.url,
            private: r.private || false
          })));
      } else {
        setRepos([]);
        const errorData = await response.json().catch(() => ({}));
        if (response.status !== 404) {
          console.error('Failed to fetch repos:', errorData);
        }
      }
    } catch (err) {
      console.error('Failed to fetch repos:', err);
      setRepos([]);
    } finally {
      setLoadingRepos(false);
    }
  }

  // Fetch branches when repo URL changes
  async function fetchBranches() {
    if (!repoUrl.trim() || !repoUrl.includes('github.com')) {
      setBranches([]);
      return;
    }

    // Only fetch if we have a full repo URL (owner/repo)
    const noProto = repoUrl.replace(/^https?:\/\//, '');
    const parts = noProto.split('/').filter(Boolean);
    if (parts.length < 3) {
      return;
    }

    setLoadingBranches(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/github/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repoUrl })
      });

      if (response.ok) {
        const data = await response.json();
        setBranches(data.branches || []);
        // Auto-select first branch if available and current branch not in list
        if (data.branches && data.branches.length > 0 && !data.branches.includes(branch)) {
          setBranch(data.branches[0]);
        }
      } else {
        setBranches([]);
        const errorData = await response.json().catch(() => ({}));
        if (response.status !== 404) {
          setErrorMessage(errorData?.error || errorData?.detail || `Failed to load branches (${response.status})`);
        }
      }
    } catch (err) {
      console.error('Failed to fetch branches:', err);
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  }

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

  // Note: Removed auto-trigger on ownerInput changes to match submit page behavior
  // User must explicitly click "Search" button or press Enter to search for repos

  // React to repo URL changes
  useEffect(() => {
    if (repoUrl && repoUrl.includes('github.com')) {
      // Only fetch branches if we have a full repo URL (owner/repo)
      const noProto = repoUrl.replace(/^https?:\/\//, '');
      const parts = noProto.split('/').filter(Boolean);
      if (parts.length >= 3) {
        fetchBranches();
      }
    } else {
      setBranches([]);
      setDirectories([]);
      setBranch('main');
      setSubdir('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoUrl]);

  // React to branch changes
  useEffect(() => {
    if (branch && repoUrl && repoUrl.includes('github.com') && method === 'github_repo_directory') {
      fetchDirectories();
    } else {
      setDirectories([]);
      setSubdir('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, repoUrl, method]);

  async function handleSubmit() {
    if (status === 'processing') return;

    setStatus('processing');
    setErrorMessage('');
    setDiagramMarkdown('');
    setDetectionResult(null);

    try {
      const formData = new FormData();

      if (method === 'github_repo_directory') {
        if (!repoUrl.trim()) {
          throw new Error('Please enter a GitHub repository URL');
        }
        if (!branch) {
          throw new Error('Please select a branch');
        }
        formData.append('method', 'github');
        formData.append('repoUrl', repoUrl.trim());
        formData.append('branch', branch.trim());
        if (subdir.trim()) {
          formData.append('subdir', subdir.trim());
        }
        if (saveDiagram) {
          formData.append('saveDiagram', 'true');
          formData.append('title', diagramTitle.trim() || 'Untitled Diagram');
          if (diagramDescription.trim()) {
            formData.append('description', diagramDescription.trim());
          }
        }
      } else if (method === 'zipped_folder') {
        if (!zipFile) {
          throw new Error('Please select a ZIP file');
        }
        formData.append('method', 'zip');
        formData.append('zipFile', zipFile);
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
      
      if (result.saved && result.diagramId) {
        setSavedDiagramId(result.diagramId);
        if (result.isNewDiagram) {
          setDiagramTitle('');
          setDiagramDescription('');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate architecture diagram');
      setStatus('error');
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files[0]) {
      setZipFile(event.target.files[0]);
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

  // Load existing diagrams for current repo
  async function loadExistingDiagrams() {
    if (!repoUrl || method !== 'github_repo_directory') return;

    setLoadingExisting(true);
    try {
      const params = new URLSearchParams({
        repoUrl,
        branch,
        ...(subdir ? { subdir } : {}),
      });

      const response = await fetch(`/api/architecture/generate?${params}`);
      if (response.ok) {
        const data = await response.json();
        setExistingDiagrams(data.diagrams || []);
      }
    } catch (err) {
      console.error('Failed to load existing diagrams:', err);
    } finally {
      setLoadingExisting(false);
    }
  }

  // Load a specific diagram
  async function loadDiagram(diagram: any) {
    setDiagramTitle(diagram.title);
    setDiagramDescription(diagram.description || '');
    setDiagramMarkdown(diagram.diagram_markdown || '');
    setDetectionResult(diagram.detection_result);
    setSavedDiagramId(diagram.id);
    setStatus('completed');
  }

  // Check for updates
  async function checkForUpdates() {
    if (!savedDiagramId) return;

    setCheckingUpdates(true);
    setUpdateStatus(null);
    try {
      const response = await fetch('/api/architecture/check-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagramId: savedDiagramId }),
      });

      if (response.ok) {
        const data = await response.json();
        setUpdateStatus({
          outdated: data.outdated,
          message: data.outdated
            ? `Changes detected: ${data.filesChanged} files changed, commit ${data.currentCommitSha?.substring(0, 7)}`
            : 'Diagram is up to date',
        });
      }
    } catch (err) {
      setUpdateStatus({ outdated: false, message: 'Failed to check updates' });
    } finally {
      setCheckingUpdates(false);
    }
  }

  // Refresh diagram
  async function refreshDiagram() {
    if (!savedDiagramId) return;

    setStatus('processing');
    try {
      const response = await fetch('/api/architecture/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagramId: savedDiagramId }),
      });

      if (response.ok) {
        const data = await response.json();
        setDiagramMarkdown(data.diagramMarkdown);
        setDetectionResult(data.detectionResult);
        setUpdateStatus({ outdated: false, message: 'Diagram refreshed successfully' });
        setStatus('completed');
      } else {
        throw new Error('Failed to refresh diagram');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to refresh diagram');
      setStatus('error');
    }
  }

  // Load existing diagrams when repo/branch/subdir changes
  useEffect(() => {
    if (repoUrl && branch && method === 'github_repo_directory') {
      loadExistingDiagrams();
    } else {
      setExistingDiagrams([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoUrl, branch, subdir, method]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Architecture Diagram Generator</h1>
        <p className="text-white/70">
          Analyze your codebase and automatically generate a visual architecture diagram showing all tools,
          services, and their connections.
        </p>
      </div>

      {/* Input Form */}
      <div className="mb-8 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div className="mb-6">
          <label className="mb-3 block text-sm font-medium text-white">Input Method</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="method"
                value="github_repo_directory"
                checked={method === 'github_repo_directory'}
                onChange={() => setMethod('github_repo_directory')}
                className="h-4 w-4 text-blue-500"
              />
              <Github className="h-4 w-4 text-white/70" />
              <span className="text-sm text-white/80">GitHub Repository</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="method"
                value="zipped_folder"
                checked={method === 'zipped_folder'}
                onChange={() => setMethod('zipped_folder')}
                className="h-4 w-4 text-blue-500"
              />
              <Upload className="h-4 w-4 text-white/70" />
              <span className="text-sm text-white/80">ZIP File</span>
            </label>
          </div>
        </div>

        {method === 'github_repo_directory' ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="ownerInput" className="mb-2 block text-sm font-medium text-white">
                <div className="mb-1 text-sm text-white/70">
                  GitHub Owner/Organization <span className="text-red-400">*</span>
                </div>
                <div className="flex gap-2">
                  <input
                    id="ownerInput"
                    type="text"
                    value={ownerInput}
                    onChange={(e) => setOwnerInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        searchRepos();
                      }
                    }}
                    placeholder="Enter owner/org (e.g., 'facebook' or 'github.com/facebook')"
                    className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                    required
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={searchRepos}
                    disabled={!ownerInput.trim() || loadingRepos}
                  >
                    Search
                  </button>
                </div>
                <p className="mt-1 text-xs text-white/50">
                  Enter a GitHub username or organization to search for repositories
                </p>
              </label>
            </div>

            {/* Repo selector dropdown */}
            {showRepoSelector && baseOwner && (
              <div>
                <label htmlFor="repoSelect" className="mb-2 block text-sm font-medium text-white">
                  Repository <span className="text-red-400">*</span>
                </label>
                <SearchableSelect
                  options={repos
                    .filter((r) => r && r.url && r.full_name)
                    .map((r) => ({
                      value: r.url || '',
                      label: `${r.full_name || ''}${r.private ? ' (private)' : ''}`
                    }))}
                  value={repoUrl}
                  placeholder={loadingRepos ? 'Loading repositories...' : 'Search repositories...'}
                  searchPlaceholder="Search repositories..."
                  disabled={loadingRepos}
                  onChange={(value) => setRepoUrl(value)}
                />
                {loadingRepos && (
                  <p className="mt-1 text-xs text-white/50">Loading repositories...</p>
                )}
                {!loadingRepos && Array.isArray(repos) && repos.length === 0 && baseOwner && (
                  <p className="mt-1 text-xs text-white/50">No repositories found for {baseOwner}</p>
                )}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="branch" className="mb-2 block text-sm font-medium text-white">Branch</label>
                <SearchableSelect
                  options={branches.map((b) => ({ value: b, label: b }))}
                  value={branch}
                  placeholder={loadingBranches ? 'Loading...' : branches.length === 0 ? 'Enter repo URL first' : 'Select branch...'}
                  searchPlaceholder="Search branches..."
                  disabled={loadingBranches || branches.length === 0}
                  onChange={(value) => setBranch(value)}
                />
                {loadingBranches && (
                  <p className="mt-1 text-xs text-white/50">Loading branches...</p>
                )}
              </div>
              <div>
                <label htmlFor="subdir" className="mb-2 block text-sm font-medium text-white">
                  Subdirectory (optional)
                </label>
                <SearchableSelect
                  options={[
                    { value: '', label: 'Root (all files)' },
                    ...directories.map((d) => ({ value: d, label: d }))
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
                  disabled={loadingDirectories || !branch || branches.length === 0}
                  onChange={(value) => setSubdir(value)}
                />
                {loadingDirectories && (
                  <p className="mt-1 text-xs text-white/50">Loading directories...</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="zipFile" className="mb-2 block text-sm font-medium text-white">ZIP File</label>
            <input
              id="zipFile"
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white file:mr-4 file:rounded file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/20"
            />
            {zipFile && (
              <p className="mt-2 text-sm text-white/60">Selected: {zipFile.name}</p>
            )}
          </div>
        )}

        {/* Save Diagram Options (GitHub only) */}
        {method === 'github_repo_directory' && repoUrl && (
          <div className="mt-6 space-y-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveDiagram}
                onChange={(e) => setSaveDiagram(e.target.checked)}
                className="h-4 w-4 text-blue-500"
              />
              <span className="text-sm font-medium text-white">Save diagram</span>
            </label>

            {saveDiagram && (
              <div className="space-y-3 pl-6">
                <div>
                  <label htmlFor="diagramTitle" className="mb-1 block text-sm font-medium text-white">
                    Diagram Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="diagramTitle"
                    type="text"
                    value={diagramTitle}
                    onChange={(e) => setDiagramTitle(e.target.value)}
                    placeholder="e.g., Frontend Architecture"
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                  />
                </div>
                <div>
                  <label htmlFor="diagramDescription" className="mb-1 block text-sm font-medium text-white">
                    Description (optional)
                  </label>
                  <textarea
                    id="diagramDescription"
                    value={diagramDescription}
                    onChange={(e) => setDiagramDescription(e.target.value)}
                    placeholder="Optional description..."
                    rows={2}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                  />
                </div>
              </div>
            )}

            {/* Load Existing Diagrams */}
            {existingDiagrams.length > 0 && (
              <div className="pl-6">
                <label htmlFor="existingDiagrams" className="mb-2 block text-sm font-medium text-white">
                  Load Existing Diagram
                </label>
                <select
                  id="existingDiagrams"
                  onChange={(e) => {
                    const diagram = existingDiagrams.find((d) => d.id === e.target.value);
                    if (diagram) loadDiagram(diagram);
                  }}
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  <option value="">Select a saved diagram...</option>
                  {existingDiagrams.map((diagram) => (
                    <option key={diagram.id} value={diagram.id}>
                      {diagram.title} (Updated: {new Date(diagram.last_updated_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={status === 'processing'}
          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'processing' ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing codebase...
            </span>
          ) : (
            'Generate Architecture Diagram'
          )}
        </button>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-200">
          <p className="font-medium">Error</p>
          <p className="text-sm">{errorMessage}</p>
        </div>
      )}

      {/* Update Status */}
      {savedDiagramId && updateStatus && (
        <div className={`mb-6 rounded-lg border p-4 ${
          updateStatus.outdated
            ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-200'
            : 'border-green-500/50 bg-green-500/10 text-green-200'
        }`}>
          <p className="text-sm">{updateStatus.message}</p>
          {updateStatus.outdated && (
            <button
              onClick={refreshDiagram}
              disabled={status === 'processing'}
              className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Refresh Diagram
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {status === 'completed' && detectionResult && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Generated Architecture Diagram</h2>
            <div className="flex gap-2">
              {savedDiagramId && (
                <button
                  onClick={checkForUpdates}
                  disabled={checkingUpdates}
                  className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {checkingUpdates ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    'Check Updates'
                  )}
                </button>
              )}
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
      )}
    </div>
  );
}

