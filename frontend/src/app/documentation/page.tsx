import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { DocumentationPageClient } from './page-generate-client';

interface PageProps {
  searchParams: Promise<{
    repoId?: string;
  }>;
}

export default async function DocumentationPage({ searchParams }: PageProps) {
  const { session, user } = await getSession();

  if (!session) {
    redirect('/login');
  }

  const supabase = await createClient();

  // Get all repositories for the user
  const { data: repositories, error: repoError } = await supabase
    .from('workspace_repos')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (repoError) {
    console.error('Failed to load repositories:', repoError);
  }

  // Helper function to normalize repo URL to repo_id format
  function normalizeRepoId(repoUrl: string): string {
    try {
      const url = new URL(repoUrl);
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 2) {
        return `github.com/${pathParts[0]}/${pathParts[1]}`;
      }
    } catch {
      // If URL parsing fails, try to extract from string
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) {
        return `github.com/${match[1]}/${match[2]}`;
      }
    }
    return repoUrl;
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

        if (error && error.code && error.code !== 'PGRST116') { // PGRST116 is "not found"
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

  const resolvedParams = await searchParams;
  return <DocumentationPageClient repoId={resolvedParams.repoId} repos={readyRepos} />;
}
