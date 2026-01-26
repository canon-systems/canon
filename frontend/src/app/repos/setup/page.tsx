import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { RepositorySetupWizard } from '@/components/RepositorySetupWizard';
import { JiraSetupWizard } from '@/components/JiraSetupWizard';

interface PageProps {
    searchParams: Promise<{
        repoId?: string;
    }>;
}

export default async function RepositorySetupPage({ searchParams }: PageProps) {
    const searchParamsResolved = await searchParams;
    const repoId = searchParamsResolved.repoId;

    // If no repoId is provided, redirect to the main repos page
    // where users can connect a new repository
    if (!repoId) {
        redirect('/repos');
    }

    // Verify user has access to this repository
    const supabase = await createClient();
    const { data: repo, error } = await supabase
        .from('workspace_repos')
        .select('id, name, repo_url, provider')
        .eq('id', repoId)
        .single();

    if (error || !repo) {
        return (
            <div className="flex items-center justify-center">
                <div className="glass-panel p-8 text-center">
                    <h1 className="text-2xl font-bold text-white mb-4">Repository Not Found</h1>
                    <p className="text-white/70">The requested repository could not be found or you don't have access to it.</p>
                </div>
            </div>
        );
    }

    if (repo.provider === 'jira') {
        return <JiraSetupWizard repoId={repoId} />;
    }

    return <RepositorySetupWizard repoId={repoId} />;
}
