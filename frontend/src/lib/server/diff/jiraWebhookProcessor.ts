import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  extractJiraCanonicalEvents,
  insertCanonicalEvents,
  insertRawEvent,
  filterNewCanonicalEvents,
  resolveJiraSourceId,
  upsertDailyMetrics,
} from '@/lib/server/diff/webhookIngest';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { withConfluenceAccessToken } from '@/lib/server/oauth/tokenStore';

type JiraStatusCategoryName = 'To Do' | 'In Progress' | 'Done' | string;

export type ProcessJiraWebhookPayloadParams = {
  payload: Record<string, unknown>;
  requestId?: string | null;
  webhookId?: string | null;
  rawSize?: number | null;
  signaturePresent?: boolean;
  signatureValid?: boolean;
  signatureReason?: string | null;
};

type JiraWebhookProcessResult = {
  ok: true;
  requestId?: string | null;
  projectKey?: string | null;
  issueKey?: string | null;
  sourceId?: string | null;
  sourceName?: string | null;
  canonicalEventCount?: number;
  insertedCanonicalEventCount?: number;
  skipped?: string;
};

const log = createLogger('diff.jira_webhook_processor', {
  label: 'Jira Webhook Processor',
  eventLabels: {
    process_start: 'Process Started',
    process_skipped: 'Process Skipped',
    source_resolved: 'Source Resolved',
    source_missing: 'Source Missing',
    connection_resolved: 'Connection Resolved',
    raw_event_inserted: 'Raw Event Inserted',
    raw_event_failed: 'Raw Event Failed',
    canonical_events_extracted: 'Canonical Events Extracted',
    canonical_events_inserted: 'Canonical Events Inserted',
    canonical_events_deduped: 'Canonical Events Deduped',
    status_map_loaded: 'Status Map Loaded',
    status_map_unavailable: 'Status Map Unavailable',
    status_map_failed: 'Status Map Failed',
    process_complete: 'Process Completed',
  },
});

async function getStatusCategoryMap(connectionId: string, cloudId: string) {
  const response = await withConfluenceAccessToken({
    connectionId,
    run: async (token) =>
      fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }),
  });

  if (!response.ok) {
    return new Map<string, JiraStatusCategoryName>();
  }

  const data = await response.json().catch(() => []);
  const map = new Map<string, JiraStatusCategoryName>();
  if (Array.isArray(data)) {
    for (const status of data) {
      const id = status?.id ? String(status.id) : null;
      const category = status?.statusCategory?.key ?? status?.statusCategory?.name;
      if (id && typeof category === 'string') {
        map.set(id, category);
      }
    }
  }
  return map;
}

async function getJiraSourceContext(supabase: ReturnType<typeof createServiceRoleClient>, sourceId: string) {
  const { data: sourceRow } = await supabase
    .from('workspace_sources')
    .select('name, connection_id, scope')
    .eq('id', sourceId)
    .maybeSingle();

  const scope = sourceRow?.scope && typeof sourceRow.scope === 'object'
    ? (sourceRow.scope as Record<string, unknown>)
    : {};
  const cloudId = typeof scope.cloudId === 'string' && scope.cloudId.trim().length > 0 ? scope.cloudId : null;
  const sourceName =
    typeof sourceRow?.name === 'string' && sourceRow.name.trim().length > 0
      ? sourceRow.name.trim()
      : null;

  if (!sourceRow?.connection_id) {
    return { sourceName, connectionId: null, cloudId };
  }

  const { data: connectionRow } = await supabase
    .from('oauth_connections')
    .select('connection_id')
    .eq('id', sourceRow.connection_id)
    .eq('provider', 'confluence')
    .eq('status', 'active')
    .maybeSingle();

  return {
    sourceName,
    connectionId: connectionRow?.connection_id ?? null,
    cloudId,
  };
}

