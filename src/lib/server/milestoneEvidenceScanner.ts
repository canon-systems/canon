import type { SupabaseClient } from '@supabase/supabase-js';
import { slackReviewTargetsForHire } from '@/lib/onboarding/manager-communication';
import type {
  MilestoneCheckOutcome,
  MilestoneCheckTrigger,
} from '@/lib/onboarding/milestone-checks';
import { rampDayFromStartDate } from '@/lib/onboarding/rampDay';
import {
  pickCurrentMilestoneForEvidenceScan,
  normalizeMilestoneProgressStatus,
} from '@/lib/onboarding/milestone-ramp';
import { createLogger } from '@/lib/server/logging';
import { recordMilestoneEvidence, syncAccessReadinessEvidence } from '@/lib/server/milestoneEvidence';
import { matchMilestoneEvidence, type MilestoneEvidenceMatch } from '@/lib/server/milestoneEvidenceMatcher';
import type { ReadinessSourceEventRow } from '@/lib/server/readiness/source-events';
import type { MilestoneEvidenceRequirement, RampMilestone } from '@/types/onboarding';

type DbClient = SupabaseClient;

type HireRow = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role: string;
  slack_user_id: string | null;
  manager_name: string | null;
  manager_email: string | null;
  manager_slack_user_id: string | null;
  manager_chat_provider: string | null;
  manager_chat_target_id: string | null;
  start_date: string;
  status: string;
};

type ProgressRow = {
  milestone_id: string;
  status: string | null;
  first_briefed_at: string | null;
};

type DeliveryRow = {
  milestone_id: string | null;
};

type HireScanResult = {
  checked: number;
  matches: number;
  failed: number;
  milestoneId: string | null;
  outcome: MilestoneCheckOutcome;
  sourcesChecked: string[];
  sourceEventIds: string[];
  activityChecked: number;
  summary: string;
};

export type MilestoneEvidenceMatcher = typeof matchMilestoneEvidence;

const log = createLogger('server.milestone_evidence_scanner', {
  label: 'Milestone Evidence Scanner',
  eventLabels: {
    scan_start: 'Scan Started',
    scan_complete: 'Scan Complete',
    hire_skipped: 'Hire Skipped',
    evidence_match_recorded: 'Evidence Match Recorded',
    evidence_match_failed: 'Evidence Match Failed',
  },
  componentColor: 'orange',
});

const EVENT_LOOKBACK_DAYS = 14;
const EVENT_SCAN_LIMIT = 80;

