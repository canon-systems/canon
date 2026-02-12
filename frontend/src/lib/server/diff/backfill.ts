import type { SupabaseClient } from '@supabase/supabase-js';
import { getGitHubDiffForRepo, type GitHubDiffEvent } from '@/lib/server/diff/githubDiff';
import { getJiraDiffForProject, type JiraTicketEvent } from '@/lib/server/diff/jiraDiff';
import { filterNewCanonicalEvents, insertCanonicalEvents, upsertDailyMetrics } from '@/lib/server/diff/webhookIngest';

const DEFAULT_DIFF_BACKFILL_DAYS = 7;
const MAX_DIFF_BACKFILL_DAYS = 30;
const MAX_RATE_LIMIT_RETRIES = 4;
const RATE_LIMIT_BASE_DELAY_MS = 1_500;
const RATE_LIMIT_MAX_DELAY_MS = 60_000;

type CanonicalEvent = {
  event_kind: string;
  occurred_at: string;
  entity_id?: string | null;
  repo_full_name?: string | null;
  metadata?: Record<string, unknown>;
};

export type DiffBackfillSource = {
  id: string;
  user_id: string;
  provider: string;
  scope: Record<string, unknown> | null;
};

export type DiffBackfillWindow = {
  start: string;
  end: string;
  days: number;
};

export type DiffBackfillResult = {
  source_id: string;
  provider: string;
  window: DiffBackfillWindow;
  fetched_events: number;
  inserted_events: number;
  skipped?: string;
};

function clampBackfillDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_DIFF_BACKFILL_DAYS;
  const intDays = Math.floor(days);
  if (intDays <= 0) return DEFAULT_DIFF_BACKFILL_DAYS;
  return Math.min(intDays, MAX_DIFF_BACKFILL_DAYS);
}

/**
 * Single place for backfill window sizing. For now this is static (default 7 days)
 * and can later be replaced with entitlement/plan logic without touching callers.
 */
export function resolveDiffBackfillDays(requestedDays?: number): number {
  if (Number.isFinite(requestedDays)) {
    return clampBackfillDays(requestedDays as number);
  }
  const configuredDays = Number(process.env.DIFF_BACKFILL_DAYS);
  return clampBackfillDays(configuredDays);
}

export function buildDiffBackfillWindow(days: number, now: Date = new Date()): DiffBackfillWindow {
  const boundedDays = clampBackfillDays(days);
  const endDate = Number.isNaN(now.getTime()) ? new Date() : now;
  const startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  startDate.setUTCDate(startDate.getUTCDate() - (boundedDays - 1));
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    days: boundedDays,
  };
}

