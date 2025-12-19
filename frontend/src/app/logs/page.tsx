import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { LogsPageClient } from './page-client';

export default async function LogsPage() {
  const { session, user } = await getSession();

  if (!session) {
    redirect('/login');
  }

  const supabase = await createClient();

  // Get all repos for automation data
  const { data: userRepos } = await supabase
    .from('workspace_repos')
    .select('id, repo_url, name, default_branch, settings')
    .eq('workspace_id', user.id);

  const repoIds = userRepos?.map(r => r.id) || [];
  const { data: documents, error: documentsError } = repoIds.length > 0
    ? await supabase
      .from('documents')
      .select('id, created_at, updated_at, title, repo_id')
      .in('repo_id', repoIds)
    .order('created_at', { ascending: false })
      .limit(100)
    : { data: null, error: null };


  // Build activity log entries
  const logEntries: Array<{
    id: string;
    type: 'document' | 'document_error' | 'document_regenerated' | 'automation_execution' | 'repo_connection';
    timestamp: string;
    title: string;
    message: string;
    status?: string;
    link?: string;
    metadata?: {
      inputType?: string;
      repoUrl?: string;
      branch?: string;
      subdir?: string;
      isOutdated?: boolean;
      versionNumber?: number;
      changeSummary?: string;
      automationRuleId?: string;
      isAutomation?: boolean;
    };
  }> = [];

  // Get repo details for documents and activity logging
  const repoMap = new Map();
  const { data: allReposData } = await supabase
    .from('workspace_repos')
    .select('id, repo_url, default_branch, name, created_at')
    .eq('workspace_id', user.id)
    .order('created_at', { ascending: false });
  
  if (allReposData) {
    allReposData.forEach(r => repoMap.set(r.id, r));
  }

  // Add repo connection entries
  if (allReposData) {
    allReposData.forEach((repo) => {
      const repoName = repo.repo_url ? repo.repo_url.split('/').pop()?.replace('.git', '') || 'repository' : repo.name || 'Repository';
      const branchInfo = repo.default_branch ? ` (${repo.default_branch})` : '';

      logEntries.push({
        id: `repo-${repo.id}`,
        type: 'repo_connection',
        timestamp: repo.created_at,
        title: `Repository Connected: ${repoName}`,
        message: `Connected repository ${repoName}${branchInfo}`,
        status: 'completed',
        link: `/repos`,
        metadata: {
          repoUrl: repo.repo_url || undefined,
          branch: repo.default_branch || undefined,
        },
      });
    });
  }

  // Add document entries
  if (documents) {
    documents.forEach((doc) => {
      const repo = repoMap.get(doc.repo_id);
      const repoUrl = repo?.repo_url || null;
      const branch = repo?.default_branch || null;

      // Build informative message
      const message = repoUrl
        ? `Document created from ${repoUrl.split('/').pop()?.replace('.git', '') || 'repository'}${branch ? ` (${branch})` : ''}`
        : 'Document created';

      logEntries.push({
        id: doc.id,
        type: 'document',
        timestamp: doc.created_at,
        title: doc.title || 'Untitled Document',
        message,
        status: 'completed',
        link: `/edit/${doc.id}`,
        metadata: {
          repoUrl: repoUrl || undefined,
          branch: branch || undefined,
        },
      });

      // Add regeneration entry if updated
      if (doc.updated_at && doc.updated_at !== doc.created_at) {
        logEntries.push({
          id: `${doc.id}-regenerated`,
          type: 'document_regenerated',
          timestamp: doc.updated_at,
          title: doc.title || 'Untitled Document',
          message: 'Document regenerated with updated content',
          status: 'completed',
          link: `/edit/${doc.id}`,
          metadata: {
            repoUrl: repoUrl || undefined,
            branch: branch || undefined,
          },
        });
      }
    });
  }


  // Sort by timestamp (most recent first)
  logEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Helper function to check if error is "table not found" (migration not run yet)
  const isTableNotFoundError = (error: any): boolean => {
    if (!error) return false;
    const message = error.message || '';
    const code = error.code || '';
    return (
      message.includes("Could not find the table") ||
      message.includes("relation") && message.includes("does not exist") ||
      code === '42P01' // PostgreSQL error code for "relation does not exist"
    );
  };

  // Log errors for debugging (except table not found errors)
  if (documentsError && !isTableNotFoundError(documentsError)) {
    console.error('Logs page - documents error:', documentsError);
  }

  const logs = {
    entries: logEntries.slice(0, 100), // Limit to 100 most recent
    errors: {
      // Only report errors that aren't "table not found" (migration not run)
      documents: documentsError && !isTableNotFoundError(documentsError)
        ? (documentsError.message || documentsError.code)
        : undefined,
    },
  };

  return (
    <LogsPageClient
      user={user}
      logs={logs}
      repos={userRepos || []}
    />
  );
}

