import { createServiceRoleClient } from '@/lib/supabase/server';
import { getProviderAccessToken, withConfluenceAccessToken } from '@/lib/server/oauth/tokenStore';

type JiraWebhookRegistration = {
  webhookIds: number[];
  expirationDate?: string | null;
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
  return normalizeBaseUrl(process.env.CANON_WEBHOOK_BASE_URL || 'https://dev.usecanon.com');
}

export function buildJiraWebhookUrl(tenantId: string): string {
  return `${getJiraWebhookBaseUrl()}/api/webhooks/jira/${tenantId}`;
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
        await updateConnectionMetadata(connectionId, {
          jira_webhook_ids: retryIds,
          jira_webhook_url: webhookUrl,
          jira_webhook_jql: jqlFilter,
          jira_webhook_expires_at: approxExpiresAt,
          jira_webhook_last_refresh_at: new Date().toISOString(),
          jira_webhook_status: 'active',
          jira_webhook_error: null,
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
  await updateConnectionMetadata(connectionId, {
    jira_webhook_ids: webhookIds,
    jira_webhook_url: webhookUrl,
    jira_webhook_jql: jqlFilter,
    jira_webhook_expires_at: approxExpiresAt,
    jira_webhook_last_refresh_at: new Date().toISOString(),
    jira_webhook_status: 'active',
    jira_webhook_error: null,
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

  await updateConnectionMetadata(connectionId, {
    jira_webhook_expires_at: expirationDate,
    jira_webhook_last_refresh_at: new Date().toISOString(),
    jira_webhook_status: 'active',
    jira_webhook_error: null,
  });

  return { webhookIds, expirationDate };
}

export async function ensureJiraWebhookRegistration(connectionId: string): Promise<JiraWebhookRegistration | null> {
  const metadata = await loadConnectionMetadata(connectionId);
  const cloudIdValue = (metadata.jira_cloud_id || null) as string | null;
  if (!cloudIdValue) return null;

  const existingIds = Array.isArray(metadata.jira_webhook_ids) ? metadata.jira_webhook_ids : [];
  if (existingIds.length > 0) {
    return refreshJiraWebhooks({ connectionId, cloudId: cloudIdValue, webhookIds: existingIds });
  }

  return registerJiraWebhooks({ connectionId, cloudId: cloudIdValue, jqlFilter: metadata.jira_webhook_jql || null });
}

export async function getJiraWebhookConnectionByTenant(tenantId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
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
    return jiraCloudId === tenantId;
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
