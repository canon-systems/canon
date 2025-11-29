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

  // Get all submissions with their status history
  const { data: submissions, error: submissionsError } = await supabase
    .from('submissions')
    .select('id, created_at, status, error_message, title, input_type, last_checked_at, is_outdated, source_meta')
    .order('created_at', { ascending: false })
    .limit(100);

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
    type: 'document' | 'document_error' | 'document_regenerated' | 'architecture' | 'architecture_version' | 'automation_execution';
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

  // Add submission entries
  if (submissions) {
    submissions.forEach((sub) => {
      const sourceMeta = sub.source_meta || {};
      const repoUrl = sourceMeta.repoUrl || null;
      const branch = sourceMeta.branch || null;
      const automationRuleId = sourceMeta.automation_rule_id || null;
      const isAutomation = Boolean(automationRuleId);

      // Build informative message
      let message = '';
      if (sub.error_message) {
        message = sub.error_message;
      } else {
        const statusText = sub.status === 'completed' ? 'completed' : sub.status;
        if (repoUrl) {
          const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repository';
          if (isAutomation) {
            message = `Automation rule "${automationRuleId}" generated documentation for ${repoName}${branch ? ` (${branch})` : ''}`;
          } else {
            message = `Document ${statusText} from ${repoName}${branch ? ` (${branch})` : ''}`;
          }
        } else {
          if (isAutomation) {
            message = `Automation rule "${automationRuleId}" generated documentation`;
          } else {
            message = `Document ${statusText}`;
          }
        }
      }

      // Use automation_execution type for automation-generated docs
      const entryType = isAutomation 
        ? (sub.error_message ? 'document_error' : 'automation_execution')
        : (sub.error_message ? 'document_error' : 'document');

      logEntries.push({
        id: sub.id,
        type: entryType,
        timestamp: sub.created_at,
        title: sub.title || 'Untitled Document',
        message,
        status: sub.status,
        link: `/edit/${sub.id}`,
        metadata: {
          inputType: sub.input_type || undefined,
          repoUrl: repoUrl || undefined,
          branch: branch || undefined,
          isOutdated: sub.is_outdated || false,
          automationRuleId: automationRuleId || undefined,
          isAutomation,
        },
      });

      // Add regeneration entry if updated
      if (sub.last_checked_at && sub.last_checked_at !== sub.created_at) {
        logEntries.push({
          id: `${sub.id}-regenerated`,
          type: 'document_regenerated',
          timestamp: sub.last_checked_at,
          title: sub.title || 'Untitled Document',
          message: sub.is_outdated
            ? 'Document regenerated (outdated due to code changes)'
            : 'Document regenerated with updated content',
          status: sub.status,
          link: `/edit/${sub.id}`,
          metadata: {
            inputType: sub.input_type || undefined,
            repoUrl: repoUrl || undefined,
            branch: branch || undefined,
            isOutdated: sub.is_outdated || false,
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
  if (submissionsError && !isTableNotFoundError(submissionsError)) {
    console.error('Logs page - submissions error:', submissionsError);
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
      submissions: submissionsError && !isTableNotFoundError(submissionsError)
        ? (submissionsError.message || submissionsError.code)
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
    />
  );
}

