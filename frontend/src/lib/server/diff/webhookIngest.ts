import type { SupabaseClient } from '@supabase/supabase-js';

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
  const { data, error } = externalEventId
    ? await query.upsert(row, { onConflict: 'provider,external_event_id' })
    : await query.insert(row);
  if (error) {
    console.error('[diff_event_raw] insert failed', {
      sourceId,
      provider,
      externalEventId,
      eventType,
      error: error.message,
    });
  } else {
    console.log('[diff_event_raw] upsert ok', {
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
    await supabase.rpc('upsert_diff_daily_metrics', {
      p_source_id: sourceId,
      p_day: day,
      p_provider: provider,
      p_prs_opened: inc.prs_opened,
      p_prs_merged: inc.prs_merged,
      p_prs_closed: inc.prs_closed,
      p_commits_default: inc.commits_default,
      p_tickets_moved: inc.tickets_moved,
      p_tickets_completed: inc.tickets_completed,
      p_tickets_regressed: inc.tickets_regressed,
      p_tickets_created: inc.tickets_created,
      p_repos_touched: [...inc.repos_touched],
    });
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
  const match = (allSources || []).find((row) => {
    const scope = (row.scope as { project?: string; cloudId?: string }) || {};
    const projectMatches = typeof scope.project === 'string' && scope.project.toLowerCase() === keyLower;
    if (!projectMatches) return false;
    if (!cloudId) return true;
    return typeof scope.cloudId === 'string' && scope.cloudId === cloudId;
  });

  return match ? (match.id as string) : null;
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

const looksLikeDone = (value?: string | null) =>
  typeof value === 'string' && /done|closed|resolved/i.test(value);

export function extractJiraCanonicalEvents(
  payload: Record<string, unknown>,
  statusCategoryMap?: Map<string, string>
): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const webhookEvent = typeof payload.webhookEvent === 'string' ? payload.webhookEvent : '';
  const issue = payload.issue as { key?: string; fields?: Record<string, unknown> } | undefined;
  const issueKey = issue?.key || null;
  const fields = issue?.fields || {};
  const updatedAt = typeof fields.updated === 'string' ? fields.updated : null;
  const status = fields.status as { name?: string; statusCategory?: { name?: string } } | undefined;
  const statusCategory = status?.statusCategory?.name || null;

  if (webhookEvent === 'jira:issue_created' && issueKey) {
    events.push({
      event_kind: 'ticket_created',
      occurred_at: typeof fields.created === 'string' ? fields.created : new Date().toISOString(),
      entity_id: issueKey,
      metadata: { status: status?.name || null },
    });
  }

  const changelog = payload.changelog as { created?: string; items?: Array<Record<string, unknown>> } | undefined;
  const items = Array.isArray(changelog?.items) ? changelog?.items : [];
  const statusItems = items.filter((item) => item?.field === 'status');
  const changeTime = changelog?.created || updatedAt || new Date().toISOString();

  for (const item of statusItems) {
    const fromId = item?.from ? String(item.from) : null;
    const toId = item?.to ? String(item.to) : null;
    const fromCategory = fromId ? statusCategoryMap?.get(fromId) : undefined;
    const toCategory = toId ? statusCategoryMap?.get(toId) : undefined;
    events.push({
      event_kind: 'ticket_moved',
      occurred_at: changeTime,
      entity_id: issueKey,
      metadata: {
        from: item?.fromString ?? null,
        to: item?.toString ?? null,
        from_id: fromId,
        to_id: toId,
      },
    });

    if (toCategory === 'Done' || (statusCategory === 'Done' && !toCategory)) {
      events.push({
        event_kind: 'ticket_completed',
        occurred_at: changeTime,
        entity_id: issueKey,
        metadata: { status: status?.name || null },
      });
    }

    if (
      (fromCategory === 'Done' && toCategory && toCategory !== 'Done') ||
      (!fromCategory && looksLikeDone(item?.fromString as string | undefined) && statusCategory !== 'Done')
    ) {
      events.push({
        event_kind: 'ticket_regressed',
        occurred_at: changeTime,
        entity_id: issueKey,
        metadata: { status: status?.name || null },
      });
    }
  }

  return events;
}
