'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Github, Plus, Settings, Activity, FileText, Zap, ExternalLink, X, Trash2, ChevronDown, Check, MoreHorizontal } from 'lucide-react';
import { RepositoryConnectionWizard } from '@/components/RepositoryConnectionWizard';

interface Repository {
  id: string;
  name: string;
  repo_url: string;
  default_branch: string;
  setup_status?: string | null;
  setup_branch?: string;
  file_summary_status?: 'complete' | 'partial' | 'none';
  file_summary_count?: number;
  total_files?: number;
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
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('[data-dropdown]')) {
        closeDropdowns();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleConnectRepository = () => {
    setShowConnectionWizard(true);
  };

  const handleConnectionComplete = (repoId: string) => {
    setShowConnectionWizard(false);
    // Redirect to setup for the newly connected repository
    router.push(`/repos/setup?repoId=${repoId}`);
  };

  const toggleDropdown = (repoId: string) => {
    setDropdownOpen(dropdownOpen === repoId ? null : repoId);
  };

  const closeDropdowns = () => {
    setDropdownOpen(null);
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
                <code className="px-2 py-1 rounded bg-white/10 text-white/80 text-xs">
                  {repo.setup_branch || repo.default_branch || 'main'}
                </code>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                {/* Connection Status Badge */}
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  repo.setup_status === 'ready'
                    ? 'bg-green-500/20 text-green-300'
                    : repo.setup_status === 'analyzing'
                    ? 'bg-blue-500/20 text-blue-300'
                    : repo.setup_status === 'failed'
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-gray-500/20 text-gray-300'
                }`}>
                  {repo.setup_status === 'ready'
                    ? '✓ Connected'
                    : repo.setup_status === 'analyzing'
                    ? '⏳ Processing'
                    : repo.setup_status === 'failed'
                    ? '✗ Failed'
                    : '○ Not Started'}
                </span>

                {/* File Summary Status Badge */}
                {repo.setup_status === 'ready' && (
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    repo.file_summary_status === 'complete'
                      ? 'bg-green-500/20 text-green-300'
                      : repo.file_summary_status === 'partial'
                      ? 'bg-yellow-500/20 text-yellow-300'
                      : 'bg-gray-500/20 text-gray-300'
                  }`}>
                    {repo.file_summary_status === 'complete'
                      ? `✓ Summaries: ${repo.file_summary_count || 0}/${repo.total_files || 0}`
                      : repo.file_summary_status === 'partial'
                      ? `⚠ Summaries: ${repo.file_summary_count || 0}/${repo.total_files || 0}`
                      : '○ No Summaries'}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                {/* Three-dots menu with Setup and Generate Docs options */}
                <div className="relative" data-dropdown>
                  <button
                    onClick={() => toggleDropdown(repo.id)}
                    className="btn btn-secondary p-2"
                    title="Repository actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>

                  {/* Dropdown Menu */}
                  {dropdownOpen === repo.id && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-gray-800 border border-white/20 rounded-lg shadow-lg z-10">
                      <div className="py-1">
                        <Link
                          href={`/repos/setup?repoId=${repo.id}`}
                          onClick={closeDropdowns}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors"
                        >
                          <Settings className="h-4 w-4" />
                          Setup
                        </Link>

                        {repo.setup_status === 'ready' ? (
                          <Link
                            href={`/documentation?repoId=${repo.id}`}
                            onClick={closeDropdowns}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors"
                          >
                            <FileText className="h-4 w-4" />
                            Generate Docs
                          </Link>
                        ) : (
                          <button
                            disabled
                            className="flex items-center gap-2 px-4 py-2 text-sm text-white/50 cursor-not-allowed w-full text-left"
                            title={`Setup ${repo.setup_status || 'not started'} - Complete repository setup first to enable documentation generation`}
                          >
                            <FileText className="h-4 w-4" />
                            Generate Docs
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleDeleteRepository(repo.id, repo.name)}
                  disabled={deletingRepoId === repo.id}
                  className="btn btn-secondary text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2"
                  title="Disconnect repository"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

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
