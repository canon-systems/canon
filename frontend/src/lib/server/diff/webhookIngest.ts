import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/server/logging';

type CanonicalEvent = {
  event_kind: string;
  occurred_at: string;
  entity_id?: string | null;
  source_full_name?: string | null;
  metadata?: Record<string, unknown>;
};
type CanonicalRollupRow = {
  event_kind: string | null;
  occurred_at: string | null;
  source_full_name?: string | null;
};

type DailyIncrements = {
  prs_opened: number;
  prs_merged: number;
  prs_closed: number;
  commits_default: number;
  tickets_moved: number;
  tickets_completed: number;
  tickets_regressed: number;
  tickets_created: number;
};

const emptyIncrements = (): DailyIncrements => ({
  prs_opened: 0,
  prs_merged: 0,
  prs_closed: 0,
  commits_default: 0,
  tickets_moved: 0,
  tickets_completed: 0,
  tickets_regressed: 0,
  tickets_created: 0,
});

const toUtcDay = (value: string): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
};

const coerceIso = (value?: string | null): string => {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

const canonicalEventKey = (event: Pick<CanonicalEvent, 'event_kind' | 'entity_id' | 'occurred_at'>) =>
  `${event.event_kind}::${event.entity_id ?? ''}::${event.occurred_at}`;
const JIRA_SOURCE_PROVIDERS = ['jira', 'atlassian'] as const;
const log = createLogger('diff.webhook_ingest', {
  label: 'Webhook Ingest',
  eventLabels: {
    canonical_dedupe_query_failed: 'Canonical Dedupe Query Failed',
    canonical_event_upsert_failed: 'Canonical Event Upsert Failed',
    daily_metrics_query_failed: 'Daily Metrics Query Failed',
    daily_metrics_upsert_failed: 'Daily Metrics Upsert Failed',
    raw_event_upsert_failed: 'Raw Event Upsert Failed',
    raw_event_upserted: 'Raw Event Upserted',
  },
});

const isMissingProviderColumnError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes('provider') && normalized.includes('column');
};

