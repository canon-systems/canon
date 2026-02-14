import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/server/logging';

type CanonicalEvent = {
  event_kind: string;
  occurred_at: string;
  entity_id?: string | null;
  repo_full_name?: string | null;
  metadata?: Record<string, unknown>;
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
  repos_touched: Set<string>;
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
  repos_touched: new Set(),
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
const log = createLogger('diff.webhook_ingest', {
  label: 'Webhook Ingest',
  eventLabels: {
    canonical_dedupe_query_failed: 'Canonical Dedupe Query Failed',
    raw_event_upsert_failed: 'Raw Event Upsert Failed',
    raw_event_upserted: 'Raw Event Upserted',
  },
});

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
  if (event.repo_full_name) {
    inc.repos_touched.add(event.repo_full_name);
  }
};

const normalizeReposTouched = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === 'string' && v.trim().length > 0) as string[];
  }
  if (typeof value === 'string' && value.trim().length > 0) return [value];
  return [];
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
    repo_full_name: event.repo_full_name ?? null,
    metadata: event.metadata ?? {},
  }));

  await supabase
    .from('diff_event_canonical')
    .upsert(rows, { onConflict: 'source_id,event_kind,entity_id,occurred_at' });
}

export async function upsertDailyMetrics(params: {
  supabase: SupabaseClient;
  sourceId: string;
  provider: string;
  events: CanonicalEvent[];
}) {
  const { supabase, sourceId, provider, events } = params;
  if (!events.length) return;

  const byDay = new Map<string, DailyIncrements>();
  for (const event of events) {
    const day = toUtcDay(event.occurred_at);
    const inc = byDay.get(day) ?? emptyIncrements();
    applyEventToIncrements(inc, event);
    byDay.set(day, inc);
  }

  for (const [day, inc] of byDay.entries()) {
    const { data: existing } = await supabase
      .from('diff_daily_metrics')
      .select(
        'prs_opened, prs_merged, prs_closed, commits_default, tickets_moved, tickets_completed, tickets_regressed, tickets_created, repos_touched'
      )
      .eq('source_id', sourceId)
      .eq('day', day)
      .maybeSingle();

    const existingRepos = normalizeReposTouched(existing?.repos_touched);
    const mergedRepos = Array.from(new Set([...existingRepos, ...inc.repos_touched]));

    await supabase
      .from('diff_daily_metrics')
      .upsert(
        {
          source_id: sourceId,
          day,
          provider,
          prs_opened: (existing?.prs_opened ?? 0) + inc.prs_opened,
          prs_merged: (existing?.prs_merged ?? 0) + inc.prs_merged,
          prs_closed: (existing?.prs_closed ?? 0) + inc.prs_closed,
          commits_default: (existing?.commits_default ?? 0) + inc.commits_default,
          tickets_moved: (existing?.tickets_moved ?? 0) + inc.tickets_moved,
          tickets_completed: (existing?.tickets_completed ?? 0) + inc.tickets_completed,
          tickets_regressed: (existing?.tickets_regressed ?? 0) + inc.tickets_regressed,
          tickets_created: (existing?.tickets_created ?? 0) + inc.tickets_created,
          repos_touched: mergedRepos,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'source_id,day' }
      );
  }
}

export async function resolveGithubSourceId(supabase: SupabaseClient, repoFullName: string): Promise<string | null> {
  const { data: direct } = await supabase
    .from('workspace_sources')
    .select('id, scope')
    .eq('provider', 'github')
    .contains('scope', { repo: repoFullName })
    .limit(1);

  if (direct && direct.length > 0) return direct[0].id as string;

  const { data: allSources } = await supabase
    .from('workspace_sources')
    .select('id, scope')
    .eq('provider', 'github');

  const repoLower = repoFullName.toLowerCase();
  const match = (allSources || []).find((row) => {
    const scope = (row.scope as { repo?: string }) || {};
    return typeof scope.repo === 'string' && scope.repo.toLowerCase() === repoLower;
  });

  return match ? (match.id as string) : null;
}

