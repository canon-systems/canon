'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Github, Plus, Settings, Activity, FileText, Zap, ExternalLink, X, Trash2, ChevronDown, Check } from 'lucide-react';
import { RepositoryConnectionWizard } from '@/components/RepositoryConnectionWizard';

interface Repository {
  id: string;
  name: string;
  repo_url: string;
  default_branch: string;
  setup_status?: string;
  created_at: string;
  updated_at: string;
}

interface RepositoriesPageClientProps {
  repositories: Repository[];
}

export default function RepositoriesPageClient({ repositories }: RepositoriesPageClientProps) {
  const router = useRouter();
  const [showConnectionWizard, setShowConnectionWizard] = useState(false);
  const [deletingRepoId, setDeletingRepoId] = useState<string | null>(null);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState<string | null>(null);
  const [availableBranches, setAvailableBranches] = useState<Record<string, string[]>>({});
  const [loadingBranches, setLoadingBranches] = useState<Record<string, boolean>>({});

  // Check for ongoing setup processes and redirect if found
  useEffect(() => {
    const checkOngoingSetups = async () => {
      for (const repo of repositories) {
        if (repo.setup_status === 'analyzing') {
          // Check if there's actually an ongoing process by calling the setup API
          try {
            const response = await fetch(`/api/repos/setup?repoId=${repo.id}`);
            const data = await response.json();

            if (response.ok && data.setup?.setup_status === 'analyzing') {
              // Redirect to setup wizard to resume the process
              router.push(`/repos/setup?repoId=${repo.id}`);
              break; // Only redirect to the first ongoing process
            }
          } catch (error) {
            console.error('Error checking setup status:', error);
          }
        }
      }
    };

    if (repositories.length > 0) {
      checkOngoingSetups();
    }
  }, [repositories, router]);

  const handleConnectRepository = () => {
    setShowConnectionWizard(true);
  };

  const handleConnectionComplete = (repoId: string) => {
    setShowConnectionWizard(false);
    // Redirect to setup for the newly connected repository
    router.push(`/repos/setup?repoId=${repoId}`);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (branchDropdownOpen && !(event.target as Element).closest('.branch-dropdown')) {
        setBranchDropdownOpen(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [branchDropdownOpen]);

  const loadBranches = async (repo: Repository) => {
    if (availableBranches[repo.id]) return; // Already loaded

    setLoadingBranches(prev => ({ ...prev, [repo.id]: true }));

    try {
      const response = await fetch('/api/github/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repo.repo_url })
      });

      if (response.ok) {
        const data = await response.json();
        setAvailableBranches(prev => ({
          ...prev,
          [repo.id]: data.branches || []
        }));
      } else {
        console.error('Failed to load branches for', repo.repo_url);
        // Set empty array to prevent retrying
        setAvailableBranches(prev => ({ ...prev, [repo.id]: [] }));
      }
    } catch (error) {
      console.error('Error loading branches:', error);
      setAvailableBranches(prev => ({ ...prev, [repo.id]: [] }));
    } finally {
      setLoadingBranches(prev => ({ ...prev, [repo.id]: false }));
    }
  };

  const handleBranchChange = async (repoId: string, newBranch: string) => {
    try {
      const response = await fetch(`/api/repos/${repoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_branch: newBranch })
      });

      if (response.ok) {
        // Update local state to reflect the change immediately
        setAvailableBranches(prev => ({ ...prev, [repoId]: [] })); // Clear to force reload if needed
        // In a real app, you'd update the repositories array
        alert(`Branch changed to ${newBranch}. Refresh the page to see the update.`);
      } else {
        const error = await response.json();
        alert(`Failed to change branch: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error changing branch:', error);
      alert('Failed to change branch. Please try again.');
    } finally {
      setBranchDropdownOpen(null);
    }
  };

  const handleDeleteRepository = async (repoId: string, repoName: string) => {
    if (!confirm(`Are you sure you want to disconnect ${repoName}? This will remove all associated data and documents.`)) {
      return;
    }

    setDeletingRepoId(repoId);
    try {
      const response = await fetch(`/api/repos/${repoId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Refresh the page to show updated repository list
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

  return (
    <div className="page-shell space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white mb-2">Repositories</h1>
          <p className="text-white/60">Manage your connected GitHub repositories</p>
        </div>
        <button
          onClick={handleConnectRepository}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Connect Repository
        </button>
      </div>

      {repositories.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <Github className="h-16 w-16 text-white/20 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">No repositories connected</h2>
          <p className="text-white/60 mb-6 max-w-md mx-auto">
            Connect your first GitHub repository to start generating documentation and setting up automation.
          </p>
          <button
            onClick={handleConnectRepository}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Connect Your First Repository
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {repositories.map((repo) => (
            <div key={repo.id} className="glass-panel p-6 hover:border-white/20 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                    <Github className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-lg">{repo.name}</h3>
                    <p className="text-sm text-white/60">{repo.repo_url.replace('https://github.com/', '')}</p>
                  </div>
                </div>
                <a
                  href={repo.repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/40 hover:text-white/60 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>

              <div className="flex items-center gap-2 text-sm text-white/60 mb-4">
                <span>Branch:</span>
                <div className="relative">
                  <button
                    onClick={() => {
                      if (branchDropdownOpen === repo.id) {
                        setBranchDropdownOpen(null);
                      } else {
                        setBranchDropdownOpen(repo.id);
                        loadBranches(repo);
                      }
                    }}
                    className={`px-3 py-1 rounded text-xs flex items-center gap-2 transition-all branch-dropdown ${
                      branchDropdownOpen === repo.id
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'bg-white/10 hover:bg-white/20 text-white/80'
                    }`}
                    disabled={loadingBranches[repo.id]}
                    title="Click to select a different branch"
                  >
                    <code>{repo.default_branch}</code>
                    {loadingBranches[repo.id] ? (
                      <div className="animate-spin rounded-full h-3 w-3 border border-white/40 border-t-white ml-1"></div>
                    ) : (
                      <ChevronDown className={`h-3 w-3 transition-transform ml-1 ${branchDropdownOpen === repo.id ? 'rotate-180 text-blue-300' : ''}`} />
                    )}
                  </button>

                  {branchDropdownOpen === repo.id && (
                    <div className="absolute top-full left-0 mt-1 w-56 bg-black/98 border border-white/30 rounded-lg shadow-2xl z-50 max-h-48 overflow-y-auto branch-dropdown">
                      <div className="px-3 py-2 border-b border-white/20">
                        <p className="text-xs text-white/60">Select Branch</p>
                      </div>
                      {availableBranches[repo.id]?.length > 0 ? (
                        availableBranches[repo.id].map((branch) => (
                          <button
                            key={branch}
                            onClick={() => handleBranchChange(repo.id, branch)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 flex items-center justify-between transition-colors ${
                              branch === repo.default_branch ? 'text-blue-400 bg-blue-500/10' : 'text-white/80'
                            }`}
                          >
                            <span className="font-mono">{branch}</span>
                            {branch === repo.default_branch && <Check className="h-4 w-4" />}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-white/50">
                          {loadingBranches[repo.id] ? 'Loading branches...' : 'No branches available'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                {/* Show Setup button if not set up, or Setup/View Setup if in progress/complete */}
                <Link
                  href={`/repos/setup?repoId=${repo.id}`}
                  className="btn btn-secondary flex-1 text-center text-sm"
                >
                  <Settings className="h-3 w-3 mr-1" />
                  Setup
                </Link>

                {/* Only show Generate Docs if repository is fully set up */}
                {repo.setup_status === 'ready' ? (
                  <Link
                    href={`/documentation?repoId=${repo.id}`}
                    className="btn btn-primary flex-1 text-center text-sm"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Generate Docs
                  </Link>
                ) : (
                  <button
                    disabled
                    className="btn btn-secondary flex-1 text-center text-sm opacity-50 cursor-not-allowed"
                    title={`Setup ${repo.setup_status || 'not started'} - Complete repository setup first to enable documentation generation`}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Generate Docs
                  </button>
                )}

                <button
                  onClick={() => handleDeleteRepository(repo.id, repo.name)}
                  disabled={deletingRepoId === repo.id}
                  className="btn btn-secondary text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2"
                  title="Disconnect repository"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Show setup status if not ready */}
              {repo.setup_status && repo.setup_status !== 'ready' && (
                <div className="mt-3 text-xs text-center">
                  <span className={`px-2 py-1 rounded ${
                    repo.setup_status === 'analyzing'
                      ? 'bg-blue-500/20 text-blue-300'
                      : repo.setup_status === 'failed'
                      ? 'bg-red-500/20 text-red-300'
                      : 'bg-gray-500/20 text-gray-300'
                  }`}>
                    Setup: {repo.setup_status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <Link
            href="/documentation"
            className="flex items-center gap-3 p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-medium text-white">Generate Documentation</h4>
              <p className="text-sm text-white/60">Create docs from any repository</p>
            </div>
          </Link>

          <Link
            href="/automation"
            className="flex items-center gap-3 p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-medium text-white">Setup Automation</h4>
              <p className="text-sm text-white/60">Keep docs updated automatically</p>
            </div>
          </Link>

          <Link
            href="/overview"
            className="flex items-center gap-3 p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-medium text-white">View Dashboard</h4>
              <p className="text-sm text-white/60">Monitor activity and stats</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Repository Connection Modal */}
      {showConnectionWizard && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="relative">
              <button
                onClick={() => setShowConnectionWizard(false)}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
              <RepositoryConnectionWizard
                onComplete={handleConnectionComplete}
                onCancel={() => setShowConnectionWizard(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
