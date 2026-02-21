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
type JiraStatusCategoryLookup = {
  byId: Map<string, JiraStatusCategoryName>;
  byName: Map<string, JiraStatusCategoryName>;
};

const normalizeStatusName = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeStatusCategory = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

const isDoneCategory = (value?: string | null) => normalizeStatusCategory(value) === 'done';

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
    .eq('provider', 'atlassian')
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
    return { byId: new Map<string, JiraStatusCategoryName>(), byName: new Map<string, JiraStatusCategoryName>() };
  }

  const data = await response.json().catch(() => []);
  const byId = new Map<string, JiraStatusCategoryName>();
  const byName = new Map<string, JiraStatusCategoryName>();
  if (Array.isArray(data)) {
    for (const status of data) {
      const id = status?.id ? String(status.id) : null;
      const name = normalizeStatusName(typeof status?.name === 'string' ? status.name : null);
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

async function getStatusCategoryById(
  accessToken: string,
  cloudId: string,
  statusId: string
): Promise<{ category: string | null; name: string | null } | null> {
  const firstResponse = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/status/${encodeURIComponent(statusId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (firstResponse.ok) {
    const data = await firstResponse.json().catch(() => null);
    const category = data?.statusCategory?.key ?? data?.statusCategory?.name;
    return {
      category: typeof category === 'string' && category.trim().length > 0 ? category : null,
      name: normalizeStatusName(typeof data?.name === 'string' ? data.name : null),
    };
  }

  const secondResponse = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/statuses/search?id=${encodeURIComponent(statusId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
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
  return {
    category: typeof category === 'string' && category.trim().length > 0 ? category : null,
    name: normalizeStatusName('name' in match ? String((match as { name?: unknown }).name ?? '') : null),
  };
}

async function hydrateMissingStatusCategories(params: {
  accessToken: string;
  cloudId: string;
  statusCategoryLookup: JiraStatusCategoryLookup;
  statusIds: string[];
}): Promise<void> {
  const { accessToken, cloudId, statusCategoryLookup, statusIds } = params;
  const missing = Array.from(new Set(statusIds.filter((id) => id && !statusCategoryLookup.byId.has(id))));
  for (const statusId of missing) {
    try {
      const resolved = await getStatusCategoryById(accessToken, cloudId, statusId);
      if (resolved?.category) {
        statusCategoryLookup.byId.set(statusId, resolved.category);
        if (resolved.name) {
          statusCategoryLookup.byName.set(resolved.name, resolved.category);
        }
      }
    } catch {
      // best-effort hydration; classification continues with available categories
    }
  }
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
    provider: 'atlassian',
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

  const statusCategoryLookup = await getStatusCategoryMap(accessToken, cloudId);

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

      const statusIds = histories.flatMap((history) => {
        const items = Array.isArray(history?.items) ? history.items : [];
        return items
          .filter((item) => item?.field === 'status')
          .flatMap((item) => {
            const out: string[] = [];
            if (item?.from != null) out.push(String(item.from));
            if (item?.to != null) out.push(String(item.to));
            return out;
          });
      });
      await hydrateMissingStatusCategories({
        accessToken,
        cloudId,
        statusCategoryLookup,
        statusIds,
      });

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

          const fromCategoryById = fromId ? statusCategoryLookup.byId.get(fromId) : undefined;
          const toCategoryById = toId ? statusCategoryLookup.byId.get(toId) : undefined;
          const fromCategoryByName = normalizeStatusName(previousStatus)
            ? statusCategoryLookup.byName.get(normalizeStatusName(previousStatus)!)
            : undefined;
          const toCategoryByName = normalizeStatusName(newStatus)
            ? statusCategoryLookup.byName.get(normalizeStatusName(newStatus)!)
            : undefined;
          const fromCategory = fromCategoryById ?? fromCategoryByName;
          const toCategory = toCategoryById ?? toCategoryByName;
          const fromIsDone = isDoneCategory(fromCategory);
          const toIsDone = isDoneCategory(toCategory);

          if (!fromIsDone && toIsDone) {
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
