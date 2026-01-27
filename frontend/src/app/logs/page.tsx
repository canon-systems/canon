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

  // Get all sources for enrichment
  const { data: userRepos } = await supabase
    .from('workspace_sources')
    .select('id, repo_url, external_url, name, default_branch, settings')
    .eq('user_id', user.id);

  // Get usage events as the source of truth for activity
  const { data: usageEvents, error: eventsError } = await supabase
    .from('usage_events')
    .select('id, event_type, metadata, created_at')
    .eq('user_id', user.id)
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
  const repoMap = new Map<string, { id: string; name?: string; [key: string]: unknown }>();
  if (userRepos) {
    userRepos.forEach((r) => repoMap.set(r.id, r));
  }

  const entriesFromEvents = (usageEvents || []).map(event => {
    const meta = (event as { metadata?: Record<string, unknown> }).metadata || {};
    const sourceIdRaw = meta.source_id || meta.repo_id;
    const sourceId = typeof sourceIdRaw === 'string' ? sourceIdRaw : null;
    const repo = sourceId ? repoMap.get(sourceId) : null;
    const repoName = repo?.name || (meta.repo_url ? String(meta.repo_url).split('/').pop()?.replace('.git', '') : undefined);
    const base = {
      id: event.id,
      timestamp: event.created_at,
      metadata: {
        repoUrl: meta.repo_url || repo?.repo_url || repo?.external_url || undefined,
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
      case 'automation_run': {
        const rawStatus = typeof meta.status === 'string' ? meta.status : null;
        const triggerType = typeof meta.trigger_type === 'string' ? meta.trigger_type : null;
        const skipReason = typeof meta.skip_reason === 'string' ? meta.skip_reason : null;
        const filesProcessed =
          typeof meta.files_processed === 'number'
            ? meta.files_processed
            : typeof meta.files_processed === 'string'
              ? Number(meta.files_processed)
              : null;
        const documentsUpdated =
          typeof meta.documents_updated === 'number'
            ? meta.documents_updated
            : typeof meta.documents_updated === 'string'
              ? Number(meta.documents_updated)
              : null;
        const executionTimeMs =
          typeof meta.execution_time_ms === 'number'
            ? meta.execution_time_ms
            : typeof meta.execution_time_ms === 'string'
              ? Number(meta.execution_time_ms)
              : null;
        const errorsCount =
          typeof meta.errors_count === 'number'
            ? meta.errors_count
            : typeof meta.errors_count === 'string'
              ? Number(meta.errors_count)
              : null;

        const status = rawStatus === 'failed' ? 'failed' : 'completed';
        const durationLabel =
          typeof executionTimeMs === 'number' && Number.isFinite(executionTimeMs)
            ? `${(executionTimeMs / 1000).toFixed(1)}s`
            : null;

        const detailsParts = [
          rawStatus === 'skipped'
            ? skipReason
              ? `Skipped: ${skipReason}`
              : 'Skipped'
            : rawStatus === 'failed'
              ? errorsCount && errorsCount > 0
                ? `Failed (${errorsCount} error${errorsCount === 1 ? '' : 's'})`
                : 'Failed'
              : 'Completed',
          triggerType ? `Trigger: ${triggerType}` : null,
          typeof filesProcessed === 'number' && Number.isFinite(filesProcessed) ? `${filesProcessed} file(s)` : null,
          typeof documentsUpdated === 'number' && Number.isFinite(documentsUpdated) ? `${documentsUpdated} doc(s)` : null,
          durationLabel,
        ].filter(Boolean);

        const link =
          meta.doc_id ? `/edit/${meta.doc_id}` : meta.diagram_id ? `/architecture-diagrams/view/${meta.diagram_id}` : '/automation';

        return {
          ...base,
          type: 'automation_execution' as const,
          title: repoName ? `Automation: ${repoName}` : 'Automation',
          message: detailsParts.join(' • '),
          status,
          link,
          metadata: {
            ...(base as { metadata?: Record<string, unknown> }).metadata,
            automationRuleId: meta.automation_rule_id || undefined,
            isAutomation: true,
          },
        };
      }
      default:
        return null;
    }
  }).filter(Boolean) as typeof logEntries;

  logEntries.push(...entriesFromEvents);


  // Sort by timestamp (most recent first)
  logEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Helper function to check if error is "table not found" (migration not run yet)
  const isTableNotFoundError = (error: unknown): boolean => {
    if (!error) return false;
    const message = (error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : '')) || '';
    const code = (typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '') || '';
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
      logs={logs}
    />
  );
}
