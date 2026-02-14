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

const normalizeStatusCategory = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

const isDoneCategory = (value?: string | null) => normalizeStatusCategory(value) === 'done';

const looksLikeDone = (value?: string | null) =>
  typeof value === 'string' && /done|closed|resolved|complete|completed|shipped|released/i.test(value);

/** Date-only yyyy-MM-dd for JQL from an ISO timestamp. */
function toJqlDateOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid timestamp for Jira diff.');
  }
  return date.toISOString().slice(0, 10);
}

/** Previous calendar day in yyyy-MM-dd (for JQL; Jira interprets dates in server timezone). */
function prevDayIso(isoDate: string): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Next calendar day in yyyy-MM-dd (for JQL). */
function nextDayIso(isoDate: string): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
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

  if (!connection?.connection_id) {
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
  let cloudId = cloudIdOverride || connection.jiraCloudId || connection.cloudId || null;
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
    const jiraResource = list.find((resource: { id?: string; scopes?: string[] }) =>
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

  // JQL date literals are interpreted in Jira server timezone (Atlassian docs). Use a 1-day
  // buffer each side so we don't miss issues; we filter changelog by exact UTC window below.
  const startDate = prevDayIso(toJqlDateOnly(start));
  const endDate = nextDayIso(toJqlDateOnly(end));
  const windowClause = `updated >= "${startDate}" AND updated <= "${endDate}"`;
  // ORDER BY updated ASC so we get issues from the start of the window first; otherwise
  // (default DESC) we only get the newest and can miss older days in multi-day windows.
  const jql = projectKey
    ? `project = ${projectKey} AND ${windowClause} ORDER BY updated ASC`
    : null;

  if (!jql) {
    throw new Error('Missing Jira project.');
  }
  // Use GET /rest/api/3/search/jql (required; old /search was removed per CHANGE-2046).
  // Pagination uses nextPageToken, not startAt.
  const baseUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`;

  const tickets_moved: JiraTicketEvent[] = [];
  const tickets_completed: JiraTicketEvent[] = [];
  const tickets_regressed: JiraTicketEvent[] = [];
  const tickets_new: JiraTicketEvent[] = [];
  const dedupeLatest = (events: JiraTicketEvent[]) => {
    const byTicket = new Map<string, JiraTicketEvent>();
    for (const evt of events) {
      const prev = byTicket.get(evt.ticket_id);
      const prevTs = prev ? Date.parse(prev.timestamp) : -Infinity;
      const ts = Date.parse(evt.timestamp);
      if (!Number.isFinite(ts)) continue;
      if (ts >= prevTs) {
        byTicket.set(evt.ticket_id, evt);
      }
    }
    return Array.from(byTicket.values());
  };

  const statusCategoryMap = await getStatusCategoryMap(accessToken, cloudId);

  const maxResults = 50;
  let nextPageToken: string | undefined;
  let pageCount = 0;
  // Scale pages with window length so multi-day baselines get full coverage (single day ~20, 7 days ~100).
  const windowDays = Math.ceil((endMs - startMs + 1) / (24 * 60 * 60 * 1000));
  const maxPages = Math.min(100, 20 + 15 * Math.max(1, windowDays));

  while (pageCount < maxPages) {
    const params = new URLSearchParams({
      jql,
      maxResults: String(maxResults),
      expand: 'changelog',
      fields: 'created,status',
    });
    if (nextPageToken) params.set('nextPageToken', nextPageToken);

    const url = `${baseUrl}?${params.toString()}`;
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
      const error = new Error(message) as Error & { status?: number; retryAfter?: string | null };
      error.status = response.status;
      error.retryAfter = response.headers.get('retry-after');
      throw error;
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
          const fromIsDone = isDoneCategory(fromCategory) || (!fromCategory && looksLikeDone(previousStatus));
          const toIsDone = isDoneCategory(toCategory) || (!toCategory && looksLikeDone(newStatus));

          if (toIsDone) {
            tickets_completed.push(event);
          }

          if (fromIsDone && !toIsDone) {
            tickets_regressed.push(event);
          }
        }
      }
    }

    nextPageToken = typeof data?.nextPageToken === 'string' ? data.nextPageToken : undefined;
    pageCount += 1;
    if (data?.isLast === true || !nextPageToken) break;
  }

  return {
    projectKey,
    start,
    end,
    tickets_moved: dedupeLatest(tickets_moved),
    tickets_completed: dedupeLatest(tickets_completed),
    tickets_regressed: dedupeLatest(tickets_regressed),
    tickets_new: dedupeLatest(tickets_new),
  };
}
