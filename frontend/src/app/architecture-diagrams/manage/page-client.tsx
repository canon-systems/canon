'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Layers3, Eye, Trash2, AlertTriangle, Loader2, Github, Calendar, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ArchitectureDiagram {
    id: string;
    title: string;
    created_at: string;
    repo_id: string;
    repo_name: string;
    repo_url: string;
    content: string;
    analysis_data: {
        components: any[];
        relationships: any[];
    };
}

export function ArchitectureDiagramsManagePageClient() {
    const supabase = createClient();
    const [diagrams, setDiagrams] = useState<ArchitectureDiagram[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [deletingDiagramId, setDeletingDiagramId] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [diagramToDelete, setDiagramToDelete] = useState<{ id: string; title: string } | null>(null);

    useEffect(() => {
        loadDiagrams();
    }, []);

    async function loadDiagrams() {
        try {
            setLoading(true);
            setError('');

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
                .order('created_at', { ascending: false });

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
        } catch (err: any) {
            console.error('Failed to load diagrams:', err);
            setError('Failed to load architecture diagrams');
        } finally {
            setLoading(false);
        }
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

            const { error } = await supabase
                .from('diagrams')
                .delete()
                .eq('id', diagramId);

            if (error) throw error;

            setDiagrams(diagrams.filter(d => d.id !== diagramId));
            setShowDeleteModal(false);
            setDiagramToDelete(null);
        } catch (err: any) {
            console.error('Failed to delete diagram:', err);
            setError('Failed to delete diagram');
        } finally {
            setDeletingDiagramId(null);
        }
    }

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    return (
        <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl space-y-6">
                <Card className="border border-white/10 bg-gradient-to-b from-white/5 to-white/0 shadow-lg">
                    <CardHeader className="space-y-1 pb-6">
                        <CardTitle className="text-2xl font-semibold text-white">Manage Architecture Diagrams</CardTitle>
                        <CardDescription className="text-white/70">
                            View and manage all your generated architecture diagrams.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <Button asChild>
                                <Link href="/architecture-diagrams">
                                    <Layers3 className="w-4 h-4" />
                                    Create New Diagram
                                </Link>
                            </Button>
                        </div>

                        <Separator />

                        {/* Loading State */}
                        {loading && (
                            <Card>
                                <CardContent className="flex items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-white/70" />
                                    <span className="ml-2 text-white/70">Loading diagrams...</span>
                                </CardContent>
                            </Card>
                        )}

                        {/* Error State */}
                        {error && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {/* Diagrams List */}
                        {!loading && !error && (
                            <div className="space-y-4">
                                {diagrams.length === 0 ? (
                                    <Card>
                                        <CardContent className="p-12 text-center">
                                            <Layers3 className="w-16 h-16 text-white/20 mx-auto mb-4" />
                                            <h3 className="text-xl font-medium text-white mb-2">No Architecture Diagrams Yet</h3>
                                            <p className="text-white/70 mb-6">
                                                Generate your first architecture diagram to get started with visualizing your codebase structure.
                                            </p>
                                            <Button asChild>
                                                <Link href="/architecture-diagrams">
                                                    <FileText className="w-4 h-4" />
                                                    Create First Diagram
                                                </Link>
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    diagrams.map((diagram) => (
                                        <Card key={diagram.id} className="hover:shadow-lg transition-shadow">
                                            <CardContent className="p-6">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <Layers3 className="w-5 h-5 text-blue-400" />
                                                            <h3 className="text-xl font-semibold text-white">
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
                                                            <div className="flex items-center gap-1">
                                                                <FileText className="w-4 h-4" />
                                                                <span>
                                                                    {diagram.analysis_data?.components?.length || 0} components,
                                                                    {diagram.analysis_data?.relationships?.length || 0} relationships
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {diagram.repo_url && (
                                                            <p className="text-white/50 text-sm mb-3">
                                                                {diagram.repo_url}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <Button variant="secondary" size="sm" asChild>
                                                            <Link href={`/architecture-diagrams/view/${diagram.id}`}>
                                                                <Eye className="w-4 h-4" />
                                                                View
                                                            </Link>
                                                        </Button>

                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                            onClick={() => openDeleteModal({ id: diagram.id, title: diagram.title })}
                                                            disabled={deletingDiagramId === diagram.id}
                                                        >
                                                            {deletingDiagramId === diagram.id ? (
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                            ) : (
                                                                <Trash2 className="w-4 h-4" />
                                                            )}
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

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
