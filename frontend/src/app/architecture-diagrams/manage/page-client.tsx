'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Layers3, Eye, Trash2, AlertTriangle, Loader2, Github, Calendar, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

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

    async function deleteDiagram(diagramId: string) {
        if (!confirm('Are you sure you want to delete this architecture diagram? This action cannot be undone.')) {
            return;
        }

        try {
            setDeletingDiagramId(diagramId);

            const { error } = await supabase
                .from('diagrams')
                .delete()
                .eq('id', diagramId);

            if (error) throw error;

            setDiagrams(diagrams.filter(d => d.id !== diagramId));
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
        <div>
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
                    <h1 className="text-3xl font-bold text-white mb-2">Manage Architecture Diagrams</h1>
                    <p className="text-white/70">
                        View and manage all your generated architecture diagrams.
                    </p>
                </div>

                {/* Create New Button */}
                <div className="mb-6">
                    <Link
                        href="/architecture-diagrams"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                    >
                        <Layers3 className="w-4 h-4" />
                        Create New Diagram
                    </Link>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-white/70" />
                        <span className="ml-2 text-white/70">Loading diagrams...</span>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <div className="flex items-center gap-2 text-red-400 mb-1">
                            <AlertTriangle className="w-5 h-5" />
                            <span className="font-medium">Error</span>
                        </div>
                        <p className="text-red-200/80">{error}</p>
                    </div>
                )}

                {/* Diagrams List */}
                {!loading && !error && (
                    <div className="space-y-4">
                        {diagrams.length === 0 ? (
                            <div className="text-center py-12">
                                <Layers3 className="w-16 h-16 text-white/20 mx-auto mb-4" />
                                <h3 className="text-xl font-medium text-white mb-2">No Architecture Diagrams Yet</h3>
                                <p className="text-white/70 mb-6">
                                    Generate your first architecture diagram to get started with visualizing your codebase structure.
                                </p>
                                <Link
                                    href="/architecture-diagrams"
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                                >
                                    <FileText className="w-4 h-4" />
                                    Create First Diagram
                                </Link>
                            </div>
                        ) : (
                            diagrams.map((diagram) => (
                                <div
                                    key={diagram.id}
                                    className="glass-panel p-6 hover:bg-white/5 transition-colors"
                                >
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
                                            <Link
                                                href={`/architecture-diagrams/view/${diagram.id}`}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors"
                                            >
                                                <Eye className="w-4 h-4" />
                                                View
                                            </Link>

                                            <button
                                                onClick={() => deleteDiagram(diagram.id)}
                                                disabled={deletingDiagramId === diagram.id}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                {deletingDiagramId === diagram.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