function parseGithubOwnerRepo(scope: Record<string, unknown> | null): { owner: string; repo: string } | null {
  const repoValue = typeof scope?.repo === 'string' ? scope.repo.trim() : '';
  if (!repoValue) return null;

  const normalized = repoValue.replace(/\.git$/i, '');
  const fromUrl = normalized.match(/github\.com\/([^/]+)\/([^/?#]+)/i);
  if (fromUrl) {
    return { owner: fromUrl[1], repo: fromUrl[2] };
  }

  const path = normalized.replace(/^github\.com\//i, '');
  const [owner, repo] = path.split('/');
  if (!owner || !repo) return null;
  return { owner, repo };
}

function jiraWorkspaceName(projectKey?: string | null): string {
  const normalized = typeof projectKey === 'string' ? projectKey.trim() : '';
  return normalized ? `Jira:${normalized}` : 'Jira';
}

function mapGitHubEvent(event: GitHubDiffEvent, kind: CanonicalEvent['event_kind']): CanonicalEvent | null {
  if (!event.timestamp) return null;
  const fallbackEntity = event.pr_number != null ? String(event.pr_number) : null;
  const entityId = typeof event.entity_id === 'string' && event.entity_id.trim().length > 0
    ? event.entity_id
    : fallbackEntity;
  return {
    event_kind: kind,
    occurred_at: event.timestamp,
    entity_id: entityId,
    repo_full_name: event.repo || null,
    metadata: { ingest_source: 'provider_api_backfill' },
  };
}

function mapJiraTicketEvent(
  event: JiraTicketEvent,
  kind: CanonicalEvent['event_kind'],
  projectKey?: string
): CanonicalEvent | null {
  if (!event.timestamp || !event.ticket_id) return null;
  const metadata: Record<string, unknown> = { ingest_source: 'provider_api_backfill' };
  if (kind === 'ticket_moved') {
    metadata.from = event.previous_status;
    metadata.to = event.new_status;
  } else {
    metadata.status = event.new_status;
  }

  return {
    event_kind: kind,
    occurred_at: event.timestamp,
    entity_id: event.ticket_id,
    repo_full_name: jiraWorkspaceName(projectKey),
    metadata,
  };
}

function compactEvents(events: Array<CanonicalEvent | null>): CanonicalEvent[] {
  return events.filter((event): event is CanonicalEvent => Boolean(event));
}

type DailyWindow = {
  day: string;
  start: string;
  end: string;
};

type RateLimitLikeError = Error & {
  status?: number;
  retryAfter?: string | null;
  headers?: unknown;
  response?: { status?: number; headers?: unknown };
};

type RateLimitRetryEvent = {
  attempt: number;
  waitMs: number;
};

type BackfillStatusPayload = {
  status?: string;
  progress_pct?: number;
  step_label?: string;
  started_at?: string;
  finished_at?: string | null;
  window_start?: string;
  window_end?: string;
  total_days?: number;
  completed_days?: number;
  current_day?: string | null;
  error?: string | null;
  updated_at?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  if (typeof headers === 'object' && typeof (headers as { get?: unknown }).get === 'function') {
    const value = (headers as { get: (headerName: string) => string | null }).get(name);
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      if (key.toLowerCase() !== target) continue;
      if (typeof value === 'string' && value.trim().length > 0) return value;
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
  }
  return undefined;
}

function parseRetryAfterMs(value: string | undefined): number | null {
  if (!value) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return asNumber * 1000;
  }
  const asDate = Date.parse(value);
  if (!Number.isFinite(asDate)) return null;
  return Math.max(0, asDate - Date.now());
}

function parseRateLimitResetMs(value: string | undefined): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const millis = Math.round(seconds * 1000);
  return Math.max(0, millis - Date.now());
}

function extractRateLimitDelayMs(error: unknown, attempt: number): number | null {
  const err = error as RateLimitLikeError;
  const status = Number(err?.status ?? err?.response?.status);
  const message = err?.message || '';
  const headers = err?.response?.headers ?? err?.headers;

  const retryAfterMs = parseRetryAfterMs(err?.retryAfter ?? readHeader(headers, 'retry-after'));
  const resetMs = parseRateLimitResetMs(readHeader(headers, 'x-ratelimit-reset'));
  const remaining = readHeader(headers, 'x-ratelimit-remaining');
  const hasRateLimitMessage = /rate limit|too many requests|secondary rate/i.test(message);
  const rateLimited =
    status === 429 ||
    hasRateLimitMessage ||
    (status === 403 && remaining === '0') ||
    (status === 403 && !!resetMs);

  if (!rateLimited) return null;

  const fallbackMs = Math.min(RATE_LIMIT_MAX_DELAY_MS, RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt);
  const candidate = retryAfterMs ?? resetMs ?? fallbackMs;
  return Math.max(500, Math.min(RATE_LIMIT_MAX_DELAY_MS, candidate));
}

async function runWithRateLimitRetries<T>(
  taskLabel: string,
  run: () => Promise<T>,
  onRetry?: (event: RateLimitRetryEvent) => Promise<void> | void
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const delayMs = extractRateLimitDelayMs(error, attempt);
      if (delayMs === null || attempt >= MAX_RATE_LIMIT_RETRIES) {
        throw error;
      }
      console.warn('[diff/backfill] rate limited; retrying', {
        task: taskLabel,
        attempt: attempt + 1,
        wait_ms: delayMs,
      });
      if (onRetry) {
        await onRetry({ attempt: attempt + 1, waitMs: delayMs });
      }
      await sleep(delayMs);
    }
  }
}