export async function filterNewCanonicalEvents(params: {
  supabase: SupabaseClient;
  sourceId: string;
  events: CanonicalEvent[];
}): Promise<CanonicalEvent[]> {
  const normalized = params.events.map((event) => ({
    ...event,
    occurred_at: coerceIso(event.occurred_at),
  }));

  if (normalized.length === 0) return normalized;

  const kinds = Array.from(new Set(normalized.map((event) => event.event_kind)));
  const timestamps = normalized
    .map((event) => Date.parse(event.occurred_at))
    .filter((t) => Number.isFinite(t)) as number[];

  if (timestamps.length === 0) return [];

  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  const { data: existing, error } = await params.supabase
    .from('diff_event_canonical')
    .select('event_kind, entity_id, occurred_at')
    .eq('source_id', params.sourceId)
    .in('event_kind', kinds)
    .gte('occurred_at', new Date(minTs).toISOString())
    .lte('occurred_at', new Date(maxTs).toISOString());

  if (error) {
    log.error('canonical_dedupe_query_failed', {
      sourceId: params.sourceId,
      reason: error.message,
    });
  }

  const existingKeys = new Set(
    (existing ?? []).map((row) =>
      canonicalEventKey({
        event_kind: row.event_kind as string,
        entity_id: (row.entity_id as string | null) ?? null,
        occurred_at: coerceIso(row.occurred_at as string),
      })
    )
  );

  const seen = new Set<string>();
  return normalized.filter((event) => {
    const key = canonicalEventKey(event);
    if (existingKeys.has(key)) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const applyEventToIncrements = (inc: DailyIncrements, event: CanonicalEvent) => {
  switch (event.event_kind) {
    case 'pr_opened':
      inc.prs_opened += 1;
      break;
    case 'pr_merged':
      inc.prs_merged += 1;
      break;
    case 'pr_closed':
      inc.prs_closed += 1;
      break;
    case 'commit':
      inc.commits_default += 1;
      break;
    case 'ticket_moved':
      inc.tickets_moved += 1;
      break;
    case 'ticket_completed':
      inc.tickets_completed += 1;
      break;
    case 'ticket_regressed':
      inc.tickets_regressed += 1;
      break;
    case 'ticket_created':
      inc.tickets_created += 1;
      break;
    default:
      break;
  }
};

export async function insertRawEvent(params: {
  supabase: SupabaseClient;
  sourceId: string;
  provider: string;
  externalEventId?: string | null;
  eventType: string;
  eventTime?: string | null;
  payload: Record<string, unknown>;
}) {
  const { supabase, sourceId, provider, externalEventId, eventType, eventTime, payload } = params;
  const row = {
    source_id: sourceId,
    provider,
    external_event_id: externalEventId ?? null,
    event_type: eventType,
    event_time: eventTime ?? null,
    payload,
  };

  const query = supabase.from('diff_event_raw');
  const { error } = externalEventId
    ? await query.upsert(row, { onConflict: 'provider,external_event_id' })
    : await query.insert(row);
  if (error) {
    log.error('raw_event_upsert_failed', {
      sourceId,
      provider,
      externalEventId,
      eventType,
      reason: error.message,
    });
  } else {
    log.debug('raw_event_upserted', {
      sourceId,
      provider,
      externalEventId,
      eventType,
    });
  }
}

export async function insertCanonicalEvents(params: {
  supabase: SupabaseClient;
  sourceId: string;
  provider: string;
  events: CanonicalEvent[];
}) {
  const { supabase, sourceId, provider, events } = params;
  if (!events.length) return;

  const rows = events.map((event) => ({
    source_id: sourceId,
    provider,
    event_kind: event.event_kind,
    occurred_at: coerceIso(event.occurred_at),
    entity_id: event.entity_id ?? null,
    source_full_name: event.source_full_name ?? null,
    metadata: event.metadata ?? {},
  }));

  const { error } = await supabase
    .from('diff_event_canonical')
    .upsert(rows, { onConflict: 'source_id,event_kind,entity_id,occurred_at' });
  if (!error) return;

  // Backward-compatible fallback for installations where diff_event_canonical has no provider column.
  if (isMissingProviderColumnError(error.message)) {
    const rowsWithoutProvider = rows.map((row) => {
      const rowWithoutProvider = { ...row };
      delete (rowWithoutProvider as { provider?: string }).provider;
      return rowWithoutProvider;
    });
    const { error: fallbackError } = await supabase
      .from('diff_event_canonical')
      .upsert(rowsWithoutProvider, { onConflict: 'source_id,event_kind,entity_id,occurred_at' });
    if (!fallbackError) return;
    log.error('canonical_event_upsert_failed', {
      sourceId,
      provider,
      count: rows.length,
      reason: fallbackError.message,
    });
    throw new Error(`Failed to upsert canonical events: ${fallbackError.message}`);
  }

  log.error('canonical_event_upsert_failed', {
    sourceId,
    provider,
    count: rows.length,
    reason: error.message,
  });
  throw new Error(`Failed to upsert canonical events: ${error.message}`);
}

export async function upsertDailyMetrics(params: {
  supabase: SupabaseClient;
  sourceId: string;
  provider: string;
  events: CanonicalEvent[];
}) {
  const { supabase, sourceId, provider, events } = params;
  if (!events.length) return;

  const days = Array.from(new Set(events.map((event) => toUtcDay(event.occurred_at))));
  const dayStartIso = (day: string): string => `${day}T00:00:00.000Z`;
  const nextDayStartIso = (day: string): string => {
    const start = new Date(dayStartIso(day));
    start.setUTCDate(start.getUTCDate() + 1);
    return start.toISOString();
  };

  for (const day of days) {
    const rows: CanonicalRollupRow[] = [];
    const pageSize = 1000;
    const maxPages = 500;
    let offset = 0;
    let page = 0;

    while (page < maxPages) {
      const { data, error } = await supabase
        .from('diff_event_canonical')
        .select('event_kind, occurred_at, source_full_name')
        .eq('source_id', sourceId)
        .gte('occurred_at', dayStartIso(day))
        .lt('occurred_at', nextDayStartIso(day))
        .order('occurred_at', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        log.error('daily_metrics_query_failed', {
          sourceId,
          provider,
          day,
          reason: error.message,
        });
        throw new Error(`Failed to query canonical events for rollup: ${error.message}`);
      }
      if (!data?.length) break;
      rows.push(...(data as CanonicalRollupRow[]));
      if (data.length < pageSize) break;
      page += 1;
      offset += pageSize;
    }

    const dayInc = emptyIncrements();

    for (const row of rows) {
      const normalized: CanonicalEvent = {
        event_kind: typeof row.event_kind === 'string' ? row.event_kind : '',
        occurred_at: coerceIso(row.occurred_at),
        source_full_name: typeof row.source_full_name === 'string' ? row.source_full_name : null,
      };
      applyEventToIncrements(dayInc, normalized);
    }

    const { error: upsertError } = await supabase
      .from('diff_daily_metrics')
      .upsert(
        {
          source_id: sourceId,
          day,
          provider,
          prs_opened: dayInc.prs_opened,
          prs_merged: dayInc.prs_merged,
          prs_closed: dayInc.prs_closed,
          commits_default: dayInc.commits_default,
          tickets_moved: dayInc.tickets_moved,
          tickets_completed: dayInc.tickets_completed,
          tickets_regressed: dayInc.tickets_regressed,
          tickets_created: dayInc.tickets_created,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'source_id,day' }
      );

    if (upsertError) {
      log.error('daily_metrics_upsert_failed', {
        sourceId,
        provider,
        day,
        reason: upsertError.message,
      });
      throw new Error(`Failed to upsert daily metrics: ${upsertError.message}`);
    }
  }
}

export type GithubSourceResolution = {
  sourceId: string | null;
  strategy: 'installation_repo_id' | 'installation_only' | 'none';
};

export async function resolveGithubSourceId(
  supabase: SupabaseClient,
  params: {
    installationId?: string | number | null;
    repositoryId?: string | number | null;
  }
): Promise<GithubSourceResolution> {
  const installationId =
    params.installationId !== undefined && params.installationId !== null
      ? String(params.installationId).trim()
      : '';
  const repositoryId =
    params.repositoryId !== undefined && params.repositoryId !== null
      ? String(params.repositoryId).trim()
      : '';

  const { data: allSources } = await supabase
    .from('workspace_sources')
    .select('id, scope, source_identifier, connection_id')
    .eq('provider', 'github');

  if (!allSources || allSources.length === 0) {
    return { sourceId: null, strategy: 'none' };
  }

  const { data: activeConnections } = await supabase
    .from('oauth_connections')
    .select('id, connection_id, metadata')
    .eq('provider', 'github')
    .eq('status', 'active');

  const matchingConnectionIds = new Set<string>();
  if (installationId && activeConnections) {
    for (const row of activeConnections) {
      const metadata = row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {};
      const metadataInstallationId =
        metadata.installation_id !== undefined && metadata.installation_id !== null
          ? String(metadata.installation_id).trim()
          : '';
      const connectionInstallationId =
        row.connection_id !== undefined && row.connection_id !== null
          ? String(row.connection_id).trim()
          : '';
      if (metadataInstallationId === installationId || connectionInstallationId === installationId) {
        matchingConnectionIds.add(String(row.id));
      }
    }
  }

  const sourceRows = allSources.map((row) => {
    const scope = row.scope && typeof row.scope === 'object' ? (row.scope as Record<string, unknown>) : {};
    const scopeInstallationId =
      scope.installation_id !== undefined && scope.installation_id !== null
        ? String(scope.installation_id).trim()
        : '';
    const scopeRepoId = scope.repo_id !== undefined && scope.repo_id !== null ? String(scope.repo_id).trim() : '';
    const sourceConnectionId = row.connection_id ? String(row.connection_id) : '';
    const installationMatches = installationId
      ? (scopeInstallationId === installationId || matchingConnectionIds.has(sourceConnectionId))
      : false;
    const repositoryIdMatches = repositoryId ? scopeRepoId === repositoryId : false;
    return {
      id: String(row.id),
      installationMatches,
      repositoryIdMatches,
    };
  });

  const byInstallationAndRepo = sourceRows.find((row) => row.installationMatches && row.repositoryIdMatches);
  if (byInstallationAndRepo) {
    return { sourceId: byInstallationAndRepo.id, strategy: 'installation_repo_id' };
  }

  const byInstallationOnly = sourceRows.find((row) => row.installationMatches);
  if (byInstallationOnly) {
    return { sourceId: byInstallationOnly.id, strategy: 'installation_only' };
  }

  return { sourceId: null, strategy: 'none' };
}

export async function resolveJiraSourceId(
  supabase: SupabaseClient,
  projectKey: string,
  cloudId?: string | null
): Promise<string | null> {
  const keyLower = projectKey.trim().toLowerCase();
  if (!keyLower) return null;
  const cloudLower = typeof cloudId === 'string' ? cloudId.trim().toLowerCase() : '';
  const identifiers = cloudLower ? [`${cloudLower}:${keyLower}`, keyLower] : [keyLower];

  const { data: byIdentifier } = await supabase
    .from('workspace_sources')
    .select('id, source_identifier')
    .in('provider', [...JIRA_SOURCE_PROVIDERS])
    .in('source_identifier', identifiers)
    .limit(5);

  if (byIdentifier && byIdentifier.length > 0) {
    if (cloudLower) {
      const exact = byIdentifier.find((row) => row.source_identifier === `${cloudLower}:${keyLower}`);
      if (exact) return exact.id as string;
    }
    return byIdentifier[0].id as string;
  }

  const scopeFilter = cloudId ? { project: projectKey, cloudId } : { project: projectKey };
  const { data: direct } = await supabase
    .from('workspace_sources')
    .select('id, scope')
    .in('provider', [...JIRA_SOURCE_PROVIDERS])
    .contains('scope', scopeFilter)
    .limit(1);

  if (direct && direct.length > 0) return direct[0].id as string;

  const { data: allSources } = await supabase
    .from('workspace_sources')
    .select('id, scope')
    .in('provider', [...JIRA_SOURCE_PROVIDERS]);

  const projectMatches = (allSources || []).filter((row) => {
    const scope = (row.scope as { project?: string; cloudId?: string }) || {};
    return typeof scope.project === 'string' && scope.project.toLowerCase() === keyLower;
  });

  if (projectMatches.length === 0) return null;
  if (!cloudId) return projectMatches[0].id as string;

  const exactCloud = projectMatches.find((row) => {
    const scope = (row.scope as { cloudId?: string }) || {};
    return typeof scope.cloudId === 'string' && scope.cloudId === cloudId;
  });
  if (exactCloud) return exactCloud.id as string;

  // Legacy fallback: older Jira sources may not include cloudId in scope.
  const missingCloud = projectMatches.filter((row) => {
    const scope = (row.scope as { cloudId?: string }) || {};
    return typeof scope.cloudId !== 'string' || scope.cloudId.trim().length === 0;
  });
  if (projectMatches.length === 1) return projectMatches[0].id as string;
  if (missingCloud.length === 1) return missingCloud[0].id as string;

  return null;
}

export function extractGithubCanonicalEvents(payload: Record<string, unknown>): CanonicalEvent[] {
  const repository = payload.repository as { full_name?: string } | undefined;
  const repoFullName = repository?.full_name || null;
  const events: CanonicalEvent[] = [];

  const pullRequest = payload.pull_request as
    | {
      number?: number;
      title?: string;
      created_at?: string;
      merged_at?: string | null;
      closed_at?: string | null;
      base?: { ref?: string };
      head?: { ref?: string };
    }
    | undefined;
  const action = typeof payload.action === 'string' ? payload.action : '';
  const pullRequestTitle = typeof pullRequest?.title === 'string' ? pullRequest.title : null;
  const baseRef = typeof pullRequest?.base?.ref === 'string' ? pullRequest.base.ref : null;
  const headRef = typeof pullRequest?.head?.ref === 'string' ? pullRequest.head.ref : null;

  if (pullRequest && action) {
    if (action === 'opened') {
      events.push({
        event_kind: 'pr_opened',
        occurred_at: pullRequest.created_at || new Date().toISOString(),
        entity_id: pullRequest.number ? String(pullRequest.number) : null,
        source_full_name: repoFullName,
        metadata: {
          title: pullRequestTitle,
          from: headRef,
          to: baseRef,
          status: 'opened',
        },
      });
    }

    if (action === 'closed') {
      if (pullRequest.merged_at) {
        events.push({
          event_kind: 'pr_merged',
          occurred_at: pullRequest.merged_at,
          entity_id: pullRequest.number ? String(pullRequest.number) : null,
          source_full_name: repoFullName,
          metadata: {
            title: pullRequestTitle,
            from: headRef,
            to: baseRef,
            status: 'merged',
          },
        });
      } else if (pullRequest.closed_at) {
        events.push({
          event_kind: 'pr_closed',
          occurred_at: pullRequest.closed_at,
          entity_id: pullRequest.number ? String(pullRequest.number) : null,
          source_full_name: repoFullName,
          metadata: {
            title: pullRequestTitle,
            from: headRef,
            to: baseRef,
            status: 'closed',
          },
        });
      }
    }
  }

  const commits = Array.isArray(payload.commits) ? (payload.commits as Array<Record<string, unknown>>) : [];
  for (const commit of commits) {
    const sha = typeof commit.id === 'string' ? commit.id : null;
    const ts = typeof commit.timestamp === 'string' ? commit.timestamp : null;
    events.push({
      event_kind: 'commit',
      occurred_at: ts || new Date().toISOString(),
      entity_id: sha,
      source_full_name: repoFullName,
      metadata: {
        message: typeof commit.message === 'string' ? commit.message : null,
      },
    });
  }

  return events;
}

const normalizeStatusCategory = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

const isDoneCategory = (value?: string | null) => normalizeStatusCategory(value) === 'done';
const normalizeStatusName = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

const readOwnString = (record: Record<string, unknown>, key: string): string | null => {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return null;
  const value = record[key];
  return typeof value === 'string' ? value : null;
};

export function extractJiraCanonicalEvents(
  payload: Record<string, unknown>,
  statusCategoryLookup?: { byId: Map<string, string>; byName: Map<string, string> }
): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const webhookEvent = typeof payload.webhookEvent === 'string' ? payload.webhookEvent : '';
  const issue = payload.issue as { key?: string; fields?: Record<string, unknown> } | undefined;
  const issueKey = issue?.key || null;
  const fields = issue?.fields || {};
  const changelog = payload.changelog as {
    created?: string;
    items?: Array<Record<string, unknown>>;
    histories?: Array<{ created?: string; items?: Array<Record<string, unknown>> }>;
  } | undefined;
  const items: Array<Record<string, unknown>> = Array.isArray(changelog?.items)
    ? changelog.items
    : Array.isArray(changelog?.histories)
      ? changelog.histories.flatMap((h) => Array.isArray(h?.items) ? h.items : [])
      : [];
  const summaryFromFields = typeof fields.summary === 'string' ? fields.summary : null;
  const summaryFromChangelogItem = items.find((item) => item?.field === 'summary');
  const summaryFromChangelog =
    summaryFromChangelogItem && typeof summaryFromChangelogItem === 'object'
      ? readOwnString(summaryFromChangelogItem, 'toString')
      : null;
  const summary =
    typeof summaryFromFields === 'string'
      ? summaryFromFields
      : typeof summaryFromChangelog === 'string'
        ? summaryFromChangelog
        : null;
  const updatedAt = typeof fields.updated === 'string' ? fields.updated : null;
  const status = fields.status as {
    id?: string | number;
    name?: string;
    statusCategory?: { key?: string; name?: string };
  } | undefined;
  const statusCategory = status?.statusCategory?.key ?? status?.statusCategory?.name ?? null;
  const currentStatusId = status?.id != null ? String(status.id) : null;
  const project = fields.project as { key?: string } | undefined;
  const projectKey = typeof project?.key === 'string' ? project.key : null;
  const jiraWorkspace = projectKey ? `Jira:${projectKey}` : 'Jira';

  if (webhookEvent === 'jira:issue_created' && issueKey) {
    events.push({
      event_kind: 'ticket_created',
      occurred_at: typeof fields.created === 'string' ? fields.created : new Date().toISOString(),
      entity_id: issueKey,
      source_full_name: jiraWorkspace,
      metadata: { status: status?.name || null, summary },
    });
  }

  const statusItems = items.filter((item) => item?.field === 'status');
  const changeTime = changelog?.created || updatedAt || new Date().toISOString();

  // Deduplicate by (from, to) so each unique transition counts once (avoids double-counting from
  // multiple webhooks, duplicate changelog entries, or status+resolution in same change)
  const seenTransitions = new Set<string>();
  for (const item of statusItems) {
    const fromId = item?.from != null ? String(item.from) : '';
    const toId = item?.to != null ? String(item.to) : '';
    const transitionKey = `${fromId}::${toId}`;
    if (seenTransitions.has(transitionKey)) continue;
    seenTransitions.add(transitionKey);

    const fromIdForCategory = fromId || null;
    const toIdForCategory = toId || null;
    const fromStatusName = readOwnString(item, 'fromString');
    const toStatusName = readOwnString(item, 'toString');
    const fromCategoryById = fromIdForCategory ? statusCategoryLookup?.byId.get(fromIdForCategory) : undefined;
    const toCategoryById = toIdForCategory ? statusCategoryLookup?.byId.get(toIdForCategory) : undefined;
    const fromCategoryByName = normalizeStatusName(fromStatusName)
      ? statusCategoryLookup?.byName.get(normalizeStatusName(fromStatusName)!)
      : undefined;
    const toCategoryByName = normalizeStatusName(toStatusName)
      ? statusCategoryLookup?.byName.get(normalizeStatusName(toStatusName)!)
      : undefined;
    const toCategoryFromCurrentStatus =
      currentStatusId && toIdForCategory && currentStatusId === toIdForCategory ? statusCategory : null;
    const fromCategory = fromCategoryById ?? fromCategoryByName ?? undefined;
    const toCategory = toCategoryById ?? toCategoryByName ?? toCategoryFromCurrentStatus ?? undefined;
    const fromIsDone = isDoneCategory(fromCategory);
    const toIsDone = isDoneCategory(toCategory);

    events.push({
      event_kind: 'ticket_moved',
      occurred_at: changeTime,
      entity_id: issueKey,
      source_full_name: jiraWorkspace,
      metadata: {
        from: fromStatusName,
        to: toStatusName,
        from_id: fromIdForCategory,
        to_id: toIdForCategory,
        from_category: fromCategory ?? null,
        to_category: toCategory ?? null,
        summary,
      },
    });

    if (!fromIsDone && toIsDone) {
      events.push({
        event_kind: 'ticket_completed',
        occurred_at: changeTime,
        entity_id: issueKey,
        source_full_name: jiraWorkspace,
        metadata: {
          from: fromStatusName,
          to: toStatusName,
          from_id: fromIdForCategory,
          to_id: toIdForCategory,
          status: status?.name || null,
          summary,
        },
      });
    }

    if (fromIsDone && !toIsDone) {
      events.push({
        event_kind: 'ticket_regressed',
        occurred_at: changeTime,
        entity_id: issueKey,
        source_full_name: jiraWorkspace,
        metadata: {
          from: fromStatusName,
          to: toStatusName,
          from_id: fromIdForCategory,
          to_id: toIdForCategory,
          status: status?.name || null,
          summary,
        },
      });
    }
  }

  return events;
}
