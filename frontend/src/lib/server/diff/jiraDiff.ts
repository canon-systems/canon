import { getProviderAccessToken, withConfluenceAccessToken } from '@/lib/server/oauth/tokenStore';
import { createServiceRoleClient } from '@/lib/supabase/server';

export type JiraTicketEvent = {
  ticket_id: string;
  previous_status: string | null;
  new_status: string | null;
  timestamp: string;
};

export type JiraDiffResult = {
  projectKey?: string;
  start: string;
  end: string;
  tickets_moved: JiraTicketEvent[];
  tickets_completed: JiraTicketEvent[];
  tickets_regressed: JiraTicketEvent[];
  tickets_new: JiraTicketEvent[];
};

type JiraDiffParams = {
  userId: string;
  projectKey?: string;
  cloudId?: string | null;
  start: string;
  end: string;
};

type JiraStatusCategoryName = 'To Do' | 'In Progress' | 'Done' | string;

function toJqlDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid timestamp for Jira diff.');
  }
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

function inWindow(ts: string | null | undefined, start: number, end: number): boolean {
  if (!ts) return false;
  const t = Date.parse(ts);
  return Number.isFinite(t) && t >= start && t <= end;
}

async function getJiraConnection(userId: string) {
  const supabase = createServiceRoleClient();
  const { data: connection } = await supabase
    .from('oauth_connections')
    .select('connection_id, metadata')
    .eq('user_id', userId)
    .eq('provider', 'confluence')
    .eq('status', 'active')
    .maybeSingle();

  const metadata = connection?.metadata && typeof connection.metadata === 'object'
    ? (connection.metadata as Record<string, unknown>)
    : {};

  const cloudId = typeof metadata.cloud_id === 'string' ? metadata.cloud_id : null;
  const jiraCloudId = typeof metadata.jira_cloud_id === 'string' ? metadata.jira_cloud_id : null;

  if (!connection?.connection_id || !cloudId) {
    return null;
  }

  return { connectionId: connection.connection_id, cloudId, jiraCloudId };
}

async function getStatusCategoryMap(accessToken: string, cloudId: string) {
  const response = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/status`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return new Map<string, JiraStatusCategoryName>();
  }

  const data = await response.json().catch(() => []);
  const map = new Map<string, JiraStatusCategoryName>();
  if (Array.isArray(data)) {
    for (const status of data) {
      const id = status?.id ? String(status.id) : null;
      const category = status?.statusCategory?.name;
      if (id && typeof category === 'string') {
        map.set(id, category);
      }
    }
  }
  return map;
}

export async function getJiraDiffForProject(params: JiraDiffParams): Promise<JiraDiffResult> {
  const { userId, projectKey, start, end, cloudId: cloudIdOverride } = params;
  const connection = await getJiraConnection(userId);
  if (!connection) {
    throw new Error('Jira connection not found.');
  }
  let cloudId = cloudIdOverride || connection.jiraCloudId || null;
  if (!cloudId) {
    // Fallback: find a Jira-capable cloudId from accessible resources.
    const resources = await withConfluenceAccessToken({
      connectionId: connection.connectionId,
      run: async (token) =>
        fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }),
    });
    const payload = await resources.json().catch(() => []);
    const list = Array.isArray(payload) ? payload : [];
    const jiraResource = list.find((resource: any) =>
      Array.isArray(resource?.scopes) && resource.scopes.some((s: string) => s.includes('jira'))
    );
    cloudId = jiraResource?.id ? String(jiraResource.id) : null;
  }
  if (!cloudId) {
    throw new Error('Jira workspace not selected.');
  }

  const accessToken = await getProviderAccessToken({
    provider: 'confluence',
    connectionId: connection.connectionId,
  });
  if (!accessToken) {
    throw new Error('Missing Jira access token.');
  }

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error('Invalid start/end timestamps.');
  }

  const windowClause = `updated >= "${toJqlDate(start)}" AND updated <= "${toJqlDate(end)}"`;
  const jql = projectKey ? `project = ${projectKey} AND ${windowClause}` : null;

  if (!jql) {
    throw new Error('Missing Jira project.');
  }
  const baseUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`;

  const tickets_moved: JiraTicketEvent[] = [];
  const tickets_completed: JiraTicketEvent[] = [];
  const tickets_regressed: JiraTicketEvent[] = [];
  const tickets_new: JiraTicketEvent[] = [];

  const statusCategoryMap = await getStatusCategoryMap(accessToken, cloudId);

  let startAt = 0;
  const maxResults = 50;
  while (startAt < 1000) {
    const url = `${baseUrl}?jql=${encodeURIComponent(jql)}&expand=changelog&startAt=${startAt}&maxResults=${maxResults}&fields=${encodeURIComponent('created,status')}`;
    const response = await withConfluenceAccessToken({
      connectionId: connection.connectionId,
      run: async (token) =>
        fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => 'Failed to fetch Jira issues.');
      throw new Error(message);
    }

    const data = await response.json();
    const issues = Array.isArray(data?.issues) ? data.issues : [];
    if (!issues.length) break;

    for (const issue of issues) {
      const key = issue?.key ? String(issue.key) : null;
      if (!key) continue;

      const createdAt = issue?.fields?.created as string | undefined;
      if (inWindow(createdAt, startMs, endMs)) {
        tickets_new.push({
          ticket_id: key,
          previous_status: null,
          new_status: issue?.fields?.status?.name ?? null,
          timestamp: createdAt!,
        });
      }

      const histories = issue?.changelog?.histories;
      if (!Array.isArray(histories)) continue;

      for (const history of histories) {
        const historyTs = history?.created as string | undefined;
        if (!inWindow(historyTs, startMs, endMs)) continue;

        const items = Array.isArray(history?.items) ? history.items : [];
        for (const item of items) {
          if (item?.field !== 'status') continue;

          const previousStatus = item?.fromString ?? null;
          const newStatus = item?.toString ?? null;
          const fromId = item?.from ? String(item.from) : null;
          const toId = item?.to ? String(item.to) : null;

          const event: JiraTicketEvent = {
            ticket_id: key,
            previous_status: previousStatus,
            new_status: newStatus,
            timestamp: historyTs!,
          };

          tickets_moved.push(event);

          const fromCategory = fromId ? statusCategoryMap.get(fromId) : undefined;
          const toCategory = toId ? statusCategoryMap.get(toId) : undefined;

          if (toCategory === 'Done') {
            tickets_completed.push(event);
          }

          if (fromCategory === 'Done' && toCategory && toCategory !== 'Done') {
            tickets_regressed.push(event);
          }
        }
      }
    }

    if (issues.length < maxResults) break;
    startAt += maxResults;
  }

  return {
    projectKey,
    start,
    end,
    tickets_moved,
    tickets_completed,
    tickets_regressed,
    tickets_new,
  };
}
