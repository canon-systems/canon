import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import RepositoriesPageClient from './page-client';

export default async function RepositoriesPage() {
  const { user } = await getSession();

  if (!user) {
    redirect('/login');
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

  // Then get setup status, branch, and file summary status for each repository
  const repositoriesWithSetup = await Promise.all(
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

        // Get file summary count from repo_file_summaries
        let fileSummaryStatus: 'complete' | 'partial' | 'none' = 'none';
        let fileSummaryCount = 0;
        if (setup?.branch && repo.repo_url) {
          try {
            const normalizedRepoId = normalizeRepoId(repo.repo_url);
            const { count, error: countError } = await supabase
              .from('repo_file_summaries')
              .select('*', { count: 'exact', head: true })
              .ilike('repo_id', normalizedRepoId)
              .eq('branch', setup.branch);

            if (!countError && count !== null) {
              // Cap the summary count at total_files to ensure we never show more summaries than total files
              fileSummaryCount = Math.min(count, setup.total_files || count);
              if (setup.total_files && fileSummaryCount >= setup.total_files) {
                fileSummaryStatus = 'complete';
              } else if (fileSummaryCount > 0) {
                fileSummaryStatus = 'partial';
              }
            }
          } catch (err) {
            console.error(`Failed to get file summary count for repo ${repo.id}:`, err);
          }
        }

        return {
          ...repo,
          setup_status: setup?.setup_status || null,
          setup_branch: setup?.branch || repo.default_branch || 'main',
          file_summary_status: fileSummaryStatus,
          file_summary_count: fileSummaryCount,
          total_files: setup?.total_files || 0
        };
      } catch (err) {
        console.error(`Failed to fetch setup status for repo ${repo.id}:`, err);
        return {
          ...repo,
          setup_status: null,
          setup_branch: repo.default_branch || 'main',
          file_summary_status: 'none' as const,
          file_summary_count: 0,
          total_files: 0
        };
      }
    })
  );

  return <RepositoriesPageClient repositories={repositoriesWithSetup} />;
}
