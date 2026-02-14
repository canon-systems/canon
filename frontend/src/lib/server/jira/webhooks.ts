import { createServiceRoleClient } from '@/lib/supabase/server';
import { getProviderAccessToken, withConfluenceAccessToken } from '@/lib/server/oauth/tokenStore';

type JiraWebhookRegistration = {
  webhookIds: number[];
  expirationDate?: string | null;
};

type JiraWebhookCloudMetadata = {
  webhook_ids?: number[];
  webhook_url?: string | null;
  webhook_jql?: string | null;
  webhook_expires_at?: string | null;
  webhook_last_refresh_at?: string | null;
  webhook_status?: string | null;
  webhook_error?: string | null;
};

type JiraWebhookCloudRegistration = JiraWebhookRegistration & {
  cloudId: string;
};

type JiraWebhookMetadata = {
  jira_cloud_id?: string | null;
  jira_site_url?: string | null;
  jira_webhook_ids?: number[];
  jira_webhook_url?: string | null;
  jira_webhook_jql?: string | null;
  jira_webhook_expires_at?: string | null;
  jira_webhook_last_refresh_at?: string | null;
  jira_webhook_status?: string | null;
  jira_webhook_error?: string | null;
  jira_webhooks_by_cloud?: Record<string, JiraWebhookCloudMetadata>;
};

const DEFAULT_WEBHOOK_EVENTS = [
  'jira:issue_created',
  'jira:issue_updated',
  'jira:issue_deleted',
  'comment_created',
  'comment_updated',
];

const normalizeBaseUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/$/, '');
};

export function getJiraWebhookBaseUrl(): string {
  const configured = process.env.CANON_WEBHOOK_BASE_URL;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return normalizeBaseUrl(configured);
  }

  throw new Error(
    'Missing CANON_WEBHOOK_BASE_URL. Set it to the public base URL for this environment ' +
    '(for local development use a tunnel URL such as ngrok/cloudflared).'
  );
}

export function buildJiraWebhookUrl(tenantId: string): string {
  return `${getJiraWebhookBaseUrl()}/api/webhooks/jira/${tenantId}`;
}

const normalizeWebhookIds = (value: unknown): number[] => (
  Array.isArray(value)
    ? value
      .map((entry) => (typeof entry === 'number' ? entry : null))
      .filter((entry): entry is number => typeof entry === 'number')
    : []
);

const parseWebhookCloudMap = (
  value: unknown
): Record<string, JiraWebhookCloudMetadata> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const map = value as Record<string, unknown>;
  const out: Record<string, JiraWebhookCloudMetadata> = {};
  for (const [cloudId, raw] of Object.entries(map)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    out[cloudId] = {
      webhook_ids: normalizeWebhookIds(record.webhook_ids),
      webhook_url: typeof record.webhook_url === 'string' ? record.webhook_url : null,
      webhook_jql: typeof record.webhook_jql === 'string' ? record.webhook_jql : null,
      webhook_expires_at: typeof record.webhook_expires_at === 'string' ? record.webhook_expires_at : null,
      webhook_last_refresh_at: typeof record.webhook_last_refresh_at === 'string' ? record.webhook_last_refresh_at : null,
      webhook_status: typeof record.webhook_status === 'string' ? record.webhook_status : null,
      webhook_error: typeof record.webhook_error === 'string' ? record.webhook_error : null,
    };
  }

  return out;
};

const normalizeJql = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getCloudRegistrationFromMetadata = (
  metadata: JiraWebhookMetadata,
  cloudId: string
): JiraWebhookCloudMetadata => {
  const byCloud = parseWebhookCloudMap(metadata.jira_webhooks_by_cloud);
  const fromCloudMap = byCloud[cloudId];
  if (fromCloudMap) return fromCloudMap;

  // Legacy single-cloud metadata fallback
  if (metadata.jira_cloud_id === cloudId) {
    return {
      webhook_ids: normalizeWebhookIds(metadata.jira_webhook_ids),
      webhook_url: typeof metadata.jira_webhook_url === 'string' ? metadata.jira_webhook_url : null,
      webhook_jql: normalizeJql(metadata.jira_webhook_jql),
      webhook_expires_at: typeof metadata.jira_webhook_expires_at === 'string' ? metadata.jira_webhook_expires_at : null,
      webhook_last_refresh_at: typeof metadata.jira_webhook_last_refresh_at === 'string' ? metadata.jira_webhook_last_refresh_at : null,
      webhook_status: typeof metadata.jira_webhook_status === 'string' ? metadata.jira_webhook_status : null,
      webhook_error: typeof metadata.jira_webhook_error === 'string' ? metadata.jira_webhook_error : null,
    };
  }

  return {};
};

