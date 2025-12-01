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

  // Get architecture diagram updates for current user
  const { data: diagrams, error: diagramsError } = await supabase
    .from('architecture_diagrams')
    .select('id, created_at, last_updated_at, title, repo_url, branch, subdir, repo_provider')
    .eq('user_id', user.id)
    .order('last_updated_at', { ascending: false })
    .limit(50);

  // Get architecture diagram versions for current user's diagrams
  const diagramIdsForUser = diagrams?.map(d => d.id) || [];
  const { data: versions, error: versionsError } = diagramIdsForUser.length > 0
    ? await supabase
      .from('architecture_diagram_versions')
      .select('id, created_at, diagram_id, version_number, change_summary')
      .in('diagram_id', diagramIdsForUser)
      .order('created_at', { ascending: false })
      .limit(50)
    : { data: null, error: null };

  // Get diagram info for versions
  const diagramIds = versions?.map(v => v.diagram_id) || [];
  const { data: versionDiagrams } = diagramIds.length > 0
    ? await supabase
      .from('architecture_diagrams')
      .select('id, title, repo_url, branch')
      .in('id', diagramIds)
    : { data: null };

  const diagramMap = new Map(
    (versionDiagrams || []).map(d => [d.id, d])
  );

  // Build activity log entries
  const logEntries: Array<{
    id: string;
    type: 'document' | 'document_error' | 'document_regenerated' | 'architecture' | 'architecture_version' | 'automation_execution' | 'repo_connection';
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

  // Add architecture diagram entries (both created and updated)
  if (diagrams) {
    diagrams.forEach((diag) => {
      const repoName = diag.repo_url ? diag.repo_url.split('/').pop()?.replace('.git', '') || 'repository' : null;
      const branchInfo = diag.branch ? ` (${diag.branch}${diag.subdir ? `/${diag.subdir}` : ''})` : '';

      // Add creation entry
      logEntries.push({
        id: `${diag.id}-created`,
        type: 'architecture',
        timestamp: diag.created_at,
        title: diag.title,
        message: repoName
          ? `Architecture diagram created from ${repoName}${branchInfo}`
          : 'Architecture diagram created',
        link: `/architecture/${diag.id}/history`,
        metadata: {
          repoUrl: diag.repo_url || undefined,
          branch: diag.branch || undefined,
          subdir: diag.subdir || undefined,
        },
      });

      // Add update entry if updated
      if (diag.last_updated_at && diag.last_updated_at !== diag.created_at) {
        logEntries.push({
          id: `${diag.id}-updated`,
          type: 'architecture',
          timestamp: diag.last_updated_at,
          title: diag.title,
          message: repoName
            ? `Architecture diagram updated from ${repoName}${branchInfo}`
            : 'Architecture diagram updated',
          link: `/architecture/${diag.id}/history`,
          metadata: {
            repoUrl: diag.repo_url || undefined,
            branch: diag.branch || undefined,
            subdir: diag.subdir || undefined,
          },
        });
      }
    });
  }

  // Add version entries
  if (versions) {
    versions.forEach((version) => {
      const diagram = diagramMap.get(version.diagram_id);
      const diagramTitle = diagram?.title || 'Architecture Diagram';
      const repoName = diagram?.repo_url ? diagram.repo_url.split('/').pop()?.replace('.git', '') || 'repository' : null;

      logEntries.push({
        id: version.id,
        type: 'architecture_version',
        timestamp: version.created_at,
        title: `${diagramTitle} - Version ${version.version_number}`,
        message: version.change_summary || `New version ${version.version_number} created${repoName ? ` for ${repoName}` : ''}`,
        link: `/architecture/${version.diagram_id}/history`,
        metadata: {
          versionNumber: version.version_number,
          changeSummary: version.change_summary || undefined,
          repoUrl: diagram?.repo_url || undefined,
          branch: diagram?.branch || undefined,
        },
      });
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
  if (diagramsError && !isTableNotFoundError(diagramsError)) {
    console.error('Logs page - diagrams error:', diagramsError);
  }
  if (versionsError && !isTableNotFoundError(versionsError)) {
    console.error('Logs page - versions error:', versionsError);
  }

  const logs = {
    entries: logEntries.slice(0, 100), // Limit to 100 most recent
    errors: {
      // Only report errors that aren't "table not found" (migration not run)
      documents: documentsError && !isTableNotFoundError(documentsError)
        ? (documentsError.message || documentsError.code)
        : undefined,
      diagrams: diagramsError && !isTableNotFoundError(diagramsError)
        ? (diagramsError.message || diagramsError.code)
        : undefined,
      versions: versionsError && !isTableNotFoundError(versionsError)
        ? (versionsError.message || versionsError.code)
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

