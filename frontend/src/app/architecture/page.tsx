import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ArchitecturePageClient } from './page-client';

export default async function ArchitecturePage() {
  const { session, user } = await getSession();

  if (!session) {
    redirect('/login');
  }

  const supabase = await createClient();

  // Get all repositories for the user
  const { data: repositories, error: repoError } = await supabase
    .from('workspace_repos')
    .select('*')
    .eq('workspace_id', user.id)
    .order('created_at', { ascending: false });

  if (repoError) {
    console.error('Failed to load repositories:', repoError);
  }

  // Get setup status for each repository and filter to only ready repos
  const reposWithSetup = await Promise.all(
    (repositories || []).map(async (repo) => {
      try {
        const { data: setup, error } = await supabase
          .from('repository_setup')
          .select('setup_status, branch, total_files, summarized_files')
          .eq('repo_id', repo.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
          console.error(`Error fetching setup for repo ${repo.id}:`, error);
        }

        // Only include repos that are ready
        if (setup?.setup_status === 'ready' && setup.branch) {
          return {
            id: repo.id,
            name: repo.name,
            repo_url: repo.repo_url,
            default_branch: repo.default_branch,
            setup_branch: setup.branch,
            setup_status: setup.setup_status,
          };
        }
        return null;
      } catch (err) {
        console.error(`Failed to fetch setup status for repo ${repo.id}:`, err);
        return null;
      }
    })
  );

  // Filter out null values (repos that aren't ready)
  const readyRepos = reposWithSetup.filter((r): r is NonNullable<typeof r> => r !== null);

  return <ArchitecturePageClient repos={readyRepos} />;
}

