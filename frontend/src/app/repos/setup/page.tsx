import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { RepositorySetupWizard } from '@/components/RepositorySetupWizard';
import { JiraSetupWizard } from '@/components/JiraSetupWizard';

interface PageProps {
    searchParams: Promise<{
        repoId?: string;
        sourceId?: string;
    }>;
}

export default async function RepositorySetupPage({ searchParams }: PageProps) {
    const searchParamsResolved = await searchParams;
    const repoId = searchParamsResolved.repoId;
    const sourceId = searchParamsResolved.sourceId;
    const effectiveId = sourceId || repoId;

    // If no id is provided, redirect to the main sources page
    if (!effectiveId) {
        redirect('/repos');
    }

    // Verify user has access to this source
    const supabase = await createClient();
    const { data: repo, error } = await supabase
        .from('workspace_sources')
        .select('id, name, repo_url, external_url, provider')
        .eq('id', effectiveId)
        .single();

    if (error || !repo) {
        return (
            <div className="flex items-center justify-center">
                <div className="glass-panel p-8 text-center">
                    <h1 className="text-2xl font-bold text-white mb-4">Source Not Found</h1>
                    <p className="text-white/70">The requested source could not be found or you don&apos;t have access to it.</p>
                </div>
            </div>
        );
    }

    if (repo.provider === 'jira') {
        return <JiraSetupWizard sourceId={effectiveId} />;
    }

    return <RepositorySetupWizard sourceId={effectiveId} />;
}
