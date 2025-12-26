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

  // Get all repos for enrichment
  const { data: userRepos } = await supabase
    .from('workspace_repos')
    .select('id, repo_url, name, default_branch, settings')
    .eq('workspace_id', user.id);

  // Get usage events as the source of truth for activity
  const { data: usageEvents, error: eventsError } = await supabase
    .from('usage_events')
    .select('id, event_type, metadata, created_at')
    .eq('workspace_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);


  // Build activity log entries
  const logEntries: Array<{
    id: string;
    type: 'document' | 'document_error' | 'document_regenerated' | 'document_deleted' | 'automation_execution' | 'repo_connection' | 'integration_connection' | 'integration_disconnected' | 'diagram' | 'kb_push';
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
      provider?: string;
    };
  }> = [];

  // Repo map for metadata enrichment
  const repoMap = new Map<string, any>();
  const { data: allReposData } = await supabase
    .from('workspace_repos')
    .select('id, repo_url, default_branch, name, created_at')
    .eq('workspace_id', user.id)
    .order('created_at', { ascending: false });
  
  if (allReposData) {
    allReposData.forEach(r => repoMap.set(r.id, r));
  }

  const entriesFromEvents = (usageEvents || []).map(event => {
    const meta = (event as any).metadata || {};
    const repo = meta.repo_id ? repoMap.get(meta.repo_id) : null;
    const repoName = repo?.name || (meta.repo_url ? String(meta.repo_url).split('/').pop()?.replace('.git', '') : undefined);
    const base = {
      id: event.id,
      timestamp: event.created_at,
      metadata: {
        repoUrl: meta.repo_url || repo?.repo_url || undefined,
        branch: meta.branch || repo?.default_branch || undefined,
        provider: meta.provider,
      },
    };

    switch (event.event_type) {
      case 'doc_generated':
        return {
          ...base,
          type: 'document' as const,
          title: meta.title || 'Document generated',
          message: repoName ? `Document generated from ${repoName}` : 'Document generated',
          status: 'completed',
          link: meta.doc_id ? `/edit/${meta.doc_id}` : undefined,
        };
      case 'doc_auto_published':
        return {
          ...base,
          type: 'document_regenerated' as const,
          title: meta.title || 'Document auto-published',
          message: meta.reason ? `Auto-published: ${meta.reason}` : 'Document auto-published',
          status: 'completed',
          link: meta.doc_id ? `/edit/${meta.doc_id}` : undefined,
        };
      case 'doc_deleted':
        return {
          ...base,
          type: 'document_deleted' as const,
          title: meta.title || 'Document deleted',
          message: repoName ? `Deleted document from ${repoName}` : 'Document deleted',
          status: 'completed',
          link: undefined,
        };
      case 'repo_connected': {
        return {
          ...base,
          type: 'repo_connection' as const,
          title: repoName ? `Repository Connected: ${repoName}` : 'Repository Connected',
          message: repoName ? `Connected repository ${repoName}` : 'Repository connected',
          status: 'completed',
          link: '/repos',
        };
      }
      case 'repo_disconnected': {
        return {
          ...base,
          type: 'repo_connection' as const,
          title: repoName ? `Repository Disconnected: ${repoName}` : 'Repository Disconnected',
          message: repoName ? `Disconnected repository ${repoName}` : 'Repository disconnected',
          status: 'completed',
          link: '/repos',
        };
      }
      case 'integration_connected':
        return {
          ...base,
          type: 'integration_connection' as const,
          title: `Integration Connected: ${meta.provider || 'Integration'}`,
          message: `Connected ${meta.provider || 'integration'}`,
          status: 'completed',
          link: '/integrations',
        };
      case 'integration_disconnected':
        return {
          ...base,
          type: 'integration_disconnected' as const,
          title: `Integration Disconnected: ${meta.provider || 'Integration'}`,
          message: `Disconnected ${meta.provider || 'integration'}`,
          status: 'completed',
          link: '/integrations',
        };
      case 'architecture_diagram_generated':
      case 'architecture_diagram_regenerated':
      case 'architecture_diagram_deleted':
        return {
          ...base,
          type: 'diagram' as const,
          title: repoName ? `Architecture Diagram - ${repoName}` : 'Architecture Diagram',
          message:
            event.event_type === 'architecture_diagram_generated'
              ? 'Architecture diagram generated'
              : event.event_type === 'architecture_diagram_regenerated'
                ? 'Architecture diagram updated'
                : 'Architecture diagram deleted',
          status: 'completed',
          link: meta.diagram_id ? `/architecture-diagrams/view/${meta.diagram_id}` : '/architecture-diagrams',
        };
      case 'push_to_kb':
        return {
          ...base,
          type: 'kb_push' as const,
          title: `Pushed to ${meta.provider || 'KB'}`,
          message: 'Documentation pushed to knowledge base',
          status: 'completed',
          link: meta.doc_id ? `/edit/${meta.doc_id}` : undefined,
        };
      case 'repo_scan_run':
        return {
          ...base,
          type: 'automation_execution' as const,
          title: repoName ? `Repo scan: ${repoName}` : 'Repo scan',
          message: meta.repo_url ? `Scanned ${meta.repo_url}` : 'Repository scan executed',
          status: 'completed',
          link: '/repos',
        };
      default:
        return null;
    }
  }).filter(Boolean) as typeof logEntries;

  logEntries.push(...entriesFromEvents);


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
  if (eventsError && !isTableNotFoundError(eventsError)) {
    console.error('Logs page - usage_events error:', eventsError);
  }

  const logs = {
    entries: logEntries.slice(0, 100), // Limit to 100 most recent
    errors: {
      usageEvents: eventsError && !isTableNotFoundError(eventsError)
        ? (eventsError.message || eventsError.code)
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
