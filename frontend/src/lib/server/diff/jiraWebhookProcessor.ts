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
type JiraStatusCategoryLookup = {
  byId: Map<string, JiraStatusCategoryName>;
  byName: Map<string, JiraStatusCategoryName>;
};

function normalizeStatusName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

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
    source_untracked: 'Source Untracked',
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
    return { byId: new Map<string, JiraStatusCategoryName>(), byName: new Map<string, JiraStatusCategoryName>() };
  }

  const data = await response.json().catch(() => []);
  const byId = new Map<string, JiraStatusCategoryName>();
  const byName = new Map<string, JiraStatusCategoryName>();
  if (Array.isArray(data)) {
    for (const status of data) {
      const id = status?.id ? String(status.id) : null;
      const name = normalizeStatusName(status?.name);
      const category = status?.statusCategory?.key ?? status?.statusCategory?.name;
      if (id && typeof category === 'string') {
        byId.set(id, category);
      }
      if (name && typeof category === 'string') {
        byName.set(name, category);
      }
    }
  }
  return { byId, byName };
}

async function getStatusCategoryById(connectionId: string, cloudId: string, statusId: string) {
  const firstResponse = await withConfluenceAccessToken({
    connectionId,
    run: async (token) =>
      fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/status/${encodeURIComponent(statusId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }),
  });
  if (firstResponse.ok) {
    const data = await firstResponse.json().catch(() => null);
    const category = data?.statusCategory?.key ?? data?.statusCategory?.name;
    const name = normalizeStatusName(data?.name);
    return {
      category: typeof category === 'string' && category.trim().length > 0 ? category : null,
      name,
    };
  }

  // Fallback endpoint for Jira variants where /status/{id} is unavailable.
  const secondResponse = await withConfluenceAccessToken({
    connectionId,
    run: async (token) =>
      fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/statuses/search?id=${encodeURIComponent(statusId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }),
  });
  if (!secondResponse.ok) return null;
  const payload = await secondResponse.json().catch(() => null);
  const values = Array.isArray(payload?.values) ? payload.values : [];
  const match = values.find((item: unknown) => {
    const id = item && typeof item === 'object' && 'id' in item ? String((item as { id?: unknown }).id) : null;
    return id === statusId;
  });
  if (!match || typeof match !== 'object') return null;
  const category = 'statusCategory' in match
    ? ((match as { statusCategory?: { key?: string; name?: string } }).statusCategory?.key
      ?? (match as { statusCategory?: { key?: string; name?: string } }).statusCategory?.name)
    : null;
  const name = normalizeStatusName('name' in match ? (match as { name?: unknown }).name : null);
  return {
    category: typeof category === 'string' && category.trim().length > 0 ? category : null,
    name,
  };
}

async function hydrateMissingStatusCategories(params: {
  connectionId: string;
  cloudId: string;
  statusCategoryLookup: JiraStatusCategoryLookup;
  statusIds: string[];
}): Promise<number> {
  const { connectionId, cloudId, statusCategoryLookup, statusIds } = params;
  const missing = Array.from(new Set(statusIds.filter((id) => id && !statusCategoryLookup.byId.has(id))));
  if (missing.length === 0) return 0;

  let hydrated = 0;
  for (const statusId of missing) {
    try {
      const resolved = await getStatusCategoryById(connectionId, cloudId, statusId);
      if (resolved?.category) {
        statusCategoryLookup.byId.set(statusId, resolved.category);
        if (resolved.name) {
          statusCategoryLookup.byName.set(resolved.name, resolved.category);
        }
        hydrated += 1;
      }
    } catch {
      // best-effort hydration; classification continues with available categories
    }
  }

  return hydrated;
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
    .select('connection_id, metadata')
    .eq('id', sourceRow.connection_id)
    .eq('provider', 'atlassian')
    .eq('status', 'active')
    .maybeSingle();

  const connectionMetadata = connectionRow?.metadata && typeof connectionRow.metadata === 'object'
    ? (connectionRow.metadata as Record<string, unknown>)
    : {};
  const metadataCloudId =
    (typeof connectionMetadata.jira_cloud_id === 'string' && connectionMetadata.jira_cloud_id.trim().length > 0
      ? connectionMetadata.jira_cloud_id
      : typeof connectionMetadata.cloud_id === 'string' && connectionMetadata.cloud_id.trim().length > 0
        ? connectionMetadata.cloud_id
        : null);

  return {
    sourceName,
    connectionId: connectionRow?.connection_id ?? null,
    cloudId: cloudId || metadataCloudId,
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
  const cloudIdFromPayload =
    typeof (payload as { cloudId?: unknown }).cloudId === 'string'
      ? (payload as { cloudId: string }).cloudId
      : null;

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
  const sourceId = await resolveJiraSourceId(supabase, projectKey, cloudIdFromPayload);
  if (!sourceId) {
    const { data: jiraSources } = await supabase
      .from('workspace_sources')
      .select('scope')
      .eq('provider', 'jira')
      .limit(25);

    const connectedProjects = (jiraSources || [])
      .map((row) => {
        const scope = row.scope && typeof row.scope === 'object'
          ? (row.scope as Record<string, unknown>)
          : {};
        const project = typeof scope.project === 'string' ? scope.project.trim().toUpperCase() : '';
        return project;
      })
      .filter((project) => project.length > 0);

    const eventFields = {
      requestId,
      projectKey,
      issueKey,
      cloudId: cloudIdFromPayload,
      connectedProjectSample: connectedProjects.slice(0, 10),
      connectedProjectCount: connectedProjects.length,
    };

    if (connectedProjects.length > 0) {
      log.info('source_untracked', eventFields);
      return { ok: true, requestId, projectKey, issueKey, skipped: 'project not connected' };
    }

    log.warn('source_missing', eventFields);
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

  let statusCategoryLookup: JiraStatusCategoryLookup | undefined;
  const changelogItems = Array.isArray((payload.changelog as { items?: unknown[] } | undefined)?.items)
    ? (payload.changelog as { items: Array<Record<string, unknown>> }).items
    : [];
  const hasStatusChange = changelogItems.some((item) => item?.field === 'status');
  if (hasStatusChange && sourceContext.connectionId && sourceContext.cloudId) {
    statusCategoryLookup = { byId: new Map(), byName: new Map() };
    try {
      statusCategoryLookup = await getStatusCategoryMap(sourceContext.connectionId, sourceContext.cloudId);
      const statusIds = changelogItems
        .filter((item) => item?.field === 'status')
        .flatMap((item) => {
          const out: string[] = [];
          if (item?.from != null) out.push(String(item.from));
          if (item?.to != null) out.push(String(item.to));
          return out;
        });
      const hydrated = await hydrateMissingStatusCategories({
        connectionId: sourceContext.connectionId,
        cloudId: sourceContext.cloudId,
        statusCategoryLookup,
        statusIds,
      });
      log.info('status_map_loaded', {
        requestId,
        sourceId,
        sourceName,
        size: statusCategoryLookup.byId.size,
        hydratedCount: hydrated,
      });
      if (statusCategoryLookup.byId.size === 0) {
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

  const canonicalEvents = extractJiraCanonicalEvents(payload, statusCategoryLookup);
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
