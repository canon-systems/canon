import type { SupabaseClient } from '@supabase/supabase-js';
import { withConfluenceAccessToken } from '@/lib/server/oauth/tokenStore';

type CanonicalEventRow = {
  source_id: string | null;
  event_kind: string | null;
  entity_id: string | null;
  occurred_at: string | null;
  metadata: Record<string, unknown> | null;
};

type JiraSourceContext = {
  sourceId: string;
  connectionId: string;
  cloudId: string;
};

type JiraHistoryItem = {
  field?: string;
  fromString?: string | null;
  toString?: string | null;
};

type JiraHistory = {
  created?: string;
  items?: JiraHistoryItem[];
};

type BackfillIssuePatch = {
  sourceId: string;
  eventKind: string;
  entityId: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
};

type JiraApiStatusError = Error & { status?: number };

export type JiraTicketMetadataBackfillResult = {
  scannedEvents: number;
  missingEvents: number;
  candidateSourceCount: number;
  resolvedSourceCount: number;
  unresolvedSourceIds: string[];
  fetchFailures: number;
  fetchFailureSamples: string[];
  matchedIssues: number;
  updatedEvents: number;
  skippedNoTransition: number;
  failedUpdates: number;
};

const PAGE_SIZE = 1000;
const MAX_PAGES = 500;
const ISSUE_FETCH_LIMIT = 5000;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isMissingText(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function shouldBackfillEvent(row: CanonicalEventRow): boolean {
  const kind = row.event_kind || '';
  if (!row.source_id || !row.entity_id || !row.occurred_at) return false;
  if (kind !== 'ticket_moved' && kind !== 'ticket_completed' && kind !== 'ticket_regressed') return false;
  const metadata = asObject(row.metadata);
  const missingSummary = isMissingText(metadata.summary);
  const missingFrom = isMissingText(metadata.from);
  const missingTo = isMissingText(metadata.to) && isMissingText(metadata.status);
  if (kind === 'ticket_moved') return missingSummary || missingFrom || missingTo;
  return missingSummary || missingFrom || missingTo;
}

function normalizeIso(value: string): string | null {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function pickTransitionForTimestamp(histories: JiraHistory[], occurredAt: string): { from: string | null; to: string | null } | null {
  const targetIso = normalizeIso(occurredAt);
  const targetMs = Date.parse(occurredAt);
  if (!targetIso || !Number.isFinite(targetMs)) return null;

  let exact: { from: string | null; to: string | null } | null = null;
  let nearest: { from: string | null; to: string | null; diffMs: number } | null = null;

  for (const history of histories) {
    const created = typeof history.created === 'string' ? history.created : null;
    if (!created) continue;
    const createdIso = normalizeIso(created);
    const createdMs = Date.parse(created);
    if (!createdIso || !Number.isFinite(createdMs)) continue;

    const statusItem = (history.items || []).find((item) => item?.field === 'status');
    if (!statusItem) continue;

    const from = typeof statusItem.fromString === 'string' ? statusItem.fromString : null;
    const to = typeof statusItem.toString === 'string' ? statusItem.toString : null;
    if (!from && !to) continue;

    if (createdIso === targetIso) {
      exact = { from, to };
      break;
    }

    const diffMs = Math.abs(createdMs - targetMs);
    if (!nearest || diffMs < nearest.diffMs) {
      nearest = { from, to, diffMs };
    }
  }

  if (exact) return exact;
  if (nearest && nearest.diffMs <= 120_000) {
    return { from: nearest.from, to: nearest.to };
  }
  return null;
}

async function fetchIssueSummaryAndHistories(params: {
  connectionId: string;
  cloudId: string;
  issueKey: string;
}): Promise<{ summary: string | null; histories: JiraHistory[] }> {
  const { connectionId, cloudId, issueKey } = params;
  const createStatusError = (status: number, message: string): JiraApiStatusError => {
    const error = new Error(message) as JiraApiStatusError;
    error.status = status;
    return error;
  };

  return withConfluenceAccessToken({
    connectionId,
    run: async (token) => {
      const issueResp = await fetch(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (!issueResp.ok) {
        throw createStatusError(issueResp.status, `Failed to load Jira issue ${issueKey} (status=${issueResp.status})`);
      }
      const issueJson = (await issueResp.json().catch(() => null)) as { fields?: { summary?: unknown } } | null;
      const summary = typeof issueJson?.fields?.summary === 'string' ? issueJson.fields.summary : null;

      const histories: JiraHistory[] = [];
      let startAt = 0;
      const maxResults = 100;

      for (let page = 0; page < 50; page += 1) {
        const changelogResp = await fetch(
          `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?startAt=${startAt}&maxResults=${maxResults}`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
        );
        if (!changelogResp.ok) {
          throw createStatusError(
            changelogResp.status,
            `Failed to load Jira changelog for ${issueKey} (status=${changelogResp.status})`
          );
        }
        const changelogJson = (await changelogResp.json().catch(() => null)) as {
          values?: JiraHistory[];
          total?: number;
          maxResults?: number;
          startAt?: number;
        } | null;
        const values = Array.isArray(changelogJson?.values) ? changelogJson.values : [];
        if (values.length === 0) break;
        histories.push(...values);
        const fetched = values.length;
        startAt += fetched;
        const total = typeof changelogJson?.total === 'number' ? changelogJson.total : null;
        if (fetched < maxResults) break;
        if (total !== null && startAt >= total) break;
      }

      return { summary, histories };
    },
  });
}

async function listCandidateEvents(params: {
  supabase: SupabaseClient;
  sourceIds?: string[];
}): Promise<CanonicalEventRow[]> {
  const { supabase, sourceIds } = params;
  const out: CanonicalEventRow[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = supabase
      .from('diff_event_canonical')
      .select('source_id, event_kind, entity_id, occurred_at, metadata')
      .eq('provider', 'jira')
      .in('event_kind', ['ticket_moved', 'ticket_completed', 'ticket_regressed'])
      .order('occurred_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (sourceIds && sourceIds.length > 0) {
      query = query.in('source_id', sourceIds);
    }

    const { data, error } = await query;
    if (error || !data?.length) break;
    out.push(...(data as CanonicalEventRow[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (out.length >= ISSUE_FETCH_LIMIT) break;
  }

  return out;
}

async function loadJiraSourceContexts(params: {
  supabase: SupabaseClient;
  sourceIds: string[];
}): Promise<Map<string, JiraSourceContext>> {
  const { supabase, sourceIds } = params;
  const out = new Map<string, JiraSourceContext>();
  if (sourceIds.length === 0) return out;

  const { data: rows } = await supabase
    .from('workspace_sources')
    .select('id, connection_id, scope')
    .in('id', sourceIds)
    .in('provider', ['jira', 'atlassian']);

  for (const row of rows || []) {
    const sourceId = typeof row.id === 'string' ? row.id : '';
    const connectionRowId = typeof row.connection_id === 'string' ? row.connection_id : '';
    const scope = asObject(row.scope);
    const scopeCloudId = typeof scope.cloudId === 'string' ? scope.cloudId.trim() : '';
    if (!sourceId || !connectionRowId) continue;

    const { data: conn } = await supabase
      .from('oauth_connections')
      .select('connection_id, metadata')
      .eq('provider', 'atlassian')
      .or(`id.eq.${connectionRowId},connection_id.eq.${connectionRowId}`)
      .maybeSingle();

    const externalConnectionId = typeof conn?.connection_id === 'string' ? conn.connection_id : '';
    const connMetadata = asObject(conn?.metadata);
    const metadataCloudId = typeof connMetadata.jira_cloud_id === 'string'
      ? connMetadata.jira_cloud_id.trim()
      : typeof connMetadata.cloud_id === 'string'
        ? connMetadata.cloud_id.trim()
        : '';
    const cloudId = scopeCloudId || metadataCloudId;
    if (!externalConnectionId || !cloudId) continue;

    out.set(sourceId, {
      sourceId,
      connectionId: externalConnectionId,
      cloudId,
    });
  }

  return out;
}

export async function backfillJiraTicketMetadata(params: {
  supabase: SupabaseClient;
  sourceIds?: string[];
  dryRun?: boolean;
}): Promise<JiraTicketMetadataBackfillResult> {
  const { supabase, sourceIds, dryRun = false } = params;

  const rows = await listCandidateEvents({ supabase, sourceIds });
  const missingRows = rows.filter(shouldBackfillEvent);
  const sourceIdSet = Array.from(new Set(missingRows.map((row) => row.source_id).filter((id): id is string => Boolean(id))));
  const contextBySource = await loadJiraSourceContexts({ supabase, sourceIds: sourceIdSet });
  const unresolvedSourceIds = sourceIdSet.filter((sourceId) => !contextBySource.has(sourceId));

  const grouped = new Map<string, CanonicalEventRow[]>();
  for (const row of missingRows) {
    const sourceId = row.source_id as string;
    const key = `${sourceId}::${row.entity_id}`;
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  }

  let matchedIssues = 0;
  let updatedEvents = 0;
  let skippedNoTransition = 0;
  let failedUpdates = 0;
  let fetchFailures = 0;
  const fetchFailureSamples: string[] = [];

  for (const [key, issueRows] of grouped.entries()) {
    const [sourceId, issueKey] = key.split('::');
    const context = contextBySource.get(sourceId);
    if (!context || !issueKey) {
      skippedNoTransition += issueRows.length;
      continue;
    }

    let issueData: { summary: string | null; histories: JiraHistory[] } | null = null;
    try {
      issueData = await fetchIssueSummaryAndHistories({
        connectionId: context.connectionId,
        cloudId: context.cloudId,
        issueKey,
      });
    } catch (error) {
      fetchFailures += 1;
      if (fetchFailureSamples.length < 5) {
        const message = error instanceof Error ? error.message : String(error);
        fetchFailureSamples.push(`${issueKey}: ${message}`);
      }
      skippedNoTransition += issueRows.length;
      continue;
    }

    matchedIssues += 1;
    const patches: BackfillIssuePatch[] = [];
    for (const row of issueRows) {
      const transition = pickTransitionForTimestamp(issueData.histories, row.occurred_at as string);
      if (!transition && isMissingText(asObject(row.metadata).summary)) {
        skippedNoTransition += 1;
        continue;
      }

      const existing = asObject(row.metadata);
      const nextMetadata: Record<string, unknown> = {
        ...existing,
      };
      if (isMissingText(existing.summary) && issueData.summary) {
        nextMetadata.summary = issueData.summary;
      }
      if (isMissingText(existing.from) && transition?.from) {
        nextMetadata.from = transition.from;
      }
      if (isMissingText(existing.to) && transition?.to) {
        nextMetadata.to = transition.to;
      }

      const changed = JSON.stringify(existing) !== JSON.stringify(nextMetadata);
      if (!changed) continue;

      patches.push({
        sourceId,
        eventKind: row.event_kind as string,
        entityId: row.entity_id as string,
        occurredAt: row.occurred_at as string,
        metadata: nextMetadata,
      });
    }

    for (const patch of patches) {
      if (dryRun) {
        updatedEvents += 1;
        continue;
      }
      const { error } = await supabase
        .from('diff_event_canonical')
        .update({ metadata: patch.metadata })
        .eq('source_id', patch.sourceId)
        .eq('event_kind', patch.eventKind)
        .eq('entity_id', patch.entityId)
        .eq('occurred_at', patch.occurredAt);
      if (error) {
        failedUpdates += 1;
      } else {
        updatedEvents += 1;
      }
    }
  }

  return {
    scannedEvents: rows.length,
    missingEvents: missingRows.length,
    candidateSourceCount: sourceIdSet.length,
    resolvedSourceCount: contextBySource.size,
    unresolvedSourceIds,
    fetchFailures,
    fetchFailureSamples,
    matchedIssues,
    updatedEvents,
    skippedNoTransition,
    failedUpdates,
  };
}