const buildMetadataPatchForCloud = (
  metadata: JiraWebhookMetadata,
  cloudId: string,
  cloudRegistration: JiraWebhookCloudMetadata
): JiraWebhookMetadata => {
  const byCloud = parseWebhookCloudMap(metadata.jira_webhooks_by_cloud);
  byCloud[cloudId] = cloudRegistration;

  // Keep legacy top-level fields populated so existing dashboards/debugging continue to work.
  return {
    jira_webhooks_by_cloud: byCloud,
    jira_webhook_ids: normalizeWebhookIds(cloudRegistration.webhook_ids),
    jira_webhook_url: cloudRegistration.webhook_url ?? null,
    jira_webhook_jql: normalizeJql(cloudRegistration.webhook_jql),
    jira_webhook_expires_at: cloudRegistration.webhook_expires_at ?? null,
    jira_webhook_last_refresh_at: cloudRegistration.webhook_last_refresh_at ?? null,
    jira_webhook_status: cloudRegistration.webhook_status ?? null,
    jira_webhook_error: cloudRegistration.webhook_error ?? null,
  };
};

async function upsertCloudWebhookMetadata(
  connectionId: string,
  cloudId: string,
  patch: JiraWebhookCloudMetadata
) {
  const metadata = await loadConnectionMetadata(connectionId);
  const existingCloud = getCloudRegistrationFromMetadata(metadata, cloudId);
  const mergedCloud = {
    ...existingCloud,
    ...patch,
  };
  await updateConnectionMetadata(connectionId, buildMetadataPatchForCloud(metadata, cloudId, mergedCloud));
}

async function loadConnectionMetadata(connectionId: string): Promise<JiraWebhookMetadata> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('oauth_connections')
    .select('metadata')
    .eq('connection_id', connectionId)
    .maybeSingle();

  const metadata = data?.metadata && typeof data.metadata === 'object'
    ? (data.metadata as Record<string, unknown>)
    : {};

  return metadata as JiraWebhookMetadata;
}

async function updateConnectionMetadata(connectionId: string, updates: JiraWebhookMetadata) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('oauth_connections')
    .select('metadata')
    .eq('connection_id', connectionId)
    .maybeSingle();

  const existing = data?.metadata && typeof data.metadata === 'object'
    ? (data.metadata as Record<string, unknown>)
    : {};

  await supabase
    .from('oauth_connections')
    .update({
      metadata: {
        ...existing,
        ...updates,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('connection_id', connectionId);
}

export async function markJiraWebhookError(connectionId: string, errorMessage: string) {
  await updateConnectionMetadata(connectionId, {
    jira_webhook_status: 'degraded',
    jira_webhook_error: errorMessage,
    jira_webhook_last_refresh_at: new Date().toISOString(),
  });
}

async function listRegisteredWebhooks(connectionId: string, cloudId: string) {
  const response = await withConfluenceAccessToken({
    connectionId,
    run: async (token) =>
      fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Failed to list Jira webhooks.');
    throw new Error(message);
  }

  const data = await response.json().catch(() => ({} as Record<string, unknown>));
  const values = Array.isArray(data?.values) ? (data.values as Array<Record<string, unknown>>) : [];
  return values;
}

async function deleteRegisteredWebhooks(connectionId: string, cloudId: string, webhookIds: number[]) {
  if (!webhookIds.length) return;
  const response = await withConfluenceAccessToken({
    connectionId,
    run: async (token) =>
      fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ webhookIds }),
      }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Failed to delete Jira webhooks.');
    throw new Error(message);
  }
}

async function fetchProjectKeys(connectionId: string, cloudId: string): Promise<string[]> {
  const projects: string[] = [];
  let startAt = 0;
  const maxResults = 50;

  while (startAt < 200) {
    const response = await withConfluenceAccessToken({
      connectionId,
      run: async (token) =>
        fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/search?startAt=${startAt}&maxResults=${maxResults}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }),
    });

    if (!response.ok) break;

    const data = await response.json().catch(() => ({}));
    const values = Array.isArray(data) ? data : Array.isArray(data?.values) ? data.values : [];
    for (const project of values) {
      const key = project?.key ? String(project.key) : null;
      if (key) projects.push(key);
    }

    if (Array.isArray(data)) break;
    if (values.length < maxResults || data?.isLast === true) break;
    startAt += maxResults;
  }

  return projects;
}

function quoteJqlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildProjectJqlFilter(projectKeys: string[]): string | null {
  const normalized = Array.from(
    new Set(
      projectKeys
        .map((key) => key.trim())
        .filter((key) => key.length > 0)
    )
  );
  if (!normalized.length) return null;
  return `project IN (${normalized.map((key) => quoteJqlString(key)).join(', ')})`;
}

async function loadConnectedProjectsByCloud(connectionId: string): Promise<Map<string, Set<string>>> {
  const supabase = createServiceRoleClient();

  const { data: connectionRow } = await supabase
    .from('oauth_connections')
    .select('id')
    .eq('provider', 'confluence')
    .eq('status', 'active')
    .eq('connection_id', connectionId)
    .maybeSingle();

  if (!connectionRow?.id) {
    return new Map<string, Set<string>>();
  }

  const { data: sources } = await supabase
    .from('workspace_sources')
    .select('scope')
    .eq('provider', 'jira')
    .eq('connection_id', connectionRow.id);

  const projectsByCloud = new Map<string, Set<string>>();
  for (const source of sources || []) {
    const scope = source.scope && typeof source.scope === 'object'
      ? (source.scope as Record<string, unknown>)
      : {};
    const cloudId = typeof scope.cloudId === 'string' ? scope.cloudId : null;
    const project = typeof scope.project === 'string' ? scope.project : null;
    if (!cloudId || !project) continue;
    const existing = projectsByCloud.get(cloudId) ?? new Set<string>();
    existing.add(project);
    projectsByCloud.set(cloudId, existing);
  }

  return projectsByCloud;
}

