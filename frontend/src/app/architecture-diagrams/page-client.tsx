'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Github, Loader2, AlertTriangle, Info, FileText, GitBranch, Eye, Calendar, Layers3, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

interface RepoWithSetup {
    id: string;
    name: string;
    repo_url: string;
    default_branch: string;
    setup_branch: string;
    setup_status: string;
}

interface ArchitectureDiagram {
    id: string;
    title: string;
    created_at: string;
    repo_id: string;
    repo_name: string;
    repo_url: string;
    content: string;
    analysis_data: {
        [key: string]: any;
    };
}

type TabId = 'generate' | 'view';

interface ArchitectureDiagramsPageClientProps {
    repos?: RepoWithSetup[];
}

export function ArchitectureDiagramsPageClient({ repos: initialRepos = [] }: ArchitectureDiagramsPageClientProps = {}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();

    // Tab management
    const [activeTab, setActiveTab] = useState<TabId>('view');

    const [availableRepos, setAvailableRepos] = useState<RepoWithSetup[]>(initialRepos);
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [selectedRepoIds, setSelectedRepoIds] = useState<string[]>([]);
    const [generating, setGenerating] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [hasGitHubConnection, setHasGitHubConnection] = useState(false);
    const [checkingGitHub, setCheckingGitHub] = useState(true);
    const [existingDiagram, setExistingDiagram] = useState<{ id: string; title: string; created_at: string } | null>(null);
    const [forceCreate, setForceCreate] = useState(false);

    // Diagrams state
    const [diagrams, setDiagrams] = useState<ArchitectureDiagram[]>([]);
    const [loadingDiagrams, setLoadingDiagrams] = useState(true);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [diagramToDelete, setDiagramToDelete] = useState<{ id: string; title: string } | null>(null);
    const [deletingDiagramId, setDeletingDiagramId] = useState<string | null>(null);

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

    // Tab initialization
    useEffect(() => {
        const tabParam = searchParams.get('tab');
        const validTabs: TabId[] = ['view', 'generate'];
        if (tabParam && validTabs.includes(tabParam as TabId)) {
            setActiveTab(tabParam as TabId);
        }
    }, [searchParams]);

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

    // Load existing diagrams
    useEffect(() => {
        async function loadDiagrams() {
            try {
                setLoadingDiagrams(true);
                const { data, error } = await supabase
                    .from('diagrams')
                    .select(`
                        id,
                        title,
                        created_at,
                        repo_id,
                        content,
                        analysis_data,
                        workspace_repos!inner(name, repo_url)
                    `)
                    .eq('diagram_type', 'architecture')
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (error) throw error;

                const diagramsWithRepoInfo = (data || []).map((diagram: any) => ({
                    id: diagram.id,
                    title: diagram.title,
                    created_at: diagram.created_at,
                    repo_id: diagram.repo_id,
                    repo_name: diagram.workspace_repos?.name || 'Unknown Repository',
                    repo_url: diagram.workspace_repos?.repo_url || '',
                    content: diagram.content,
                    analysis_data: diagram.analysis_data
                }));

                setDiagrams(diagramsWithRepoInfo);
            } catch (err) {
                console.error('Failed to load diagrams:', err);
            } finally {
                setLoadingDiagrams(false);
            }
        }

        loadDiagrams();
    }, [supabase]);

    // Check for existing diagram when primary repo is selected
    useEffect(() => {
        async function checkExistingDiagram() {
            const primaryRepoId = selectedRepoIds[0];
            if (!primaryRepoId) {
                setExistingDiagram(null);
                setForceCreate(false);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('diagrams')
                    .select('id, title, created_at')
                    .eq('repo_id', primaryRepoId)
                    .eq('diagram_type', 'architecture')
                    .single();

                if (error && error.code && error.code !== 'PGRST116') { // PGRST116 is "not found"
                    console.error('Error checking for existing diagram:', error);
                    return;
                }

                if (data) {
                    setExistingDiagram({
                        id: data.id,
                        title: data.title,
                        created_at: data.created_at
                    });
                    // Reset forceCreate when switching repos
                    setForceCreate(false);
                } else {
                    setExistingDiagram(null);
                    setForceCreate(false);
                }
            } catch (err) {
                console.error('Failed to check for existing diagram:', err);
                setExistingDiagram(null);
                setForceCreate(false);
            }
        }

        checkExistingDiagram();
    }, [selectedRepoIds, supabase]);

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function openDeleteModal(diagram: { id: string; title: string }) {
        setDiagramToDelete(diagram);
        setShowDeleteModal(true);
    }

    function cancelDelete() {
        setShowDeleteModal(false);
        setDiagramToDelete(null);
    }

    async function confirmDelete() {
        if (!diagramToDelete) return;

        const diagramId = diagramToDelete.id;
        try {
            setDeletingDiagramId(diagramId);

            const response = await fetch(`/api/diagrams/${diagramId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to delete diagram');
            }

            setDiagrams(diagrams.filter(d => d.id !== diagramId));
            setShowDeleteModal(false);
            setDiagramToDelete(null);
        } catch (err: any) {
            console.error('Failed to delete diagram:', err);
            setErrorMsg('Failed to delete diagram');
        } finally {
            setDeletingDiagramId(null);
        }
    }

    const selectedRepo = availableRepos.find(r => r.id === selectedRepoIds[0]);

    const toggleRepoSelection = (id: string) => {
        setSelectedRepoIds(prev => {
            if (prev.includes(id)) {
                const next = prev.filter(rid => rid !== id);
                return next;
            }
            return [...prev, id];
        });
    };

    async function generateDiagram() {
        if (!selectedRepoIds.length) {
            setErrorMsg('Please select at least one repository');
            return;
        }

        setErrorMsg('');
        setSuccessMsg('');
        setGenerating(true);

        try {
            const response = await fetch('/api/diagrams/generate', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    repoIds: selectedRepoIds,
                    forceCreate: forceCreate
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate diagram');
            }

            const action = data.isNew ? 'generated' : 'updated';
            setSuccessMsg(`Architecture diagram ${action} successfully for ${selectedRepoIds.length} repo(s)!`);

            // Update existing diagram state if it was updated
            if (!data.isNew && existingDiagram) {
                setExistingDiagram({
                    ...existingDiagram,
                    id: data.diagramId
                });
            } else if (data.isNew) {
                setExistingDiagram({
                    id: data.diagramId,
                    title: selectedRepo?.name || 'Architecture Diagram',
                    created_at: new Date().toISOString()
                });
            }

            // Reload diagrams list to show updated/new diagram
            if (activeTab === 'view') {
                const { data: updatedDiagrams, error } = await supabase
                    .from('diagrams')
                    .select(`
                        id,
                        title,
                        created_at,
                        repo_id,
                        content,
                        analysis_data,
                        workspace_repos!inner(name, repo_url)
                    `)
                    .eq('diagram_type', 'architecture')
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (!error && updatedDiagrams) {
                    const diagramsWithRepoInfo = updatedDiagrams.map((diagram: any) => ({
                        id: diagram.id,
                        title: diagram.title,
                        created_at: diagram.created_at,
                        repo_id: diagram.repo_id,
                        repo_name: diagram.workspace_repos?.name || 'Unknown Repository',
                        repo_url: diagram.workspace_repos?.repo_url || '',
                        content: diagram.content,
                        analysis_data: diagram.analysis_data
                    }));
                    setDiagrams(diagramsWithRepoInfo);
                }
            }

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

    function setActiveTabAndUpdateUrl(value: string) {
        const tabId = value as TabId;
        setActiveTab(tabId);
        router.push(`/architecture-diagrams?tab=${tabId}`, { scroll: false });
    }

    const tabs: Array<{ id: TabId; name: string; icon: any }> = [
        { id: 'view', name: 'View', icon: Eye },
        { id: 'generate', name: 'Generate', icon: Layers3 }
    ];

    return (
        <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <Layers3 className="h-8 w-8 text-white" />
                        <h1 className="text-3xl font-bold text-white">Architecture Diagrams</h1>
                    </div>
                    <p className="text-white/70">
                        Generate and manage visual architecture diagrams from your codebase.
                    </p>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTabAndUpdateUrl} className="mb-8">
                    <TabsList className="bg-white/5 border border-white/10">
                        {tabs.map(tab => {
                            const Icon = tab.icon;
                            return (
                                <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                                    <Icon className="h-4 w-4" />
                                    {tab.name}
                                </TabsTrigger>
                            );
                        })}
                    </TabsList>

                    <TabsContent value="generate" className="mt-6">
                        <Card className="border border-white/10 bg-gradient-to-b from-white/5 to-white/0 shadow-lg">
                            <CardHeader className="space-y-1 pb-6">
                                <CardTitle className="text-2xl font-semibold text-white">Generate Architecture Diagram</CardTitle>
                                <CardDescription className="text-white/70">
                                    Generate visual architecture diagrams from your codebase using advanced code analysis.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* GitHub Connection Status */}
                                {!checkingGitHub && !hasGitHubConnection && (
                                    <Alert variant="warning">
                                        <AlertTriangle className="h-5 w-5" />
                                        <div>
                                            <AlertTitle>GitHub Connection Required</AlertTitle>
                                            <AlertDescription>
                                                Connect your GitHub account to analyze private repositories.
                                                <Button variant="secondary" size="sm" asChild className="ml-2 mt-2">
                                                    <Link href="/integrations">
                                                        <Github className="h-4 w-4" />
                                                        Connect GitHub
                                                    </Link>
                                                </Button>
                                            </AlertDescription>
                                        </div>
                                    </Alert>
                                )}

                                <Separator />

                                {/* Repository Selection */}
                                <div className="space-y-4">
                                    <div>
                                        <h2 className="text-base font-medium text-white">Select Repositories</h2>
                                        <p className="text-sm text-white/60">Choose one or more repositories to generate a combined architecture diagram. The first selected will be treated as primary for updates.</p>
                                    </div>

                                    {loadingRepos ? (
                                        <div className="flex items-center gap-2 text-white/70">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Loading repositories...
                                        </div>
                                    ) : availableRepos.length === 0 ? (
                                        <Card>
                                            <CardContent className="p-12 text-center">
                                                <FileText className="w-12 h-12 text-white/30 mx-auto mb-4" />
                                                <h3 className="text-lg font-medium text-white mb-2">No Repositories Available</h3>
                                                <p className="text-white/70 mb-4">
                                                    Set up repositories to generate architecture diagrams. Repositories must complete the full setup process.
                                                </p>
                                                <Button asChild>
                                                    <Link href="/repos">
                                                        <Github className="w-4 h-4" />
                                                        Manage Repositories
                                                    </Link>
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    ) : (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="w-full justify-between border-white/20 text-white bg-slate-900/60 hover:bg-slate-800/80"
                                                >
                                                    <span>
                                                        {selectedRepoIds.length
                                                            ? `${selectedRepoIds.length} repo${selectedRepoIds.length > 1 ? 's' : ''} selected`
                                                            : 'Select repositories'}
                                                    </span>
                                                    <span className="text-white/60 text-xs">
                                                        (primary = first selected)
                                                    </span>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                                align="start"
                                                className="max-h-96 overflow-auto border-white/10 bg-black/90"
                                                style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}
                                            >
                                                {availableRepos.map((repo) => {
                                                    const checked = selectedRepoIds.includes(repo.id);
                                                    const isPrimary = selectedRepoIds[0] === repo.id;
                                                    return (
                                                        <DropdownMenuItem
                                                            key={repo.id}
                                                            className="p-0 focus:bg-transparent"
                                                            onSelect={(e) => e.preventDefault()}
                                                        >
                                                            <label className="flex items-start gap-3 w-full rounded-lg border border-white/5 bg-white/5 p-3 hover:bg-white/10 cursor-pointer">
                                                                <Checkbox
                                                                    checked={checked}
                                                                    onCheckedChange={() => toggleRepoSelection(repo.id)}
                                                                    className="mt-1"
                                                                />
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <Github className="w-5 h-5 text-white/70" />
                                                                        <div className="text-white font-medium">{repo.name}</div>
                                                                        {isPrimary && (
                                                                            <span className="text-xs text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded">
                                                                                Primary
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-white/60 text-sm">{repo.repo_url}</div>
                                                                    <div className="flex items-center gap-2 text-white/50 text-xs mt-1">
                                                                        <GitBranch className="w-4 h-4" />
                                                                        <span>{repo.setup_branch}</span>
                                                                    </div>
                                                                </div>
                                                            </label>
                                                        </DropdownMenuItem>
                                                    );
                                                })}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>

                                {/* Generate Button */}
                                {selectedRepoIds.length > 0 && (
                                    <>
                                        <Separator />
                                        <div className="space-y-4">
                                            <div>
                                                <h3 className="text-base font-medium text-white">
                                                    {existingDiagram && !forceCreate ? 'Update Architecture Diagram' : 'Generate Architecture Diagram'}
                                                </h3>
                                                <p className="text-sm text-white/60">
                                                    {existingDiagram && !forceCreate ? (
                                                        <>Update the existing architecture diagram for the primary repo with the latest analysis. Additional selected repos will be merged into the same diagram.</>
                                                    ) : (
                                                        <>Analyze the selected repos and create a combined architecture diagram using Tree-sitter AST parsing.</>
                                                    )}
                                                </p>
                                            </div>

                                            {/* Existing Diagram Info */}
                                            {existingDiagram && !forceCreate && (
                                                <Alert>
                                                    <Info className="h-4 w-4" />
                                                    <div>
                                                        <AlertTitle>Existing Diagram Found</AlertTitle>
                                                        <AlertDescription className="flex items-center justify-between">
                                                            <span>
                                                                A diagram already exists for the primary repository (created {formatDate(existingDiagram.created_at)}).
                                                                It will be updated with the latest analysis.
                                                            </span>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => setForceCreate(true)}
                                                                className="ml-4"
                                                            >
                                                                Create New Instead
                                                            </Button>
                                                        </AlertDescription>
                                                    </div>
                                                </Alert>
                                            )}

                                            {/* Force Create Option */}
                                            {forceCreate && (
                                                <Alert>
                                                    <Info className="h-4 w-4" />
                                                    <div>
                                                        <AlertTitle>Creating New Diagram</AlertTitle>
                                                        <AlertDescription className="flex items-center justify-between">
                                                            <span>
                                                                A new diagram will be created even though one already exists for this repository.
                                                            </span>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => setForceCreate(false)}
                                                                className="ml-4"
                                                            >
                                                                Update Existing Instead
                                                            </Button>
                                                        </AlertDescription>
                                                    </div>
                                                </Alert>
                                            )}

                                            <Button
                                                onClick={generateDiagram}
                                                disabled={generating}
                                                className="w-full sm:w-auto"
                                            >
                                                {generating ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        {existingDiagram && !forceCreate ? 'Updating...' : 'Analyzing...'}
                                                    </>
                                                ) : (
                                                    <>
                                                        <FileText className="w-4 h-4" />
                                                        {existingDiagram && !forceCreate ? 'Update Diagram' : 'Generate Diagram'}
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </>
                                )}

                                {/* Messages */}
                                {(errorMsg || successMsg) && (
                                    <div className="space-y-2">
                                        {errorMsg && (
                                            <Alert variant="destructive">
                                                <AlertTriangle className="h-4 w-4" />
                                                <AlertDescription>{errorMsg}</AlertDescription>
                                            </Alert>
                                        )}
                                        {successMsg && (
                                            <Alert variant="success">
                                                <Info className="h-4 w-4" />
                                                <AlertDescription>{successMsg}</AlertDescription>
                                            </Alert>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="view" className="mt-6">
                        {/* View Tab */}
                        <div className="space-y-6">
                            {/* Header */}
                            <div className="flex items-center gap-3 mb-6">
                                <Eye className="h-6 w-6 text-white" />
                                <div>
                                    <h2 className="text-2xl font-semibold text-white">Your Architecture Diagrams</h2>
                                    <p className="text-white/70">View and manage your generated architecture diagrams.</p>
                                </div>
                            </div>

                            {/* Diagrams List */}
                            {loadingDiagrams ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin text-white/50" />
                                    <span className="ml-2 text-white/60">Loading diagrams...</span>
                                </div>
                            ) : diagrams.length === 0 ? (
                                <div className="text-center py-12">
                                    <Layers3 className="w-16 h-16 text-white/20 mx-auto mb-4" />
                                    <h3 className="text-lg font-medium text-white mb-2">No Architecture Diagrams Yet</h3>
                                    <p className="text-white/70 mb-6">
                                        Generate your first architecture diagram to get started with visualizing your codebase structure.
                                    </p>
                                    <Button onClick={() => setActiveTabAndUpdateUrl('generate')}>
                                        <Layers3 className="w-4 h-4" />
                                        Generate Diagram
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {diagrams.map((diagram) => (
                                        <Card key={diagram.id} className="hover:shadow-lg transition-all duration-200 border border-white/10 bg-white/5 cursor-pointer">
                                            <Link href={`/architecture-diagrams/view/${diagram.id}`}>
                                                <CardContent className="p-6">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-3 mb-2">
                                                                <Layers3 className="w-5 h-5 text-blue-400" />
                                                                <h3 className="text-lg font-semibold text-white">
                                                                    {diagram.title}
                                                                </h3>
                                                            </div>

                                                            <div className="flex items-center gap-4 text-sm text-white/60 mb-3">
                                                                <div className="flex items-center gap-1">
                                                                    <Github className="w-4 h-4" />
                                                                    <span>{diagram.repo_name}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <Calendar className="w-4 h-4" />
                                                                    <span>{formatDate(diagram.created_at)}</span>
                                                                </div>
                                                            </div>

                                                            {diagram.repo_url && (
                                                                <p className="text-white/50 text-sm">
                                                                    {diagram.repo_url}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                variant="destructive"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    openDeleteModal({ id: diagram.id, title: diagram.title });
                                                                }}
                                                                disabled={deletingDiagramId === diagram.id}
                                                            >
                                                                {deletingDiagramId === diagram.id ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <Trash2 className="w-4 h-4" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Link>
                                        </Card>
                                    ))}

                                    {diagrams.length >= 10 && (
                                        <div className="text-center pt-4">
                                            <Button variant="secondary">
                                                Load More Diagrams
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
                {/* Delete Confirmation Modal */}
                <Dialog open={showDeleteModal} onOpenChange={(open) => !open && cancelDelete()}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Confirm Delete</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to delete <span className="font-semibold">"{diagramToDelete?.title}"</span>?
                                This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex items-center justify-end gap-3">
                            <Button variant="secondary" onClick={cancelDelete} disabled={deletingDiagramId !== null}>
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={confirmDelete}
                                disabled={deletingDiagramId !== null}
                            >
                                {deletingDiagramId === diagramToDelete?.id ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    'Delete'
                                )}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
