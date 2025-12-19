'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Github, Search, Loader2, CheckCircle2, AlertCircle, ExternalLink, Plus, ChevronRight } from 'lucide-react';

interface RepositoryConnectionWizardProps {
  onComplete?: (repoId: string) => void;
  onCancel?: () => void;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  language: string | null;
  updated_at: string;
}

export function RepositoryConnectionWizard({ onComplete, onCancel }: RepositoryConnectionWizardProps) {
  const router = useRouter();

  const [step, setStep] = useState<'search' | 'select' | 'branch' | 'connect'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGitHubConnection, setHasGitHubConnection] = useState(false);

  // Check GitHub connection status
  useEffect(() => {
    async function checkGitHubConnection() {
      try {
        const response = await fetch('/api/integrations/list');
        if (response.ok) {
          const data = await response.json();
          const hasConnection = (data.connections || []).some(
            (c: { provider: string; status: string }) =>
              c.provider === 'github' && c.status === 'active'
          );
          setHasGitHubConnection(hasConnection);
        } else {
          console.error('Failed to check GitHub connection:', response.status);
        }
      } catch (err) {
        console.error('Failed to check GitHub connection:', err);
        // Assume no connection if we can't check
        setHasGitHubConnection(false);
      }
    }
    checkGitHubConnection();
  }, []);

  const searchRepositories = async (ownerOverride?: string) => {
    const owner = ownerOverride ?? searchQuery.trim();
    if (!owner || isSearching) return;

    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner })
      });

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.repos || []);
        if (data.repos && data.repos.length > 0) {
          setStep('select');
        } else {
          setError('No repositories found for this owner/organization.');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 403 && !hasGitHubConnection) {
          setError('GitHub connection required. Private repositories need a connected GitHub account.');
        } else {
          setError(errorData?.error || 'Failed to search repositories.');
        }
      }
    } catch (err) {
      setError('Failed to search repositories. Please try again.');
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchBranches = async (repo: GitHubRepo) => {
    setIsLoadingBranches(true);
    setError(null);

    try {
      const response = await fetch('/api/github/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          repoUrl: repo.html_url
        })
      });

      if (response.ok) {
        const data = await response.json();
        const branches = data.branches || [];
        setAvailableBranches(branches);
        setSelectedBranch(repo.default_branch); // Pre-select default branch
        setStep('branch');
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData?.error || 'Failed to load branches.');
      }
    } catch (err) {
      setError('Failed to load branches. Please try again.');
      console.error('Branch fetch error:', err);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const connectRepository = async () => {
    if (!selectedRepo || !selectedBranch) return;

    setIsConnecting(true);
    setError(null);

    try {
      // First, create the repository record
      const requestData = {
        name: selectedRepo.name,
        repo_url: selectedRepo.html_url,
        default_branch: selectedBranch, // Use selected branch instead of default
        provider: 'github'
      };


      const createResponse = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        throw new Error(errorData?.error || `Failed to connect repository (${createResponse.status})`);
      }

      const repoData = await createResponse.json();

      // Success! Repository connected
      if (onComplete) {
        onComplete(repoData.id);
      } else {
        // Redirect to setup for the newly connected repository
        router.push(`/repos/setup?repoId=${repoData.id}`);
      }
    } catch (err: unknown) {
      setError(err.message || 'Failed to connect repository. Please try again.');
      console.error('Connection error:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchRepositories();
    }
  };

  if (!hasGitHubConnection) {
    return (
      <div className="glass-panel p-8 text-center">
        <Github className="h-16 w-16 text-white/20 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-4">GitHub Connection Required</h2>
        <p className="text-white/60 mb-6 max-w-md mx-auto">
          To connect repositories, you need to connect your GitHub account. This allows access to both public and private repositories.
        </p>
        <div className="flex justify-center gap-4">
          <a
            href="/settings?tab=integrations"
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Github className="h-4 w-4" />
            Connect GitHub
          </a>
          {onCancel && (
            <button
              onClick={onCancel}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white mb-2">Connect Repository</h2>
            <p className="text-white/60">Search for and connect a GitHub repository to start generating documentation.</p>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/15 p-4 text-sm text-red-100">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Error</p>
              <p className="mt-1 text-red-100/80">{error}</p>
            </div>
          </div>
        </div>
      )}

      {step === 'search' && (
        <div className="space-y-6">
          <div className="field-group">
            <span className="field-label">GitHub Owner/Organization</span>
            <div className="flex gap-3">
              <input
                type="text"
                className="field-input flex-1"
                placeholder="Enter username or organization (e.g., 'facebook', 'github', or @me for yours')"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
              />
              <button
                onClick={() => searchRepositories()}
                disabled={!searchQuery.trim() || isSearching}
                className="btn btn-primary flex items-center gap-2"
              >
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
            <p className="field-note">
              Tip: use <code className="px-1 rounded bg-white/10">@me</code> to list all repositories (public and private) you can access with your connected GitHub account.
            </p>
          </div>
        </div>
      )}

      {step === 'select' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Select Repository</h3>
            <button
              onClick={() => setStep('search')}
              className="text-sm text-white/60 hover:text-white"
            >
              ← Back to search
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-3">
            {searchResults.map((repo) => (
              <div
                key={repo.id}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedRepo?.id === repo.id
                    ? 'border-blue-500/50 bg-blue-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
                onClick={() => setSelectedRepo(repo)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                        <Github className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-white truncate">{repo.full_name}</h4>
                        <div className="flex items-center gap-2 text-sm text-white/60">
                          {repo.private && <span className="text-yellow-400">Private</span>}
                          {repo.language && <span>{repo.language}</span>}
                          <span>•</span>
                          <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    {repo.description && (
                      <p className="text-sm text-white/70 mb-3 line-clamp-2">{repo.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-white/50">
                      <span>Branch: {repo.default_branch}</span>
                      <a
                        href={repo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-white/70"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View on GitHub <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  <div className="ml-4">
                    {selectedRepo?.id === repo.id && (
                      <CheckCircle2 className="h-6 w-6 text-green-400" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedRepo && (
            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setStep('search')}
                className="btn btn-secondary"
              >
                Back
              </button>
              <button
                onClick={() => fetchBranches(selectedRepo)}
                disabled={isLoadingBranches}
                className="btn btn-primary flex items-center gap-2"
              >
                {isLoadingBranches ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                {isLoadingBranches ? 'Loading Branches...' : 'Continue'}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'branch' && selectedRepo && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Select Branch</h3>
            <button
              onClick={() => setStep('select')}
              className="text-sm text-white/60 hover:text-white"
            >
              ← Back to repositories
            </button>
          </div>

          <div className="glass-panel p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                <Github className="w-4 h-4 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-white">{selectedRepo.full_name}</h4>
                <p className="text-sm text-white/60">Choose a branch to connect</p>
              </div>
            </div>

            {availableBranches.length > 0 ? (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Available Branches
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {availableBranches.map((branch) => (
                    <div
                      key={branch}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedBranch === branch
                          ? 'border-blue-500/50 bg-blue-500/10'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      }`}
                      onClick={() => setSelectedBranch(branch)}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-medium ${
                          selectedBranch === branch ? 'text-blue-300' : 'text-white'
                        }`}>
                          {branch}
                        </span>
                        {selectedBranch === branch && (
                          <CheckCircle2 className="h-5 w-5 text-green-400" />
                        )}
                        {branch === selectedRepo.default_branch && (
                          <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
                            default
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400 mx-auto mb-4" />
                <p className="text-white/60">Loading available branches...</p>
              </div>
            )}
          </div>

          {selectedBranch && (
            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setStep('select')}
                className="btn btn-secondary"
              >
                Back
              </button>
              <button
                onClick={connectRepository}
                disabled={isConnecting}
                className="btn btn-primary flex items-center gap-2"
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {isConnecting ? 'Connecting...' : 'Connect Repository'}
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
