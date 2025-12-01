import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import RepositoriesPageClient from './page-client';

export default async function RepositoriesPage() {
  const { user } = await getSession();

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="glass-panel p-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-white/70">Please sign in to access repositories.</p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();

  // First get repositories
  const { data: repositories, error: repoError } = await supabase
    .from('workspace_repos')
    .select('*')
    .eq('workspace_id', user.id)
    .order('created_at', { ascending: false });

  if (repoError) {
    console.error('Failed to load repositories:', repoError);
  }

  // Then get setup status for each repository
  const repositoriesWithSetup = await Promise.all(
    (repositories || []).map(async (repo) => {
      try {
        const { data: setup, error } = await supabase
          .from('repository_setup')
          .select('setup_status')
          .eq('repo_id', repo.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
          console.error(`Error fetching setup for repo ${repo.id}:`, error);
        }

        return {
          ...repo,
          setup_status: setup?.setup_status || null
        };
      } catch (err) {
        console.error(`Failed to fetch setup status for repo ${repo.id}:`, err);
        return {
          ...repo,
          setup_status: null
        };
      }
    })
  );

  return <RepositoriesPageClient repositories={repositoriesWithSetup} />;
}