function dateMs(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function eventTime(event: ReadinessSourceEventRow) {
  return dateMs(event.occurred_at) ?? dateMs(event.created_at) ?? 0;
}

function scanSince(progress: ProgressRow | null) {
  const now = Date.now();
  const fallback = now - EVENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const briefedAt = dateMs(progress?.first_briefed_at);
  return briefedAt ? Math.max(fallback, briefedAt - 2 * 60 * 60 * 1000) : fallback;
}

function isSourceEvidenceMilestone(milestone: RampMilestone) {
  const requirements = (milestone.evidence_requirements ?? []) as MilestoneEvidenceRequirement[];
  if (requirements.length === 0) return true;
  return requirements.some((requirement) => requirement.type !== 'access_readiness');
}

function slackMessageUrl(metadata: Record<string, unknown>) {
  const channelId = typeof metadata.channel_id === 'string' ? metadata.channel_id : null;
  if (!channelId) return null;
  const params = new URLSearchParams({ channel: channelId });
  if (typeof metadata.message_ts === 'string') params.set('message_ts', metadata.message_ts);
  return `https://slack.com/app_redirect?${params.toString()}`;
}

function sourceUrlForEvent(event: ReadinessSourceEventRow) {
  const metadata = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
    ? event.metadata
    : {};
  if (typeof metadata.source_url === 'string' && metadata.source_url.trim()) return metadata.source_url.trim();
  if (typeof metadata.url === 'string' && metadata.url.trim()) return metadata.url.trim();
  return slackMessageUrl(metadata);
}

function evidenceSourceEventId(eventId: string) {
  return `readiness-source-event:${eventId}`;
}

export function excludeReviewedSourceEvents(params: {
  events: ReadinessSourceEventRow[];
  evidenceSourceEventIds: Array<string | null>;
  checkedSourceEventIds: string[];
}) {
  const reviewed = new Set(params.evidenceSourceEventIds.filter((id): id is string => Boolean(id)));
  for (const eventId of params.checkedSourceEventIds) reviewed.add(evidenceSourceEventId(eventId));
  return params.events.filter((event) => !reviewed.has(evidenceSourceEventId(event.id)));
}

async function loadRecentSourceEvents(params: {
  supabase: DbClient;
  organizationId: string;
  sinceMs: number;
}) {
  const { data, error } = await params.supabase
    .from('readiness_source_events')
    .select('*')
    .eq('organization_id', params.organizationId)
    .neq('status', 'ignored')
    .in('source_type', ['team_chat', 'transcript'])
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(EVENT_SCAN_LIMIT);

  if (error) throw error;
  return ((data ?? []) as ReadinessSourceEventRow[]).filter((event) => {
    const timestamp = eventTime(event);
    return timestamp === 0 || timestamp >= params.sinceMs;
  });
}

async function filterUnrecordedEvents(params: {
  supabase: DbClient;
  newHireId: string;
  milestoneId: string;
  events: ReadinessSourceEventRow[];
}) {
  if (params.events.length === 0) return [];

  const sourceEventIds = params.events.map((event) => evidenceSourceEventId(event.id));
  const [evidenceResult, checkResult] = await Promise.all([
    params.supabase
      .from('milestone_evidence')
      .select('source_event_id')
      .eq('new_hire_id', params.newHireId)
      .eq('milestone_id', params.milestoneId)
      .in('source_event_id', sourceEventIds),
    params.supabase
      .from('milestone_check_runs')
      .select('source_event_ids')
      .eq('new_hire_id', params.newHireId)
      .eq('milestone_id', params.milestoneId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  if (evidenceResult.error) throw evidenceResult.error;
  if (checkResult.error) throw checkResult.error;

  return excludeReviewedSourceEvents({
    events: params.events,
    evidenceSourceEventIds: (evidenceResult.data ?? []).map((row) => row.source_event_id),
    checkedSourceEventIds: (checkResult.data ?? []).flatMap((row) => (
      Array.isArray(row.source_event_ids)
        ? row.source_event_ids.filter((eventId): eventId is string => typeof eventId === 'string')
        : []
    )),
  });
}

async function loadFallbackReviewSlackTargets(params: {
  supabase: DbClient;
  organizationId: string;
}) {
  const { data, error } = await params.supabase
    .from('readiness_delivery_settings')
    .select('slack_user_ids')
    .eq('organization_id', params.organizationId)
    .maybeSingle();

  if (error) throw error;
  return Array.isArray(data?.slack_user_ids)
    ? Array.from(new Set(data.slack_user_ids.filter((target): target is string => typeof target === 'string' && target.trim().length > 0)))
    : [];
}

async function loadHireScanContext(params: {
  supabase: DbClient;
  hire: HireRow;
}) {
  const rampDay = rampDayFromStartDate(params.hire.start_date);

  const { data: milestones, error: milestoneError } = await params.supabase
    .from('ramp_milestones')
    .select('*')
    .eq('organization_id', params.hire.organization_id)
    .eq('role', params.hire.role)
    .eq('status', 'active')
    .lte('day_trigger', rampDay)
    .order('day_trigger', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(20);

  if (milestoneError) throw milestoneError;
  const milestoneRows = (milestones ?? []) as RampMilestone[];
  if (milestoneRows.length === 0) return null;

  const milestoneIds = milestoneRows.map((milestone) => milestone.id);
  const [{ data: progressRows, error: progressError }, { data: deliveryRows, error: deliveryError }] = await Promise.all([
    params.supabase
      .from('new_hire_milestone_progress')
      .select('milestone_id, status, first_briefed_at')
      .eq('new_hire_id', params.hire.id)
      .in('milestone_id', milestoneIds),
    params.supabase
      .from('ramp_deliveries')
      .select('milestone_id')
      .eq('new_hire_id', params.hire.id)
      .in('milestone_id', milestoneIds)
      .eq('delivery_status', 'delivered'),
  ]);

  if (progressError) throw progressError;
  if (deliveryError) throw deliveryError;

  const progress = (progressRows ?? []) as ProgressRow[];
  const deliveries = (deliveryRows ?? []) as DeliveryRow[];
  const milestone = pickCurrentMilestoneForEvidenceScan(milestoneRows, progress, deliveries);
  if (!milestone || !isSourceEvidenceMilestone(milestone)) return null;

  const progressForMilestone = progress.find((row) => row.milestone_id === milestone.id) ?? null;
  const normalizedStatus = normalizeMilestoneProgressStatus(progressForMilestone?.status);
  if (normalizedStatus !== 'briefed' && !deliveries.some((delivery) => delivery.milestone_id === milestone.id)) return null;

  return {
    milestone,
    progress: progressForMilestone,
  };
}

async function recordSourceEventMatch(params: {
  supabase: DbClient;
  hire: HireRow;
  milestone: RampMilestone;
  match: MilestoneEvidenceMatch;
  managerSlackTargets: string[];
}) {
  return recordMilestoneEvidence({
    supabase: params.supabase,
    newHireId: params.hire.id,
    milestoneId: params.milestone.id,
    evidenceType: params.match.evidenceType,
    trustLevel: 'medium',
    confidence: params.match.confidence,
    source: params.match.event.provider,
    sourceEventId: evidenceSourceEventId(params.match.event.id),
    sourceUrl: sourceUrlForEvent(params.match.event),
    metadata: {
      scanner: 'milestone_evidence_scan',
      source_event_id: params.match.event.id,
      source_provider: params.match.event.provider,
      source_type: params.match.event.source_type,
      occurred_at: params.match.event.occurred_at,
      reason: params.match.reason,
      excerpt: params.match.excerpt,
      matched_signals: params.match.matchedSignals,
      needs_manager_review: true,
      manager_name: params.hire.manager_name,
      manager_email: params.hire.manager_email,
      manager_chat_provider: params.hire.manager_chat_provider ?? 'slack',
      notify_slack_targets: params.managerSlackTargets,
    },
  });
}

async function scanMilestoneEvidenceForHire(params: {
  supabase: DbClient;
  hire: HireRow;
  managerSlackTargets: string[];
  matcher?: MilestoneEvidenceMatcher;
}) {
  await syncAccessReadinessEvidence({
    supabase: params.supabase,
    newHireId: params.hire.id,
  });

  const context = await loadHireScanContext({
    supabase: params.supabase,
    hire: params.hire,
  });

  if (!context) {
    log.info('hire_skipped', { hireId: params.hire.id, reason: 'no_current_source_evidence_milestone' });
    return {
      checked: 0,
      matches: 0,
      failed: 0,
      milestoneId: null,
      outcome: 'waiting',
      sourcesChecked: [],
      sourceEventIds: [],
      activityChecked: 0,
      summary: 'Canon is waiting for a learning step that is ready to check.',
    } satisfies HireScanResult;
  }

  const events = await loadRecentSourceEvents({
    supabase: params.supabase,
    organizationId: params.hire.organization_id,
    sinceMs: scanSince(context.progress),
  });
  const unrecordedEvents = await filterUnrecordedEvents({
    supabase: params.supabase,
    newHireId: params.hire.id,
    milestoneId: context.milestone.id,
    events,
  });
  const sourcesChecked = Array.from(new Set(unrecordedEvents.map((event) => event.provider))).sort();

  if (unrecordedEvents.length === 0) {
    log.info('hire_skipped', {
      hireId: params.hire.id,
      milestoneId: context.milestone.id,
      reason: 'no_unrecorded_source_events',
    });
    return {
      checked: 1,
      matches: 0,
      failed: 0,
      milestoneId: context.milestone.id,
      outcome: 'no_proof',
      sourcesChecked: Array.from(new Set(events.map((event) => event.provider))).sort(),
      sourceEventIds: [],
      activityChecked: 0,
      summary: `Canon checked for new proof of '${context.milestone.title}'. Nothing new was ready to review.`,
    } satisfies HireScanResult;
  }

  const matcher = params.matcher ?? matchMilestoneEvidence;
  const match = await matcher({
    hire: params.hire,
    milestone: context.milestone,
    events: unrecordedEvents,
  });

  if (!match) {
    log.info('hire_skipped', {
      hireId: params.hire.id,
      milestoneId: context.milestone.id,
      sourceEvents: unrecordedEvents.length,
      reason: 'no_source_match',
    });
    return {
      checked: 1,
      matches: 0,
      failed: 0,
      milestoneId: context.milestone.id,
      outcome: 'no_proof',
      sourcesChecked,
      sourceEventIds: unrecordedEvents.map((event) => event.id),
      activityChecked: unrecordedEvents.length,
      summary: `Canon checked ${unrecordedEvents.length} new ${unrecordedEvents.length === 1 ? 'item' : 'items'} for '${context.milestone.title}' and did not find clear proof yet.`,
    } satisfies HireScanResult;
  }

  const result = await recordSourceEventMatch({
    supabase: params.supabase,
    hire: params.hire,
    milestone: context.milestone,
    match,
    managerSlackTargets: params.managerSlackTargets,
  });

  if (!result.ok) {
    log.warn('evidence_match_failed', {
      hireId: params.hire.id,
      milestoneId: context.milestone.id,
      sourceEventId: match.event.id,
      error: result.error,
    });
    return {
      checked: 1,
      matches: 0,
      failed: 1,
      milestoneId: context.milestone.id,
      outcome: 'failed',
      sourcesChecked,
      sourceEventIds: [],
      activityChecked: unrecordedEvents.length,
      summary: `Canon could not finish checking '${context.milestone.title}'.`,
    } satisfies HireScanResult;
  }

  log.info('evidence_match_recorded', {
    hireId: params.hire.id,
    milestoneId: context.milestone.id,
    evidenceType: match.evidenceType,
    confidence: match.confidence,
    sourceEventId: match.event.id,
  });
  return {
    checked: 1,
    matches: 1,
    failed: 0,
    milestoneId: context.milestone.id,
    outcome: 'needs_review',
    sourcesChecked,
    sourceEventIds: unrecordedEvents.map((event) => event.id),
    activityChecked: unrecordedEvents.length,
    summary: `Canon found possible proof for '${context.milestone.title}' and asked a manager to review it.`,
  } satisfies HireScanResult;
}

async function recordCheckRun(params: {
  supabase: DbClient;
  organizationId: string;
  newHireId: string;
  triggerType: MilestoneCheckTrigger;
  startedAt: string;
  result: HireScanResult;
}) {
  const { error } = await params.supabase.from('milestone_check_runs').insert({
    organization_id: params.organizationId,
    new_hire_id: params.newHireId,
    milestone_id: params.result.milestoneId,
    trigger_type: params.triggerType,
    outcome: params.result.outcome,
    sources_checked: params.result.sourcesChecked,
    source_event_ids: params.result.sourceEventIds,
    activity_checked: params.result.activityChecked,
    summary: params.result.summary,
    started_at: params.startedAt,
    completed_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function scanMilestoneEvidenceForOrganization(params: {
  supabase: DbClient;
  organizationId: string;
  hireId?: string | null;
  matcher?: MilestoneEvidenceMatcher;
  triggerType?: MilestoneCheckTrigger;
}) {
  log.info('scan_start', {
    organizationId: params.organizationId,
    hireId: params.hireId ?? null,
  });

  let query = params.supabase
    .from('new_hires')
    .select('id, organization_id, first_name, last_name, email, role, slack_user_id, manager_name, manager_email, manager_slack_user_id, manager_chat_provider, manager_chat_target_id, start_date, status')
    .eq('organization_id', params.organizationId)
    .eq('status', 'active');

  if (params.hireId) query = query.eq('id', params.hireId);

  const { data, error } = await query;
  if (error) throw error;

  const hires = (data ?? []) as HireRow[];
  const fallbackSlackTargets = await loadFallbackReviewSlackTargets({
    supabase: params.supabase,
    organizationId: params.organizationId,
  });
  let checked = 0;
  let matches = 0;
  let failed = 0;
  let runsRecorded = 0;

  for (const hire of hires) {
    const startedAt = new Date().toISOString();
    try {
      const result = await scanMilestoneEvidenceForHire({
        supabase: params.supabase,
        hire,
        managerSlackTargets: slackReviewTargetsForHire(hire, fallbackSlackTargets),
        matcher: params.matcher,
      });
      await recordCheckRun({
        supabase: params.supabase,
        organizationId: params.organizationId,
        newHireId: hire.id,
        triggerType: params.triggerType ?? 'source_sync',
        startedAt,
        result,
      });
      checked += result.checked;
      matches += result.matches;
      failed += result.failed;
      runsRecorded++;
    } catch (error) {
      failed++;
      log.warn('evidence_match_failed', {
        organizationId: params.organizationId,
        hireId: hire.id,
        error: error instanceof Error ? error.message : String(error),
      });

      try {
        await recordCheckRun({
          supabase: params.supabase,
          organizationId: params.organizationId,
          newHireId: hire.id,
          triggerType: params.triggerType ?? 'source_sync',
          startedAt,
          result: {
            checked: 0,
            matches: 0,
            failed: 1,
            milestoneId: null,
            outcome: 'failed',
            sourcesChecked: [],
            sourceEventIds: [],
            activityChecked: 0,
            summary: 'Canon could not finish this check. Try again in a few minutes.',
          },
        });
        runsRecorded++;
      } catch (recordError) {
        log.warn('evidence_match_failed', {
          organizationId: params.organizationId,
          hireId: hire.id,
          reason: 'check_run_write_failed',
          error: recordError instanceof Error ? recordError.message : String(recordError),
        });
      }
    }
  }

  log.info('scan_complete', {
    organizationId: params.organizationId,
    hires: hires.length,
    checked,
    matches,
    failed,
    runsRecorded,
  });

  return { ok: true, hires: hires.length, checked, matches, failed, runsRecorded };
}
