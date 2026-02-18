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
    .select('id, external_url, name, scope')
    .eq('user_id', user.id);

  // Get usage events as the source of truth for activity
  const { data: usageEvents, error: eventsError } = await supabase
    .from('usage_events')
    .select('id, event_type, metadata, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  // Get schedule run summaries so curated signals are represented in logs.
  const { data: reportScheduleRuns, error: reportScheduleRunsError } = await supabase
    .from('report_schedule_runs')
    .select('id, report_schedule_id, executed_at, status, result_summary')
    .eq('user_id', user.id)
    .order('executed_at', { ascending: false })
    .limit(100);

  // Build activity log entries
  const logEntries: Array<{
    id: string;
    type:
    | 'automation_execution'
    | 'source_connection'
    | 'integration_connection'
    | 'integration_disconnected'
    | 'diagram'
    | 'kb_push'
    | 'aku_generated'
    | 'signal_curated';
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
      signalSeverity?: string;
    };
  }> = [];

  // Repo map for metadata enrichment
  const repoMap = new Map<string, { id: string; name?: string;[key: string]: unknown }>();
  if (userRepos) {
    userRepos.forEach((r) => repoMap.set(r.id, r));
  }

  const formatProviderName = (p: unknown): string => {
    if (p == null || typeof p !== 'string' || !p) return '';
    const lower = p.toLowerCase();
    if (lower === 'confluence') return 'Atlassian';
    if (lower === 'github') return 'GitHub';
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  };

  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const asStringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];

  const entriesFromEvents = (usageEvents || []).map(event => {
    const meta = (event as { metadata?: Record<string, unknown> }).metadata || {};
    const sourceIdRaw = meta.source_id || meta.repo_id;
    const sourceId = typeof sourceIdRaw === 'string' ? sourceIdRaw : null;
    const repo = sourceId ? repoMap.get(sourceId) : null;
    const repoUrl = meta.repo_url || repo?.external_url;
    const scopeBranch = repo && typeof repo.scope === 'object' && repo.scope !== null && 'branch' in repo ? (repo.scope as { branch?: string }).branch : undefined;
    const repoName = repo?.name || (repoUrl ? String(repoUrl).split('/').pop()?.replace('.git', '') : undefined);
    const base = {
      id: event.id,
      timestamp: event.created_at,
      metadata: {
        repoUrl: repoUrl ?? undefined,
        branch: meta.branch || scopeBranch || undefined,
        provider: meta.provider,
      },
    };

    switch (event.event_type) {
      case 'doc_generated':
      case 'doc_auto_published':
      case 'doc_deleted':
        return null;
      case 'repo_connected': {
        return {
          ...base,
          type: 'source_connection' as const,
          title: repoName ? `Source Connected: ${repoName}` : 'Source Connected',
          message: repoName ? `Connected source ${repoName}` : 'Source connected',
          status: 'completed',
          link: '/sources',
        };
      }
      case 'source_connected': {
        const sourceName = repoName || formatProviderName(meta.provider) || 'Source';
        return {
          ...base,
          type: 'source_connection' as const,
          title: `Source Connected: ${sourceName}`,
          message: repoName ? `Connected source ${repoName}` : `Connected ${formatProviderName(meta.provider) || 'source'}`,
          status: 'completed',
          link: '/sources',
          metadata: {
            ...(base as { metadata?: Record<string, unknown> }).metadata,
            repoUrl: typeof meta.external_url === 'string' ? meta.external_url : undefined,
          },
        };
      }
      case 'repo_disconnected': {
        const provider = typeof meta.provider === 'string' ? meta.provider : '';
        const sourceLabel = formatProviderName(provider) || repoName || 'Source';
        return {
          ...base,
          type: 'source_connection' as const,
          title: repoName ? `Source Disconnected: ${repoName}` : `Source Disconnected: ${sourceLabel}`,
          message: repoName ? `Disconnected source ${repoName}` : `Disconnected ${sourceLabel.toLowerCase()}`,
          status: 'completed',
          link: '/sources',
        };
      }
      case 'integration_connected': {
        const providerLabel = formatProviderName(meta.provider) || 'Integration';
        return {
          ...base,
          type: 'integration_connection' as const,
          title: `Integration Connected: ${providerLabel}`,
          message: `Connected ${providerLabel.toLowerCase()}`,
          status: 'completed',
          link: '/integrations',
        };
      }
      case 'integration_disconnected': {
        const providerLabel = formatProviderName(meta.provider) || 'Integration';
        return {
          ...base,
          type: 'integration_disconnected' as const,
          title: `Integration Disconnected: ${providerLabel}`,
          message: `Disconnected ${providerLabel.toLowerCase()}`,
          status: 'completed',
          link: '/integrations',
        };
      }
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
      case 'push_to_kb': {
        const kbLabel = formatProviderName(meta.provider) || 'KB';
        return {
          ...base,
          type: 'kb_push' as const,
          title: `Pushed to ${kbLabel}`,
          message: 'Canon View pushed to knowledge base',
          status: 'completed',
          link: undefined,
        };
      }
      case 'akus_generated': {
        const akusCount = typeof meta.akus_count === 'number' ? meta.akus_count : null;
        const sourceIds = Array.isArray(meta.source_ids) ? (meta.source_ids as string[]) : [];
        const sourceNames = sourceIds
          .map((id) => repoMap.get(id)?.name)
          .filter(Boolean) as string[];
        const sourceLabel = sourceNames.length > 0
          ? sourceNames.join(', ')
          : sourceIds.length > 0
            ? `${sourceIds.length} source(s)`
            : 'sources';
        return {
          ...base,
          type: 'aku_generated' as const,
          title: akusCount && akusCount > 0 ? `AKUs generated: ${akusCount}` : 'AKUs generated',
          message: akusCount && akusCount > 0 ? `${akusCount} AKU${akusCount === 1 ? '' : 's'} from ${sourceLabel}` : `Generated from ${sourceLabel}`,
          status: 'completed',
          link: '/view',
        };
      }
      case 'repo_scan_run':
        return {
          ...base,
          type: 'automation_execution' as const,
          title: repoName ? `Repo scan: ${repoName}` : 'Repo scan',
          message: meta.repo_url ? `Scanned ${meta.repo_url}` : 'Repository scan executed',
          status: 'completed',
          link: '/sources',
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
          meta.diagram_id ? `/architecture-diagrams/view/${meta.diagram_id}` : undefined;

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

  const curatedSignalRuns = (reportScheduleRuns || []).map((run) => {
    const resultSummary = asRecord((run as { result_summary?: unknown }).result_summary);
    const summaryType = typeof resultSummary.type === 'string' ? resultSummary.type : null;
    const topSignalIds = asStringArray(resultSummary.top_signal_ids);
    return {
      runId: run.id,
      scheduleId: run.report_schedule_id,
      executedAt: run.executed_at,
      status: typeof run.status === 'string' ? run.status : 'succeeded',
      summaryType,
      topSignalIds,
    };
  }).filter((run) => run.summaryType === 'signals' && run.topSignalIds.length > 0);

  let scheduleNamesById = new Map<string, string>();
  let signalById = new Map<string, { id: string; title: string; severity: string; scope_type: string; scope_id: string | null }>();
  let signalRunsError: { message?: string; code?: string } | null = null;

  const scheduleIds = Array.from(new Set(curatedSignalRuns.map((run) => run.scheduleId).filter(Boolean)));
  if (scheduleIds.length > 0) {
    const { data: schedules, error: schedulesError } = await supabase
      .from('report_schedules')
      .select('id, name')
      .eq('user_id', user.id)
      .in('id', scheduleIds);

    if (schedulesError) {
      signalRunsError = schedulesError;
    } else {
      scheduleNamesById = new Map(
        (schedules || []).map((row) => [row.id, row.name || 'Signal schedule'])
      );
    }
  }

  const curatedSignalIds = Array.from(
    new Set(curatedSignalRuns.flatMap((run) => run.topSignalIds))
  );
  if (curatedSignalIds.length > 0) {
    const { data: signals, error: signalsError } = await supabase
      .from('signals')
      .select('id, title, severity, scope_type, scope_id')
      .eq('user_id', user.id)
      .in('id', curatedSignalIds);

    if (signalsError) {
      signalRunsError = signalsError;
    } else {
      signalById = new Map(
        (signals || []).map((signal) => [
          signal.id,
          {
            id: signal.id,
            title: signal.title,
            severity: signal.severity,
            scope_type: signal.scope_type,
            scope_id: signal.scope_id,
          },
        ])
      );
    }
  }

  const curatedSignalEntries = curatedSignalRuns.flatMap((run) =>
    run.topSignalIds.map((signalId, index) => {
      const signal = signalById.get(signalId);
      const scheduleName = scheduleNamesById.get(run.scheduleId) || 'Signal schedule';
      const title = signal?.title || `Signal ${signalId}`;
      const severity = signal?.severity ? String(signal.severity) : null;
      const scope =
        signal?.scope_type === 'repo' && signal.scope_id
          ? `Repo: ${signal.scope_id}`
          : signal?.scope_type === 'aku' && signal.scope_id
            ? `AKU: ${signal.scope_id}`
            : 'Global';
      const normalizedStatus = run.status === 'failed' ? 'failed' : 'completed';

      return {
        id: `curated-signal-${run.runId}-${signalId}-${index}`,
        type: 'signal_curated' as const,
        timestamp: run.executedAt,
        title: `Curated Signal: ${title}`,
        message: [
          `Selected by ${scheduleName}`,
          severity ? `Severity: ${severity}` : null,
          `Scope: ${scope}`,
        ].filter(Boolean).join(' • '),
        status: normalizedStatus,
        link: `/signals/${signalId}`,
        metadata: {
          automationRuleId: run.scheduleId,
          signalSeverity: severity || undefined,
        },
      };
    })
  );

  logEntries.push(...curatedSignalEntries);


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
  if (reportScheduleRunsError && !isTableNotFoundError(reportScheduleRunsError)) {
    console.error('Logs page - report_schedule_runs error:', reportScheduleRunsError);
  }
  if (signalRunsError && !isTableNotFoundError(signalRunsError)) {
    console.error('Logs page - curated signal lookup error:', signalRunsError);
  }

  const logs = {
    entries: logEntries.slice(0, 100), // Limit to 100 most recent
    errors: {
      usageEvents: eventsError && !isTableNotFoundError(eventsError)
        ? (eventsError.message || eventsError.code)
        : undefined,
      automationRuns:
        (reportScheduleRunsError && !isTableNotFoundError(reportScheduleRunsError)
          ? (reportScheduleRunsError.message || reportScheduleRunsError.code)
          : undefined) ||
        (signalRunsError && !isTableNotFoundError(signalRunsError)
          ? (signalRunsError.message || signalRunsError.code)
          : undefined),
    },
  };

  return (
    <LogsPageClient
      logs={logs}
    />
  );
}