export async function registerJiraWebhooks(params: {
  connectionId: string;
  cloudId: string;
  jqlFilter?: string | null;
  events?: string[];
}): Promise<JiraWebhookRegistration> {
  const { connectionId, cloudId } = params;
  const events = params.events && params.events.length ? params.events : DEFAULT_WEBHOOK_EVENTS;
  let jqlFilter = params.jqlFilter && params.jqlFilter.trim().length > 0
    ? params.jqlFilter.trim()
    : null;

  if (!jqlFilter) {
    const projectKeys = await fetchProjectKeys(connectionId, cloudId);
    if (!projectKeys.length) {
      throw new Error('No Jira projects available for webhook registration. Please select projects first.');
    }
    const quoted = projectKeys.map((key) => `"${key}"`).join(', ');
    jqlFilter = `project IN (${quoted})`;
  }

  const webhookUrl = buildJiraWebhookUrl(cloudId);
  const payload = {
    url: webhookUrl,
    webhooks: [
      {
        events,
        jqlFilter,
        // Use null to listen to all fields; only include property filter for property events
        fieldIdsFilter: null,
        issuePropertyKeysFilter: events.some((e) => e.startsWith('issue_property_')) ? null : undefined,
      },
    ],
  };

  let response = await withConfluenceAccessToken({
    connectionId,
    run: async (token) =>
      fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Failed to register Jira webhook.');
    throw new Error(message);
  }

  let data = await response.json().catch(() => ({} as Record<string, unknown>));
  let results = Array.isArray(data?.webhookRegistrationResult)
    ? (data.webhookRegistrationResult as Array<Record<string, unknown>>)
    : [];

  const webhookIds = results
    .map((row) => (typeof row?.createdWebhookId === 'number' ? row.createdWebhookId : null))
    .filter((id): id is number => typeof id === 'number');

  if (!webhookIds.length) {
    const errors = results
      .flatMap((row) => (Array.isArray(row?.errors) ? row.errors : []))
      .join('; ');

    if (errors.includes('Only a single URL per user is allowed')) {
      console.warn('[jira/webhooks] single-url limit hit, cleaning up existing webhooks');
      const existing = await listRegisteredWebhooks(connectionId, cloudId);
      const existingIds = existing
        .map((row) => (typeof row?.id === 'number' ? row.id : null))
        .filter((id): id is number => typeof id === 'number');

      if (existingIds.length) {
        console.warn('[jira/webhooks] deleting existing webhooks', existingIds);
        await deleteRegisteredWebhooks(connectionId, cloudId, existingIds);
      }

      // Retry once after cleanup
      console.warn('[jira/webhooks] retrying registration after cleanup');
      response = await withConfluenceAccessToken({
        connectionId,
        run: async (token) =>
          fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => 'Failed to register Jira webhook after cleanup.');
        throw new Error(message);
      }

      data = await response.json().catch(() => ({} as Record<string, unknown>));
      results = Array.isArray(data?.webhookRegistrationResult)
        ? (data.webhookRegistrationResult as Array<Record<string, unknown>>)
        : [];

      const retryIds = results
        .map((row) => (typeof row?.createdWebhookId === 'number' ? row.createdWebhookId : null))
        .filter((id): id is number => typeof id === 'number');

      if (retryIds.length) {
        const approxExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await upsertCloudWebhookMetadata(connectionId, cloudId, {
          webhook_ids: retryIds,
          webhook_url: webhookUrl,
          webhook_jql: jqlFilter,
          webhook_expires_at: approxExpiresAt,
          webhook_last_refresh_at: new Date().toISOString(),
          webhook_status: 'active',
          webhook_error: null,
        });
        return { webhookIds: retryIds, expirationDate: approxExpiresAt };
      }
    }

    throw new Error(
      `Jira webhook registration returned no webhook IDs.${errors ? ` Errors: ${errors}` : ''} Payload: ${JSON.stringify(
        data
      )}`
    );
  }

  const approxExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await upsertCloudWebhookMetadata(connectionId, cloudId, {
    webhook_ids: webhookIds,
    webhook_url: webhookUrl,
    webhook_jql: jqlFilter,
    webhook_expires_at: approxExpiresAt,
    webhook_last_refresh_at: new Date().toISOString(),
    webhook_status: 'active',
    webhook_error: null,
  });

  return { webhookIds, expirationDate: approxExpiresAt };
}

export async function refreshJiraWebhooks(params: {
  connectionId: string;
  cloudId: string;
  webhookIds: number[];
}): Promise<JiraWebhookRegistration> {
  const { connectionId, cloudId, webhookIds } = params;

  if (!webhookIds.length) {
    return { webhookIds: [] };
  }

  const response = await withConfluenceAccessToken({
    connectionId,
    run: async (token) =>
      fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook/refresh`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ webhookIds }),
      }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Failed to refresh Jira webhooks.');
    throw new Error(message);
  }

  const data = await response.json().catch(() => ({} as Record<string, unknown>));
  const expirationDate = typeof data?.expirationDate === 'string'
    ? data.expirationDate
    : null;

  await upsertCloudWebhookMetadata(connectionId, cloudId, {
    webhook_expires_at: expirationDate,
    webhook_last_refresh_at: new Date().toISOString(),
    webhook_status: 'active',
    webhook_error: null,
  });

  return { webhookIds, expirationDate };
}

export async function ensureJiraWebhookRegistrationForCloud(params: {
  connectionId: string;
  cloudId: string;
  jqlFilter?: string | null;
}): Promise<JiraWebhookRegistration | null> {
  const cloudIdValue = params.cloudId.trim();
  if (!cloudIdValue) return null;

  const metadata = await loadConnectionMetadata(params.connectionId);
  const cloudMetadata = getCloudRegistrationFromMetadata(metadata, cloudIdValue);
  const requestedJql = normalizeJql(params.jqlFilter);
  const existingJql = normalizeJql(cloudMetadata.webhook_jql);
  const existingIds = normalizeWebhookIds(cloudMetadata.webhook_ids);

  const desiredJql = requestedJql ?? existingJql;

  if (existingIds.length > 0 && desiredJql && existingJql !== desiredJql) {
    try {
      await deleteRegisteredWebhooks(params.connectionId, cloudIdValue, existingIds);
    } catch (error) {
      console.warn('[jira/webhooks] failed to delete stale webhook before re-registering', {
        cloudId: cloudIdValue,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return registerJiraWebhooks({
      connectionId: params.connectionId,
      cloudId: cloudIdValue,
      jqlFilter: desiredJql,
    });
  }

  if (existingIds.length > 0) {
    return refreshJiraWebhooks({
      connectionId: params.connectionId,
      cloudId: cloudIdValue,
      webhookIds: existingIds,
    });
  }

  return registerJiraWebhooks({
    connectionId: params.connectionId,
    cloudId: cloudIdValue,
    jqlFilter: desiredJql,
  });
}

export async function ensureJiraWebhookRegistrationsForConnection(
  connectionId: string
): Promise<JiraWebhookCloudRegistration[]> {
  const metadata = await loadConnectionMetadata(connectionId);
  const existingByCloud = parseWebhookCloudMap(metadata.jira_webhooks_by_cloud);
  const cloudIds = new Set<string>(Object.keys(existingByCloud));
  if (typeof metadata.jira_cloud_id === 'string' && metadata.jira_cloud_id.trim().length > 0) {
    cloudIds.add(metadata.jira_cloud_id.trim());
  }

  const projectsByCloud = await loadConnectedProjectsByCloud(connectionId);
  for (const cloudId of projectsByCloud.keys()) {
    cloudIds.add(cloudId);
  }

  const results: JiraWebhookCloudRegistration[] = [];
  for (const cloudId of cloudIds) {
    const connectedProjects = Array.from(projectsByCloud.get(cloudId) ?? []);
    const jqlFromSources = buildProjectJqlFilter(connectedProjects);
    const existingJql = normalizeJql(getCloudRegistrationFromMetadata(metadata, cloudId).webhook_jql);
    const registration = await ensureJiraWebhookRegistrationForCloud({
      connectionId,
      cloudId,
      jqlFilter: jqlFromSources ?? existingJql,
    });

    if (registration) {
      results.push({
        cloudId,
        webhookIds: registration.webhookIds,
        expirationDate: registration.expirationDate,
      });
    }
  }

  return results;
}

export async function ensureJiraWebhookRegistration(connectionId: string): Promise<JiraWebhookRegistration | null> {
  const metadata = await loadConnectionMetadata(connectionId);
  const cloudIdValue = (metadata.jira_cloud_id || null) as string | null;
  if (!cloudIdValue) return null;

  const projectsByCloud = await loadConnectedProjectsByCloud(connectionId);
  const jql = buildProjectJqlFilter(Array.from(projectsByCloud.get(cloudIdValue) ?? []));

  return ensureJiraWebhookRegistrationForCloud({
    connectionId,
    cloudId: cloudIdValue,
    jqlFilter: jql ?? metadata.jira_webhook_jql ?? null,
  });
}

export async function getJiraWebhookConnectionByTenant(tenantId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data: sourceRow } = await supabase
    .from('workspace_sources')
    .select('connection_id')
    .eq('provider', 'jira')
    .contains('scope', { cloudId: tenantId })
    .limit(1)
    .maybeSingle();

  if (sourceRow?.connection_id) {
    const { data: connectionBySource } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('id', sourceRow.connection_id)
      .eq('provider', 'confluence')
      .eq('status', 'active')
      .maybeSingle();
    if (connectionBySource?.connection_id) {
      return connectionBySource.connection_id;
    }
  }

  const { data } = await supabase
    .from('oauth_connections')
    .select('connection_id, metadata')
    .eq('provider', 'confluence')
    .eq('status', 'active');

  const match = (data || []).find((row) => {
    const metadata = row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : {};
    const jiraCloudId = typeof metadata.jira_cloud_id === 'string' ? metadata.jira_cloud_id : null;
    const cloudId = typeof metadata.cloud_id === 'string' ? metadata.cloud_id : null;
    if (jiraCloudId === tenantId || cloudId === tenantId) {
      return true;
    }
    const byCloud = parseWebhookCloudMap(metadata.jira_webhooks_by_cloud);
    return Object.prototype.hasOwnProperty.call(byCloud, tenantId);
  });

  return match?.connection_id || null;
}

export async function getJiraCloudIdForConnection(connectionId: string): Promise<string | null> {
  const metadata = await loadConnectionMetadata(connectionId);
  return (metadata.jira_cloud_id || null) as string | null;
}

export async function getJiraAccessToken(connectionId: string): Promise<string | null> {
  return getProviderAccessToken({ provider: 'confluence', connectionId });
}