function splitIntoDailyWindows(window: DiffBackfillWindow): DailyWindow[] {
  const startMs = Date.parse(window.start);
  const endMs = Date.parse(window.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return [];
  }

  const out: DailyWindow[] = [];
  const cursor = new Date(startMs);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= endMs) {
    const dayStartMs = cursor.getTime();
    const dayEndMs = Date.UTC(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth(),
      cursor.getUTCDate(),
      23,
      59,
      59,
      999
    );
    const boundedStart = new Date(Math.max(startMs, dayStartMs)).toISOString();
    const boundedEnd = new Date(Math.min(endMs, dayEndMs)).toISOString();
    out.push({
      day: cursor.toISOString().slice(0, 10),
      start: boundedStart,
      end: boundedEnd,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trimUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;
}

function providerName(provider: string): string {
  return provider === 'github' ? 'GitHub' : provider === 'jira' ? 'Jira' : provider;
}

function formatDayLabel(day: string): string {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function progressForDay(index: number, totalDays: number): number {
  if (totalDays <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, index / totalDays));
  return Math.round(ratio * 100);
}

async function updateBackfillStatus(params: {
  supabase: SupabaseClient;
  sourceId: string;
  patch: BackfillStatusPayload;
}): Promise<void> {
  const { supabase, sourceId, patch } = params;
  const { data: source, error: readError } = await supabase
    .from('workspace_sources')
    .select('status_payload')
    .eq('id', sourceId)
    .maybeSingle();

  if (readError) {
    console.warn('[diff/backfill] failed to read source status payload', {
      sourceId,
      error: readError.message,
    });
    return;
  }

  const statusPayload = asRecord(source?.status_payload);
  const existingBackfill = asRecord(statusPayload.backfill);
  const mergedBackfill = trimUndefined({
    ...existingBackfill,
    ...patch,
    updated_at: new Date().toISOString(),
  });

  const nextStatusPayload = {
    ...statusPayload,
    backfill: mergedBackfill,
  };

  const { error: writeError } = await supabase
    .from('workspace_sources')
    .update({
      status_payload: nextStatusPayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceId);

  if (writeError) {
    console.warn('[diff/backfill] failed to write source status payload', {
      sourceId,
      error: writeError.message,
    });
  }
}

export async function runDiffBackfillForSource(params: {
  supabase: SupabaseClient;
  source: DiffBackfillSource;
  requestedDays?: number;
  now?: Date;
}): Promise<DiffBackfillResult> {
  const { supabase, source, requestedDays, now } = params;
  const provider = source.provider.toLowerCase();
  const days = resolveDiffBackfillDays(requestedDays);
  const window = buildDiffBackfillWindow(days, now);
  const dailyWindows = splitIntoDailyWindows(window);
  const providerLabel = providerName(provider);

  if (provider !== 'github' && provider !== 'jira') {
    return {
      source_id: source.id,
      provider,
      window,
      fetched_events: 0,
      inserted_events: 0,
      skipped: 'unsupported_provider',
    };
  }

  if (dailyWindows.length === 0) {
    return {
      source_id: source.id,
      provider,
      window,
      fetched_events: 0,
      inserted_events: 0,
      skipped: 'invalid_window',
    };
  }

  let fetchedEvents = 0;
  let insertedEvents = 0;
  const totalDays = dailyWindows.length;

  const ownerRepo = provider === 'github' ? parseGithubOwnerRepo(source.scope) : null;
  if (provider === 'github' && !ownerRepo) {
    return {
      source_id: source.id,
      provider,
      window,
      fetched_events: 0,
      inserted_events: 0,
      skipped: 'missing_repo_scope',
    };
  }

  const projectKey = provider === 'jira' && typeof source.scope?.project === 'string'
    ? source.scope.project
    : undefined;
  const cloudId = provider === 'jira' && typeof source.scope?.cloudId === 'string'
    ? source.scope.cloudId
    : null;
  if (provider === 'jira' && !projectKey) {
    return {
      source_id: source.id,
      provider,
      window,
      fetched_events: 0,
      inserted_events: 0,
      skipped: 'missing_project_scope',
    };
  }

  console.log('[diff/backfill] start', {
    sourceId: source.id,
    provider,
    window_start: window.start,
    window_end: window.end,
    total_days: totalDays,
  });

  await updateBackfillStatus({
    supabase,
    sourceId: source.id,
    patch: {
      status: 'running',
      progress_pct: 0,
      step_label: `Syncing your last ${totalDays} day${totalDays === 1 ? '' : 's'} of ${providerLabel} activity...`,
      started_at: new Date().toISOString(),
      finished_at: null,
      window_start: window.start,
      window_end: window.end,
      total_days: totalDays,
      completed_days: 0,
      current_day: null,
      error: null,
    },
  });

  try {
    for (let index = 0; index < dailyWindows.length; index += 1) {
      const dailyWindow = dailyWindows[index];
      const dayLabel = formatDayLabel(dailyWindow.day);
      let events: CanonicalEvent[] = [];

      await updateBackfillStatus({
        supabase,
        sourceId: source.id,
        patch: {
          status: 'running',
          progress_pct: progressForDay(index, totalDays),
          step_label: `Syncing activity from ${dayLabel} (${index + 1} of ${totalDays})`,
          current_day: dailyWindow.day,
          completed_days: index,
        },
      });

      console.log('[diff/backfill] day start', {
        sourceId: source.id,
        provider,
        day: dailyWindow.day,
        day_index: index + 1,
        total_days: totalDays,
      });

      const onRetry = async (retryEvent: RateLimitRetryEvent) => {
        await updateBackfillStatus({
          supabase,
          sourceId: source.id,
          patch: {
            status: 'running',
            step_label: `Pausing briefly to stay within ${providerLabel} limits, then continuing...`,
            progress_pct: progressForDay(index, totalDays),
            current_day: dailyWindow.day,
            completed_days: index,
          },
        });
        console.warn('[diff/backfill] day retry scheduled', {
          sourceId: source.id,
          provider,
          day: dailyWindow.day,
          attempt: retryEvent.attempt,
          wait_ms: retryEvent.waitMs,
        });
      };

      if (provider === 'github' && ownerRepo) {
        const diff = await runWithRateLimitRetries(
          `github:${ownerRepo.owner}/${ownerRepo.repo}:${dailyWindow.day}`,
          () =>
            getGitHubDiffForRepo({
              owner: ownerRepo.owner,
              repo: ownerRepo.repo,
              start: dailyWindow.start,
              end: dailyWindow.end,
            }),
          onRetry
        );

        events = compactEvents([
          ...diff.prs_opened.map((event) => mapGitHubEvent(event, 'pr_opened')),
          ...diff.prs_merged.map((event) => mapGitHubEvent(event, 'pr_merged')),
          ...diff.prs_closed_unmerged.map((event) => mapGitHubEvent(event, 'pr_closed')),
          ...diff.commits.map((event) => mapGitHubEvent(event, 'commit')),
        ]);
      }

      if (provider === 'jira' && projectKey) {
        const diff = await runWithRateLimitRetries(
          `jira:${projectKey}:${dailyWindow.day}`,
          () =>
            getJiraDiffForProject({
              userId: source.user_id,
              projectKey,
              cloudId,
              start: dailyWindow.start,
              end: dailyWindow.end,
            }),
          onRetry
        );

        events = compactEvents([
          ...diff.tickets_moved.map((event) => mapJiraTicketEvent(event, 'ticket_moved', projectKey)),
          ...diff.tickets_completed.map((event) => mapJiraTicketEvent(event, 'ticket_completed', projectKey)),
          ...diff.tickets_regressed.map((event) => mapJiraTicketEvent(event, 'ticket_regressed', projectKey)),
          ...diff.tickets_new.map((event) => mapJiraTicketEvent(event, 'ticket_created', projectKey)),
        ]);
      }

      fetchedEvents += events.length;
      let insertedForDay = 0;

      if (events.length > 0) {
        const newEvents = await filterNewCanonicalEvents({
          supabase,
          sourceId: source.id,
          events,
        });

        if (newEvents.length > 0) {
          await insertCanonicalEvents({
            supabase,
            sourceId: source.id,
            provider,
            events: newEvents,
          });
          await upsertDailyMetrics({
            supabase,
            sourceId: source.id,
            provider,
            events: newEvents,
          });
          insertedForDay = newEvents.length;
          insertedEvents += insertedForDay;
        }
      }

      await updateBackfillStatus({
        supabase,
        sourceId: source.id,
        patch: {
          status: 'running',
          progress_pct: progressForDay(index + 1, totalDays),
          step_label:
            index + 1 === totalDays
              ? 'Finalizing your recent activity...'
              : `Synced ${index + 1} of ${totalDays} days of activity`,
          current_day: dailyWindow.day,
          completed_days: index + 1,
          error: null,
        },
      });

      console.log('[diff/backfill] day done', {
        sourceId: source.id,
        provider,
        day: dailyWindow.day,
        fetched_events: events.length,
        inserted_events: insertedForDay,
        deduped_events: Math.max(0, events.length - insertedForDay),
      });
    }

    await updateBackfillStatus({
      supabase,
      sourceId: source.id,
      patch: {
        status: 'done',
        progress_pct: 100,
        step_label: 'Recent activity is up to date.',
        current_day: null,
        completed_days: totalDays,
        finished_at: new Date().toISOString(),
        error: null,
      },
    });

    console.log('[diff/backfill] complete', {
      sourceId: source.id,
      provider,
      fetched_events: fetchedEvents,
      inserted_events: insertedEvents,
      total_days: totalDays,
    });

    return {
      source_id: source.id,
      provider,
      window,
      fetched_events: fetchedEvents,
      inserted_events: insertedEvents,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[diff/backfill] failed', {
      sourceId: source.id,
      provider,
      error: detail,
    });

    await updateBackfillStatus({
      supabase,
      sourceId: source.id,
      patch: {
        status: 'failed',
        step_label: 'History sync paused. We will retry automatically.',
        finished_at: new Date().toISOString(),
        error: 'History sync paused due to a temporary issue.',
      },
    });

    throw error;
  }
}
