import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ArchitectureDiagramViewer } from './viewer';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function ArchitectureDiagramViewPage({ params }: PageProps) {
    const { id } = await params;
    const supabase = await createClient();

    // Fetch the diagram
    const { data: diagram, error } = await supabase
        .from('diagrams')
        .select(`
      *,
      workspace_sources(name, external_url)
    `)
        .eq('id', id)
        .single();

    if (error || !diagram) {
        notFound();
    }

    return (
        <ArchitectureDiagramViewer
            diagram={diagram}
            repo={diagram.workspace_sources}
        />
    );
}