export async function resolveJiraSourceId(
  supabase: SupabaseClient,
  projectKey: string,
  cloudId?: string | null
): Promise<string | null> {
  const scopeFilter = cloudId ? { project: projectKey, cloudId } : { project: projectKey };
  const { data: direct } = await supabase
    .from('workspace_sources')
    .select('id, scope')
    .eq('provider', 'jira')
    .contains('scope', scopeFilter)
    .limit(1);

  if (direct && direct.length > 0) return direct[0].id as string;

  const { data: allSources } = await supabase
    .from('workspace_sources')
    .select('id, scope')
    .eq('provider', 'jira');

  const keyLower = projectKey.toLowerCase();
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
    | { number?: number; created_at?: string; merged_at?: string | null; closed_at?: string | null }
    | undefined;
  const action = typeof payload.action === 'string' ? payload.action : '';

  if (pullRequest && action) {
    if (action === 'opened') {
      events.push({
        event_kind: 'pr_opened',
        occurred_at: pullRequest.created_at || new Date().toISOString(),
        entity_id: pullRequest.number ? String(pullRequest.number) : null,
        repo_full_name: repoFullName,
      });
    }

    if (action === 'closed') {
      if (pullRequest.merged_at) {
        events.push({
          event_kind: 'pr_merged',
          occurred_at: pullRequest.merged_at,
          entity_id: pullRequest.number ? String(pullRequest.number) : null,
          repo_full_name: repoFullName,
        });
      } else if (pullRequest.closed_at) {
        events.push({
          event_kind: 'pr_closed',
          occurred_at: pullRequest.closed_at,
          entity_id: pullRequest.number ? String(pullRequest.number) : null,
          repo_full_name: repoFullName,
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
      repo_full_name: repoFullName,
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

const looksLikeDone = (value?: string | null) =>
  typeof value === 'string' && /done|closed|resolved|complete|completed|shipped|released/i.test(value);

const readOwnString = (record: Record<string, unknown>, key: string): string | null => {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return null;
  const value = record[key];
  return typeof value === 'string' ? value : null;
};

export function extractJiraCanonicalEvents(
  payload: Record<string, unknown>,
  statusCategoryMap?: Map<string, string>
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
  const status = fields.status as { name?: string; statusCategory?: { name?: string } } | undefined;
  const statusCategory = status?.statusCategory?.name || null;
  const project = fields.project as { key?: string } | undefined;
  const projectKey = typeof project?.key === 'string' ? project.key : null;
  const jiraWorkspace = projectKey ? `Jira:${projectKey}` : 'Jira';

  if (webhookEvent === 'jira:issue_created' && issueKey) {
    events.push({
      event_kind: 'ticket_created',
      occurred_at: typeof fields.created === 'string' ? fields.created : new Date().toISOString(),
      entity_id: issueKey,
      repo_full_name: jiraWorkspace,
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
    const fromCategory = fromIdForCategory ? statusCategoryMap?.get(fromIdForCategory) : undefined;
    const toCategory = toIdForCategory ? statusCategoryMap?.get(toIdForCategory) : undefined;
    const fromStatusName = readOwnString(item, 'fromString');
    const toStatusName = readOwnString(item, 'toString');
    const fromIsDone = isDoneCategory(fromCategory) || (!fromCategory && looksLikeDone(fromStatusName));
    const toIsDone =
      isDoneCategory(toCategory) ||
      (!toCategory && (looksLikeDone(toStatusName) || isDoneCategory(statusCategory)));

    events.push({
      event_kind: 'ticket_moved',
      occurred_at: changeTime,
      entity_id: issueKey,
      repo_full_name: jiraWorkspace,
      metadata: {
        from: fromStatusName,
        to: toStatusName,
        from_id: fromIdForCategory,
        to_id: toIdForCategory,
        summary,
      },
    });

    if (toIsDone) {
      events.push({
        event_kind: 'ticket_completed',
        occurred_at: changeTime,
        entity_id: issueKey,
        repo_full_name: jiraWorkspace,
        metadata: { status: status?.name || null, summary },
      });
    }

    if (fromIsDone && !toIsDone) {
      events.push({
        event_kind: 'ticket_regressed',
        occurred_at: changeTime,
        entity_id: issueKey,
        repo_full_name: jiraWorkspace,
        metadata: { status: status?.name || null, summary },
      });
    }
  }

  return events;
}
