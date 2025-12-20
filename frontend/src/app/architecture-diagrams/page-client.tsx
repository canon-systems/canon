'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Github, Loader2, AlertTriangle, Info, Search, X, FileText, GitBranch } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface RepoWithSetup {
    id: string;
    name: string;
    repo_url: string;
    default_branch: string;
    setup_branch: string;
    setup_status: string;
}

interface ArchitectureDiagramsPageClientProps {
    repos?: RepoWithSetup[];
}

export function ArchitectureDiagramsPageClient({ repos: initialRepos = [] }: ArchitectureDiagramsPageClientProps = {}) {
    const router = useRouter();
    const supabase = createClient();

    const [availableRepos, setAvailableRepos] = useState<RepoWithSetup[]>(initialRepos);
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [hasGitHubConnection, setHasGitHubConnection] = useState(false);
    const [checkingGitHub, setCheckingGitHub] = useState(true);

    // Load available repositories
    useEffect(() => {
        async function loadRepos() {
            setLoadingRepos(true);
            try {
                const { data: repos, error } = await supabase
                    .from('workspace_repos')
                    .select(`
            id,
            name,
            repo_url,
            default_branch,
            repository_setup!inner(setup_status, branch)
          `)
                    .eq('repository_setup.setup_status', 'ready');

                if (error) throw error;

                const reposWithSetup = (repos || []).map((repo: any) => ({
                    id: repo.id,
                    name: repo.name,
                    repo_url: repo.repo_url,
                    default_branch: repo.default_branch,
                    setup_branch: repo.repository_setup?.branch || repo.default_branch,
                    setup_status: repo.repository_setup?.setup_status || 'unknown'
                }));

                setAvailableRepos(reposWithSetup);
            } catch (err) {
                console.error('Failed to load repositories:', err);
                setErrorMsg('Failed to load repositories');
            } finally {
                setLoadingRepos(false);
            }
        }

        loadRepos();
    }, [supabase]);

    // Check GitHub connection status
    useEffect(() => {
        async function checkGitHubConnection() {
            setCheckingGitHub(true);
            try {
                const response = await fetch('/api/integrations/list');
                if (response.ok) {
                    const data = await response.json();
                    setHasGitHubConnection((data.connections || []).some(
                        (c: { provider: string; status: string }) =>
                            c.provider === 'github' && c.status === 'active'
                    ));
                }
            } catch (err) {
                console.error('Failed to check GitHub connection:', err);
            } finally {
                setCheckingGitHub(false);
            }
        }
        checkGitHubConnection();
    }, []);

    const selectedRepo = availableRepos.find(r => r.id === selectedRepoId);

    async function generateDiagram() {
        if (!selectedRepoId) {
            setErrorMsg('Please select a repository');
            return;
        }

        setErrorMsg('');
        setSuccessMsg('');
        setGenerating(true);

        try {
            const response = await fetch('/api/diagrams/generate', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ repoId: selectedRepoId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate diagram');
            }

            setSuccessMsg(`Architecture diagram generated successfully! Found ${data.components} components and ${data.relationships} relationships.`);

            // Redirect to view the diagram
            setTimeout(() => {
                router.push(`/architecture-diagrams/view/${data.diagramId}`);
            }, 2000);

        } catch (error: any) {
            setErrorMsg(error.message || 'Failed to generate architecture diagram');
        } finally {
            setGenerating(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <div className="container mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-4 mb-4">
                        <Link
                            href="/overview"
                            className="text-white/70 hover:text-white transition-colors"
                        >
                            ← Back to Overview
                        </Link>
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Architecture Diagrams</h1>
                    <p className="text-white/70">
                        Generate visual architecture diagrams from your codebase using advanced code analysis.
                    </p>
                </div>

                {/* GitHub Connection Status */}
                {!checkingGitHub && !hasGitHubConnection && (
                    <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <div className="flex items-center gap-2 text-yellow-400 mb-2">
                            <AlertTriangle className="w-5 h-5" />
                            <span className="font-medium">GitHub Connection Required</span>
                        </div>
                        <p className="text-yellow-200/80 text-sm mb-3">
                            Connect your GitHub account to analyze private repositories and access higher rate limits.
                        </p>
                        <Link
                            href="/integrations"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-colors text-sm"
                        >
                            <Github className="w-4 h-4" />
                            Connect GitHub
                        </Link>
                    </div>
                )}

                {/* Repository Selection */}
                <div className="glass-panel p-6 mb-6">
                    <h2 className="text-xl font-semibold text-white mb-4">Select Repository</h2>

                    {loadingRepos ? (
                        <div className="flex items-center gap-2 text-white/70">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading repositories...
                        </div>
                    ) : availableRepos.length === 0 ? (
                        <div className="text-center py-8">
                            <FileText className="w-12 h-12 text-white/30 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-white mb-2">No Repositories Available</h3>
                            <p className="text-white/70 mb-4">
                                Set up repositories to generate architecture diagrams. Repositories must complete the full setup process.
                            </p>
                            <Link
                                href="/repos"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                            >
                                <Github className="w-4 h-4" />
                                Manage Repositories
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {availableRepos.map(repo => (
                                <div
                                    key={repo.id}
                                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${selectedRepoId === repo.id
                                        ? 'border-blue-500 bg-blue-500/10'
                                        : 'border-white/10 hover:border-white/20 bg-white/5'
                                        }`}
                                    onClick={() => setSelectedRepoId(repo.id)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Github className="w-5 h-5 text-white/70" />
                                            <div>
                                                <h3 className="text-white font-medium">{repo.name}</h3>
                                                <p className="text-white/60 text-sm">{repo.repo_url}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <GitBranch className="w-4 h-4 text-white/50" />
                                            <span className="text-white/50 text-sm">{repo.setup_branch}</span>
                                        </div>
                                    </div>
                                    {selectedRepoId === repo.id && (
                                        <div className="mt-3 pt-3 border-t border-white/10">
                                            <p className="text-green-400 text-sm">
                                                ✓ Repository connected and ready for architecture analysis
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Generate Button */}
                {selectedRepoId && (
                    <div className="glass-panel p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-2">Generate Architecture Diagram</h3>
                                <p className="text-white/70">
                                    Analyze {selectedRepo?.name} and create a visual architecture diagram using Tree-sitter AST parsing.
                                </p>
                            </div>
                            <button
                                onClick={generateDiagram}
                                disabled={generating}
                                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                {generating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <FileText className="w-4 h-4" />
                                        Generate Diagram
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Messages */}
                {errorMsg && (
                    <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <div className="flex items-center gap-2 text-red-400 mb-1">
                            <AlertTriangle className="w-5 h-5" />
                            <span className="font-medium">Error</span>
                        </div>
                        <p className="text-red-200/80">{errorMsg}</p>
                    </div>
                )}

                {successMsg && (
                    <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                        <div className="flex items-center gap-2 text-green-400 mb-1">
                            <Info className="w-5 h-5" />
                            <span className="font-medium">Success</span>
                        </div>
                        <p className="text-green-200/80">{successMsg}</p>
                    </div>
                )}

                {/* Info Section */}
                <div className="mt-8 glass-panel p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">How It Works</h3>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="text-white font-medium mb-2">Repository Setup Required</h4>
                            <p className="text-white/70 text-sm">
                                Requires repositories that have completed the setup process. Tree-sitter analyzes source code directly from GitHub.
                            </p>
                        </div>
                        <div>
                            <h4 className="text-white font-medium mb-2">Tree-sitter Powered</h4>
                            <p className="text-white/70 text-sm">
                                Uses Tree-sitter AST parsing for accurate dependency extraction across 10+ programming languages.
                            </p>
                        </div>
                        <div>
                            <h4 className="text-white font-medium mb-2">Smart Architecture Discovery</h4>
                            <p className="text-white/70 text-sm">
                                Automatically identifies architectural patterns and creates component relationship diagrams.
                            </p>
                        </div>
                        <div>
                            <h4 className="text-white font-medium mb-2">Deterministic & Reproducible</h4>
                            <p className="text-white/70 text-sm">
                                Same codebase always produces the same architecture diagram, ensuring consistent documentation.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