export async function processJiraWebhookPayload(
  params: ProcessJiraWebhookPayloadParams
): Promise<JiraWebhookProcessResult> {
  const startedAt = Date.now();
  const { payload } = params;
  const requestId = params.requestId ?? null;

  const issue = payload.issue as { key?: string; fields?: { project?: { key?: string } } } | undefined;
  const projectKey = issue?.fields?.project?.key || null;
  const issueKey = typeof issue?.key === 'string' ? issue.key : null;
  const webhookEvent = typeof payload.webhookEvent === 'string' ? payload.webhookEvent : 'unknown';

  log.info('process_start', {
    requestId,
    webhookEvent,
    webhookId: params.webhookId ?? null,
    projectKey,
    issueKey,
    rawSize: params.rawSize ?? null,
    signaturePresent: params.signaturePresent ?? null,
    signatureValid: params.signatureValid ?? null,
    signatureReason: params.signatureReason ?? null,
  });

  if (!projectKey) {
    log.warn('process_skipped', {
      requestId,
      reason: 'missing_project_key',
      issueKey,
    });
    return { ok: true, requestId, issueKey, skipped: 'missing project key' };
  }

  const supabase = createServiceRoleClient();
  const sourceId = await resolveJiraSourceId(supabase, projectKey, null);
  if (!sourceId) {
    log.warn('source_missing', {
      requestId,
      projectKey,
      issueKey,
    });
    return { ok: true, requestId, projectKey, issueKey, skipped: 'source not found' };
  }

  const sourceContext = await getJiraSourceContext(supabase, sourceId);
  const sourceName = sourceContext.sourceName;
  log.info('source_resolved', {
    requestId,
    projectKey,
    issueKey,
    sourceId,
    sourceName,
  });

  log.info('connection_resolved', {
    requestId,
    sourceId,
    sourceName,
    hasConnectionId: Boolean(sourceContext.connectionId),
    cloudId: sourceContext.cloudId,
  });

  try {
    await insertRawEvent({
      supabase,
      sourceId,
      provider: 'jira',
      externalEventId: params.webhookId ?? null,
      eventType: webhookEvent,
      eventTime: (payload as { issue?: { fields?: { updated?: string } } }).issue?.fields?.updated || null,
      payload,
    });
    log.info('raw_event_inserted', {
      requestId,
      sourceId,
      sourceName,
      webhookEvent,
      webhookId: params.webhookId ?? null,
    });
  } catch (error) {
    log.error('raw_event_failed', {
      requestId,
      sourceId,
      sourceName,
      webhookEvent,
      webhookId: params.webhookId ?? null,
      error: errorMessage(error),
    });
  }

  let statusCategoryMap: Map<string, JiraStatusCategoryName> | undefined;
  const changelogItems = Array.isArray((payload.changelog as { items?: unknown[] } | undefined)?.items)
    ? (payload.changelog as { items: Array<Record<string, unknown>> }).items
    : [];
  const hasStatusChange = changelogItems.some((item) => item?.field === 'status');
  if (hasStatusChange && sourceContext.connectionId && sourceContext.cloudId) {
    try {
      statusCategoryMap = await getStatusCategoryMap(sourceContext.connectionId, sourceContext.cloudId);
      log.info('status_map_loaded', {
        requestId,
        sourceId,
        sourceName,
        size: statusCategoryMap.size,
      });
      if (statusCategoryMap.size === 0) {
        log.warn('status_map_unavailable', {
          requestId,
          sourceId,
          sourceName,
          cloudId: sourceContext.cloudId,
          hasConnectionId: Boolean(sourceContext.connectionId),
        });
      }
    } catch (error) {
      log.warn('status_map_failed', {
        requestId,
        sourceId,
        sourceName,
        error: errorMessage(error),
      });
    }
  }

  const canonicalEvents = extractJiraCanonicalEvents(payload, statusCategoryMap);
  log.info('canonical_events_extracted', {
    requestId,
    sourceId,
    sourceName,
    projectKey,
    issueKey,
    count: canonicalEvents.length,
    eventKinds: canonicalEvents.map((event) => event.event_kind),
  });

  let insertedCanonicalEventCount = 0;
  if (canonicalEvents.length > 0) {
    const newEvents = await filterNewCanonicalEvents({ supabase, sourceId, events: canonicalEvents });
    if (newEvents.length > 0) {
      insertedCanonicalEventCount = newEvents.length;
      await insertCanonicalEvents({ supabase, sourceId, provider: 'jira', events: newEvents });
      await upsertDailyMetrics({ supabase, sourceId, provider: 'jira', events: newEvents });
      log.info('canonical_events_inserted', {
        requestId,
        sourceId,
        sourceName,
        insertedCount: insertedCanonicalEventCount,
      });
    } else {
      log.info('canonical_events_deduped', {
        requestId,
        sourceId,
        sourceName,
        dedupedCount: canonicalEvents.length,
      });
    }
  }

  const durationMs = Date.now() - startedAt;
  log.info('process_complete', {
    requestId,
    sourceId,
    sourceName,
    projectKey,
    issueKey,
    durationMs,
    canonicalEventCount: canonicalEvents.length,
    insertedCanonicalEventCount,
  });

  return {
    ok: true,
    requestId,
    projectKey,
    issueKey,
    sourceId,
    sourceName,
    canonicalEventCount: canonicalEvents.length,
    insertedCanonicalEventCount,
  };
}
