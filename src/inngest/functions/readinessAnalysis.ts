import { generateObject } from 'ai';
import { z } from 'zod';
import { inngest } from '../client';
import { llm } from '@/lib/ai';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { sendReadinessToTargets, type ReadinessDeliveryTargetRow } from '@/lib/server/readiness/delivery';
import {
  markReadinessSourceEventsProcessed,
  readinessSourceEventsFromKnowledgeChunks,
  upsertReadinessSourceEvents,
  type ReadinessSourceEventRow,
} from '@/lib/server/readiness/source-events';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type {
  HireRole,
  ReadinessCategory,
  ReadinessDeliveryProvider,
  ReadinessDeliveryTargetType,
  ReadinessImpactLevel,
} from '@/types/onboarding';

const log = createLogger('inngest.readiness_analysis', {
  label: 'Readiness Analysis',
  eventLabels: {
    analysis_start: 'Analysis Started',
    analysis_complete: 'Analysis Completed',
    org_skipped: 'Org Skipped',
    org_complete: 'Org Complete',
    signal_detected: 'Signal Detected',
    signal_none: 'No Signal',
    signal_failed: 'Signal Failed',
    source_events_processed: 'Source Events Processed',
    delivery_sent: 'Delivery Sent',
    delivery_failed: 'Delivery Failed',
    delivery_plan: 'Delivery Plan',
    delivery_target_result: 'Delivery Target Result',
    meeting_prep_sent: 'Meeting Prep Sent',
    meeting_prep_skipped: 'Meeting Prep Skipped',
  },
  componentColor: 'orange',
});

type SupabaseServiceClient = ReturnType<typeof createServiceRoleClient>;

type RoleProfileResult = {
  role: HireRole;
  job_description: string | null;
};

type ReadinessObservationRow = {
  id: string;
  organization_id: string;
  category: ReadinessCategory;
  title: string;
  summary: string;
  recommended_action: string | null;
  impact_level: ReadinessImpactLevel;
  affected_roles: HireRole[];
  source_event_ids: string[];
  source_hashes: string[];
  dedupe_key: string;
  status: 'active' | 'sent' | 'archived';
  last_sent_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type ReadinessItemPayload = {
  organization_id: string;
  category: ReadinessCategory;
  title: string;
  summary: string;
  recommended_action: string | null;
  impact_level: ReadinessImpactLevel;
  affected_roles: HireRole[];
  source: string;
  source_url: string | null;
  source_metadata: Record<string, unknown>;
  status: 'draft' | 'reviewed' | 'sent' | 'archived';
  updated_at: string;
};

type MeetingEventRow = {
  id: string;
  organization_id: string;
  provider: 'google_calendar' | 'outlook';
  external_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  organizer: string | null;
  attendees: string[];
  meeting_url: string | null;
  customer_domain: string | null;
  metadata: Record<string, unknown>;
};

const CATEGORY_TITLES: Record<ReadinessCategory, string> = {
  product_change: 'Product Changes',
  customer_objection: 'Customer Objections',
  demo_guidance: 'Demo Guidance',
  implementation_pattern: 'Implementation Patterns',
};

const ReadinessCategorySchema = z.enum([
  'product_change',
  'customer_objection',
  'demo_guidance',
  'implementation_pattern',
]);

const SignalItemSchema = z.object({
  category: ReadinessCategorySchema.describe('Closest readiness category for this update'),
  title: z.string().describe('Customer-facing headline under 10 words that uses company terminology when relevant'),
  summary: z.string().describe('1-2 plain-language sentences explaining what changed and why the team should care'),
  recommended_action: z.string().optional().describe('Specific next step starting with a verb'),
  impact_level: z.enum(['low', 'medium', 'high']).optional().describe('Urgency for GTM teams'),
  affected_roles: z.array(z.string().min(2).max(120)).optional().describe('Which active roles are affected'),
});

const SignalsSchema = z.object({
  signals: z.array(SignalItemSchema).max(10).describe('Distinct, actionable readiness updates. Empty when no clear update exists.'),
});

const MeetingPrepSchema = z.object({
  should_send: z.boolean(),
  reason: z.string().optional(),
  title: z.string().optional(),
  bullets: z.array(z.string()).max(5).optional(),
});

function compactText(value: string, maxLength: number) {
  const compacted = value.replace(/\s+/g, ' ').trim();
  return compacted.length <= maxLength ? compacted : compacted.slice(0, maxLength - 1).trimEnd();
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function observationDedupeKey(signal: {
  category: ReadinessCategory;
  title: string;
  summary: string;
}) {
  const title = normalizeKey(signal.title).split(' ').slice(0, 10).join(' ');
  const summary = normalizeKey(signal.summary).split(' ').slice(0, 14).join(' ');
  return `${signal.category}:${title}:${summary}`.trim();
}

function activeRolesFromProfiles(roleProfiles: RoleProfileResult[]) {
  return roleProfiles.map((profile) => profile.role).filter((role) => role.trim().length > 0);
}

function roleProfileContext(roleProfiles: RoleProfileResult[]) {
  return roleProfiles.map((profile) => {
    const jobDescription = compactText(profile.job_description ?? '', 1400);
    return jobDescription
      ? `${profile.role}:\n${jobDescription}`
      : `${profile.role}:\nNo job description provided. Use only explicit evidence and the role title.`;
  }).join('\n\n');
}

function normalizeAffectedRoles(value: string[] | undefined, activeRoles: HireRole[]) {
  const requested = value?.length ? value : activeRoles;
  const activeRoleSet = new Set(activeRoles.map((role) => role.toLowerCase()));
  const normalized = Array.from(new Set(requested))
    .filter((role): role is HireRole => activeRoleSet.has(role.toLowerCase()));
  return normalized.length > 0 ? normalized : activeRoles;
}

function roleProfileMetadata(roleProfiles: RoleProfileResult[]) {
  return roleProfiles.flatMap((profile) => {
    const jobDescription = profile.job_description?.trim();
    return jobDescription ? [{ role: profile.role, has_job_description: true }] : [];
  });
}

function slackMessageUrl(channelId: string, messageTs: string | null) {
  const params = new URLSearchParams({ channel: channelId });
  if (messageTs) params.set('message_ts', messageTs);
  return `https://slack.com/app_redirect?${params.toString()}`;
}

function sourceEvidenceFromEvents(events: ReadinessSourceEventRow[]) {
  const seen = new Set<string>();
  return events.flatMap((event) => {
    const metadata = event.metadata ?? {};
    const provider = event.provider;
    const channelId = typeof metadata.channel_id === 'string' ? metadata.channel_id : null;
    const channelName = typeof metadata.channel_name === 'string' ? metadata.channel_name : null;
    const messageTs = typeof metadata.message_ts === 'string' ? metadata.message_ts : null;
    const sourceName = typeof metadata.source_name === 'string'
      ? metadata.source_name
      : typeof metadata.title === 'string'
        ? metadata.title
        : null;
    const sourceUrl = typeof metadata.source_url === 'string'
      ? metadata.source_url
      : typeof metadata.url === 'string'
        ? metadata.url
        : null;
    const sourceType = event.source_type;
    const noteId = typeof metadata.note_id === 'string' ? metadata.note_id : null;
    const meetingDate = typeof metadata.meeting_date === 'string' ? metadata.meeting_date : event.occurred_at;
    const key = `${provider}:${event.external_id}:${event.content_hash}`;

    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      provider,
      channel_id: channelId,
      channel_name: channelName,
      message_ts: messageTs,
      source_name: sourceName,
      source_type: sourceType,
      note_id: noteId,
      meeting_date: meetingDate,
      url: sourceUrl ?? (channelId ? slackMessageUrl(channelId, messageTs) : null),
      source_event_id: event.id,
      content_hash: event.content_hash,
    }];
  });
}

function sourceMaterial(events: ReadinessSourceEventRow[]) {
  return events.map((event, index) => {
    const label = [
      `Source ${index + 1}`,
      `provider=${event.provider}`,
      `type=${event.source_type}`,
      event.occurred_at ? `date=${event.occurred_at}` : '',
    ].filter(Boolean).join(' ');

    return `${label}\n${compactText(event.content, 1600)}`;
  }).join('\n\n---\n\n');
}

async function detectReadinessSignals(params: {
  events: ReadinessSourceEventRow[];
  roleProfiles: RoleProfileResult[];
}) {
  if (params.events.length === 0) return [];

  const { object } = await generateObject({
    model: llm,
    schema: SignalsSchema,
    prompt: `You are Canon, an AI that keeps technical GTM teams ready without creating noisy updates.

Analyze only the source material below. Extract updates only when a customer-facing technical teammate would need to change what they say, demo, qualify, document, escalate, configure, or promise.

Write for customers and customer-facing teammates. Use simple, standalone language. Avoid internal AI terms such as "signal", "chunk", "retrieval", "metadata", or "indexed". Preserve company terminology when it appears in the source material, including product names, feature names, customer names, team names, acronyms, workflows, tools, and role names.

Use these active role descriptions when deciding affected_roles:
${roleProfileContext(params.roleProfiles)}

Categories:
- product_change: product capability, limitation, maturity, reliability, reporting, admin controls, pricing/packaging, rollout, or customer-facing product gap
- customer_objection: customer concern, trust issue, objection, escalation, repeated support complaint, stakeholder hesitation, or response gap
- demo_guidance: demo narrative, sales expectation mismatch, talk track, presentation, proof point, or demo flow change
- implementation_pattern: setup, auth, configuration, deployment, migration, architecture, integration, go-live, or delivery risk

Only return concrete updates with a clear next step. Do not return general chatter, vague status, duplicate updates, Canon-generated readiness briefs, or meeting transcripts that do not imply a future action.

Source material:
${sourceMaterial(params.events)}

If there is no clear update, return { "signals": [] }.`,
  });

  return object.signals;
}

async function readinessDeliverySettings(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
}) {
  const { data, error } = await params.supabase
    .from('readiness_delivery_settings')
    .select('weekly_digest_enabled, digest_weekday, digest_hour_utc, meeting_prep_enabled, meeting_prep_minutes_before, last_digest_sent_at, channel_ids, channel_names, slack_user_ids')
    .eq('organization_id', params.organizationId)
    .maybeSingle();

  if (error) throw error;

  return {
    weeklyDigestEnabled: data?.weekly_digest_enabled !== false,
    digestWeekday: typeof data?.digest_weekday === 'number' ? data.digest_weekday : 1,
    digestHourUtc: typeof data?.digest_hour_utc === 'number' ? data.digest_hour_utc : 13,
    meetingPrepEnabled: data?.meeting_prep_enabled !== false,
    meetingPrepMinutesBefore: typeof data?.meeting_prep_minutes_before === 'number' ? data.meeting_prep_minutes_before : 45,
    lastDigestSentAt: typeof data?.last_digest_sent_at === 'string' ? data.last_digest_sent_at : null,
    legacyChannelIds: Array.isArray(data?.channel_ids)
      ? data.channel_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
    legacyChannelNames: Array.isArray(data?.channel_names)
      ? data.channel_names.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
    legacyUserIds: Array.isArray(data?.slack_user_ids)
      ? data.slack_user_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
  };
}

async function readinessDeliveryTargets(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
}) {
  const { data, error } = await params.supabase
    .from('readiness_delivery_targets')
    .select('id, organization_id, provider, target_type, target_id, target_name, enabled')
    .eq('organization_id', params.organizationId)
    .eq('enabled', true);

  if (error) throw error;
  return (data ?? []) as ReadinessDeliveryTargetRow[];
}

async function readinessDeliveryConfig(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
}) {
  const [settings, targets] = await Promise.all([
    readinessDeliverySettings(params),
    readinessDeliveryTargets(params),
  ]);

  const legacyTargets: ReadinessDeliveryTargetRow[] = targets.length > 0 ? [] : [
    ...settings.legacyChannelIds.map((channelId, index) => ({
      organization_id: params.organizationId,
      provider: 'slack' as ReadinessDeliveryProvider,
      target_type: 'channel' as ReadinessDeliveryTargetType,
      target_id: channelId,
      target_name: settings.legacyChannelNames[index] ?? null,
      enabled: true,
    })),
    ...settings.legacyUserIds.map((userId) => ({
      organization_id: params.organizationId,
      provider: 'slack' as ReadinessDeliveryProvider,
      target_type: 'dm' as ReadinessDeliveryTargetType,
      target_id: userId,
      target_name: null,
      enabled: true,
    })),
  ];

  return {
    ...settings,
    targets: targets.length > 0 ? targets : legacyTargets,
  };
}

function hasDeliveryTargets(targets: ReadinessDeliveryTargetRow[]) {
  return targets.some((target) => target.enabled);
}

async function seedPendingSourceEventsFromKnowledgeChunks(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
  limit?: number;
}) {
  const { data, error } = await params.supabase
    .from('knowledge_chunks')
    .select('id, source_id, content, metadata, created_at')
    .eq('organization_id', params.organizationId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 60);

  if (error) throw error;

  const chunks = (data ?? []).map((chunk) => {
    const metadata = chunk.metadata && typeof chunk.metadata === 'object' && !Array.isArray(chunk.metadata)
      ? chunk.metadata as Record<string, unknown>
      : null;
    return {
      id: chunk.id,
      source_id: chunk.source_id,
      content: chunk.content,
      metadata,
      created_at: chunk.created_at,
    };
  });
  const events = readinessSourceEventsFromKnowledgeChunks({
    organizationId: params.organizationId,
    chunks,
  });

  if (events.length === 0) return { sourceChunks: chunks.length, sourceEvents: 0 };
  const result = await upsertReadinessSourceEvents({ supabase: params.supabase, events });
  return { sourceChunks: chunks.length, sourceEvents: result.upserted };
}

async function loadActiveRoleProfiles(supabase: SupabaseServiceClient, organizationId: string) {
  const { data, error } = await supabase
    .from('role_profiles')
    .select('role, job_description')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('display_order', { ascending: true })
    .order('role', { ascending: true });

  if (error) throw error;
  return (data ?? []) as RoleProfileResult[];
}

async function loadPendingSourceEvents(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
  limit?: number;
}) {
  const { data, error } = await params.supabase
    .from('readiness_source_events')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('status', 'pending')
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 40);

  if (error) throw error;
  return (data ?? []) as ReadinessSourceEventRow[];
}

async function usedSourceHashes(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
}) {
  const { data, error } = await params.supabase
    .from('readiness_observations')
    .select('source_hashes')
    .eq('organization_id', params.organizationId)
    .neq('status', 'archived');

  if (error) throw error;

  return new Set(
    (data ?? []).flatMap((row: { source_hashes?: unknown }) => (
      Array.isArray(row.source_hashes)
        ? row.source_hashes.filter((value): value is string => typeof value === 'string')
        : []
    ))
  );
}

async function loadProcessableSourceEvents(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
  limit?: number;
}) {
  const events = await loadPendingSourceEvents(params);
  if (events.length === 0) return [];

  const usedHashes = await usedSourceHashes(params);
  return events.filter((event) => !usedHashes.has(event.content_hash));
}

async function insertReadinessItemsForObservations(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
  observations: ReadinessObservationRow[];
}) {
  if (params.observations.length === 0) return { inserted: 0, itemIds: [] as string[] };

  const { data: existing, error: existingError } = await params.supabase
    .from('readiness_items')
    .select('id, source_metadata')
    .eq('organization_id', params.organizationId)
    .neq('status', 'archived');

  if (existingError) throw existingError;

  const existingDedupeKeys = new Set(
    (existing ?? []).flatMap((item: { source_metadata?: Record<string, unknown> | null }) => {
      const key = item.source_metadata?.observation_dedupe_key;
      return typeof key === 'string' ? [key] : [];
    })
  );

  const now = new Date().toISOString();
  const rows: ReadinessItemPayload[] = params.observations
    .filter((observation) => !existingDedupeKeys.has(observation.dedupe_key))
    .map((observation) => {
      const evidence = Array.isArray(observation.metadata.source_evidence)
        ? observation.metadata.source_evidence as Array<{ provider?: string; url?: string }>
        : [];
      const firstEvidence = evidence[0];

      return {
        organization_id: params.organizationId,
        category: observation.category,
        title: observation.title,
        summary: observation.summary,
        recommended_action: observation.recommended_action,
        impact_level: observation.impact_level,
        affected_roles: observation.affected_roles,
        source: typeof firstEvidence?.provider === 'string' ? firstEvidence.provider : 'readiness',
        source_url: typeof firstEvidence?.url === 'string' ? firstEvidence.url : null,
        source_metadata: {
          ...observation.metadata,
          observation_id: observation.id,
          observation_dedupe_key: observation.dedupe_key,
          source_event_ids: observation.source_event_ids,
          source_hashes: observation.source_hashes,
        },
        status: 'draft',
        updated_at: now,
      };
    });

  if (rows.length === 0) return { inserted: 0, itemIds: [] };

  const { data: inserted, error } = await params.supabase
    .from('readiness_items')
    .insert(rows)
    .select('id');

  if (error) throw error;
  return { inserted: rows.length, itemIds: (inserted ?? []).map((row: { id: string }) => row.id) };
}

async function upsertObservations(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
  signals: Array<z.infer<typeof SignalItemSchema>>;
  events: ReadinessSourceEventRow[];
  roleProfiles: RoleProfileResult[];
}) {
  const activeRoles = activeRolesFromProfiles(params.roleProfiles);
  const evidence = sourceEvidenceFromEvents(params.events);
  const sourceEventIds = params.events.map((event) => event.id);
  const sourceHashes = Array.from(new Set(params.events.map((event) => event.content_hash)));
  const now = new Date().toISOString();
  const seen = new Set<string>();

  const rows = params.signals.flatMap((signal) => {
    const dedupeKey = observationDedupeKey(signal);
    if (seen.has(dedupeKey)) return [];
    seen.add(dedupeKey);

    return [{
      organization_id: params.organizationId,
      category: signal.category,
      title: signal.title,
      summary: signal.summary,
      recommended_action: signal.recommended_action ?? null,
      impact_level: signal.impact_level ?? 'medium',
      affected_roles: normalizeAffectedRoles(signal.affected_roles, activeRoles),
      source_event_ids: sourceEventIds,
      source_hashes: sourceHashes,
      dedupe_key: dedupeKey,
      status: 'active',
      metadata: {
        detected_by: 'readiness_source_events',
        source_evidence: evidence,
        role_profiles: roleProfileMetadata(params.roleProfiles),
      },
      updated_at: now,
    }];
  });

  if (rows.length === 0) return [];

  const { data, error } = await params.supabase
    .from('readiness_observations')
    .upsert(rows, { onConflict: 'organization_id,dedupe_key' })
    .select('*');

  if (error) throw error;
  return (data ?? []) as ReadinessObservationRow[];
}

async function generateObservationsForOrg(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
  requireDeliveryTargets?: boolean;
}) {
  if (params.requireDeliveryTargets) {
    const config = await readinessDeliveryConfig(params);
    if (!hasDeliveryTargets(config.targets)) {
      log.info('org_skipped', {
        orgId: params.organizationId,
        reason: 'readiness_delivery_not_configured',
      });
      return { observations: [] as ReadinessObservationRow[], eventsReviewed: 0, itemsInserted: 0 };
    }
  }

  const roleProfiles = await loadActiveRoleProfiles(params.supabase, params.organizationId);
  const activeRoles = activeRolesFromProfiles(roleProfiles);
  if (activeRoles.length === 0) {
    log.info('org_skipped', { orgId: params.organizationId, reason: 'no_active_roles' });
    return { observations: [] as ReadinessObservationRow[], eventsReviewed: 0, itemsInserted: 0 };
  }

  let pendingEvents = await loadPendingSourceEvents({
    supabase: params.supabase,
    organizationId: params.organizationId,
    limit: 80,
  });

  if (pendingEvents.length === 0) {
    const seeded = await seedPendingSourceEventsFromKnowledgeChunks({
      supabase: params.supabase,
      organizationId: params.organizationId,
      limit: 80,
    });

    if (seeded.sourceEvents > 0) {
      log.info('source_events_processed', {
        orgId: params.organizationId,
        reason: 'backfilled_from_knowledge_chunks',
        sourceChunks: seeded.sourceChunks,
        sourceEvents: seeded.sourceEvents,
      });
      pendingEvents = await loadPendingSourceEvents({
        supabase: params.supabase,
        organizationId: params.organizationId,
        limit: 80,
      });
    }
  }

  if (pendingEvents.length === 0) {
    log.info('signal_none', { orgId: params.organizationId, reason: 'no_pending_source_events' });
    return { observations: [] as ReadinessObservationRow[], eventsReviewed: 0, itemsInserted: 0 };
  }

  const processableEvents = await loadProcessableSourceEvents({
    supabase: params.supabase,
    organizationId: params.organizationId,
    limit: 80,
  });

  if (processableEvents.length === 0) {
    await markReadinessSourceEventsProcessed({
      supabase: params.supabase,
      ids: pendingEvents.map((event) => event.id),
      status: 'ignored',
    });
    log.info('source_events_processed', {
      orgId: params.organizationId,
      pendingEvents: pendingEvents.length,
      processableEvents: 0,
      reason: 'already_used_source_hashes',
    });
    return { observations: [] as ReadinessObservationRow[], eventsReviewed: pendingEvents.length, itemsInserted: 0 };
  }

  try {
    const signals = await detectReadinessSignals({
      events: processableEvents,
      roleProfiles,
    });

    if (signals.length === 0) {
      await markReadinessSourceEventsProcessed({
        supabase: params.supabase,
        ids: pendingEvents.map((event) => event.id),
        status: 'processed',
      });
      log.info('signal_none', {
        orgId: params.organizationId,
        eventsReviewed: processableEvents.length,
      });
      return { observations: [] as ReadinessObservationRow[], eventsReviewed: processableEvents.length, itemsInserted: 0 };
    }

    const observations = await upsertObservations({
      supabase: params.supabase,
      organizationId: params.organizationId,
      signals,
      events: processableEvents,
      roleProfiles,
    });

    const inserted = await insertReadinessItemsForObservations({
      supabase: params.supabase,
      organizationId: params.organizationId,
      observations,
    });

    await markReadinessSourceEventsProcessed({
      supabase: params.supabase,
      ids: pendingEvents.map((event) => event.id),
      status: 'processed',
    });

    for (const observation of observations) {
      log.info('signal_detected', {
        orgId: params.organizationId,
        category: observation.category,
        title: observation.title,
        impact: observation.impact_level,
        sourceEvents: observation.source_event_ids.length,
      });
    }

    return {
      observations,
      eventsReviewed: processableEvents.length,
      itemsInserted: inserted.inserted,
    };
  } catch (error) {
    await markReadinessSourceEventsProcessed({
      supabase: params.supabase,
      ids: processableEvents.map((event) => event.id),
      status: 'error',
    });
    log.error('signal_failed', {
      orgId: params.organizationId,
      error: errorMessage(error),
    });
    throw error;
  }
}

function buildWeeklyDigest(observations: ReadinessObservationRow[]) {
  const grouped = observations.reduce((map, observation) => {
    const current = map.get(observation.category) ?? [];
    current.push(observation);
    map.set(observation.category, current);
    return map;
  }, new Map<ReadinessCategory, ReadinessObservationRow[]>());

  const lines = [
    '*Weekly readiness digest*',
    '',
    ...Array.from(grouped.entries()).flatMap(([category, items]) => [
      `*${CATEGORY_TITLES[category]}*`,
      ...items.flatMap((item) => [
        `• *${item.title}*`,
        `  ${item.summary}`,
        item.recommended_action ? `  _Next step:_ ${item.recommended_action}` : '',
      ].filter(Boolean)),
      '',
    ]),
  ];

  return lines.filter((line, index, all) => line || all[index - 1]).join('\n').trim();
}

async function loadWeeklyDigestObservations(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
}) {
  const { data, error } = await params.supabase
    .from('readiness_observations')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('status', 'active')
    .in('impact_level', ['high', 'medium'])
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error) throw error;
  return (data ?? []) as ReadinessObservationRow[];
}

async function markObservationsSent(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
  observations: ReadinessObservationRow[];
}) {
  const now = new Date().toISOString();
  const observationIds = params.observations.map((observation) => observation.id);
  const dedupeKeys = params.observations.map((observation) => observation.dedupe_key);

  if (observationIds.length > 0) {
    const { error } = await params.supabase
      .from('readiness_observations')
      .update({ status: 'sent', last_sent_at: now, updated_at: now })
      .in('id', observationIds);

    if (error) throw error;
  }

  const { data: items, error: itemFetchError } = await params.supabase
    .from('readiness_items')
    .select('id, source_metadata')
    .eq('organization_id', params.organizationId)
    .in('status', ['draft', 'reviewed']);

  if (itemFetchError) throw itemFetchError;

  const itemIds = (items ?? []).flatMap((item: { id: string; source_metadata?: Record<string, unknown> | null }) => (
    typeof item.source_metadata?.observation_dedupe_key === 'string' &&
    dedupeKeys.includes(item.source_metadata.observation_dedupe_key)
      ? [item.id]
      : []
  ));

  if (itemIds.length > 0) {
    const { error } = await params.supabase
      .from('readiness_items')
      .update({ status: 'sent', sent_at: now, updated_at: now })
      .in('id', itemIds);

    if (error) throw error;
  }

  const { error: settingsError } = await params.supabase
    .from('readiness_delivery_settings')
    .upsert({
      organization_id: params.organizationId,
      last_digest_sent_at: now,
      updated_at: now,
    }, { onConflict: 'organization_id' });

  if (settingsError) throw settingsError;
}

async function deliverWeeklyDigest(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
}) {
  const config = await readinessDeliveryConfig(params);
  if (!config.weeklyDigestEnabled) {
    log.info('org_skipped', { orgId: params.organizationId, reason: 'weekly_digest_disabled' });
    return { delivered: 0, observations: 0 };
  }
  if (!hasDeliveryTargets(config.targets)) {
    log.info('org_skipped', { orgId: params.organizationId, reason: 'readiness_delivery_not_configured' });
    return { delivered: 0, observations: 0 };
  }

  const observations = await loadWeeklyDigestObservations(params);
  if (observations.length === 0) {
    log.info('org_skipped', { orgId: params.organizationId, reason: 'no_weekly_digest_observations' });
    return { delivered: 0, observations: 0 };
  }

  const text = buildWeeklyDigest(observations);
  log.info('delivery_plan', {
    orgId: params.organizationId,
    observationCount: observations.length,
    targetCount: config.targets.length,
    providers: Array.from(new Set(config.targets.map((target) => target.provider))),
  });

  const deliveries = await sendReadinessToTargets({
    organizationId: params.organizationId,
    targets: config.targets,
    text,
  });

  for (const delivery of deliveries) {
    log.info('delivery_target_result', {
      orgId: params.organizationId,
      provider: delivery.target.provider,
      type: delivery.target.target_type,
      target: delivery.target.target_id,
      sent: delivery.sent,
      reason: delivery.reason,
      channel: delivery.channel,
      ts: delivery.ts,
      permalink: delivery.permalink,
    });
  }

  const sentDeliveries = deliveries.filter((delivery) => delivery.sent);
  if (sentDeliveries.length === 0) {
    log.warn('delivery_failed', {
      orgId: params.organizationId,
      observationCount: observations.length,
      reason: deliveries[0]?.reason ?? 'no_successful_targets',
    });
    return { delivered: 0, observations: observations.length };
  }

  await markObservationsSent({
    supabase: params.supabase,
    organizationId: params.organizationId,
    observations,
  });

  log.info('delivery_sent', {
    orgId: params.organizationId,
    observationCount: observations.length,
    deliveredTargets: sentDeliveries.length,
  });

  return { delivered: sentDeliveries.length, observations: observations.length };
}

async function loadOrganizations(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase.from('organizations').select('id');
  if (error) throw error;
  return (data ?? []) as Array<{ id: string }>;
}

export const readinessAnalysisOnDemand = inngest.createFunction(
  {
    id: 'readiness-analysis-on-demand',
    name: 'Canon: Readiness Analysis (On Demand)',
    retries: 1,
  },
  { event: 'onboarding/readiness.generate.requested' },
  async ({ event, step }) => {
    const { organizationId } = event.data as { organizationId: string };
    const supabase = createServiceRoleClient();

    log.info('analysis_start', { organizationId, triggered: 'on_demand' });

    const result = await step.run(`generate-observations-${organizationId}`, async () => (
      generateObservationsForOrg({
        supabase,
        organizationId,
        requireDeliveryTargets: false,
      })
    ));

    log.info('analysis_complete', {
      orgsProcessed: 1,
      totalSignals: result.observations.length,
      eventsReviewed: result.eventsReviewed,
      itemsInserted: result.itemsInserted,
      delivered: false,
    });

    return {
      ok: true,
      orgsProcessed: 1,
      totalSignals: result.observations.length,
      eventsReviewed: result.eventsReviewed,
      delivered: false,
    };
  }
);

export const readinessAnalysis = inngest.createFunction(
  {
    id: 'readiness-analysis',
    name: 'Canon: Weekly Readiness Digest',
    retries: 1,
  },
  { cron: '0 13 * * 1' },
  async ({ step }) => {
    const supabase = createServiceRoleClient();

    log.info('analysis_start', { cadence: 'weekly', time: '13:00 UTC Monday' });

    const orgs = await loadOrganizations(supabase);
    let totalSignals = 0;
    let totalDelivered = 0;

    for (const org of orgs) {
      const result = await step.run(`weekly-readiness-${org.id}`, async () => {
        const generated = await generateObservationsForOrg({
          supabase,
          organizationId: org.id,
          requireDeliveryTargets: true,
        });
        const delivered = await deliverWeeklyDigest({
          supabase,
          organizationId: org.id,
        });

        log.info('org_complete', {
          orgId: org.id,
          observationsGenerated: generated.observations.length,
          observationsDelivered: delivered.observations,
          deliveredTargets: delivered.delivered,
        });

        return {
          signalsDetected: generated.observations.length,
          deliveredTargets: delivered.delivered,
        };
      });

      totalSignals += result.signalsDetected;
      totalDelivered += result.deliveredTargets;
    }

    log.info('analysis_complete', { orgsProcessed: orgs.length, totalSignals, totalDelivered });
    return { ok: true, orgsProcessed: orgs.length, totalSignals, totalDelivered };
  }
);

function relevantObservationText(observations: ReadinessObservationRow[]) {
  return observations.slice(0, 6).map((observation, index) => (
    `${index + 1}. ${observation.title}: ${observation.summary}${observation.recommended_action ? ` Next step: ${observation.recommended_action}` : ''}`
  )).join('\n');
}

function meetingContext(meeting: MeetingEventRow) {
  return [
    `Title: ${meeting.title}`,
    meeting.description ? `Description: ${compactText(meeting.description, 1000)}` : '',
    `Starts: ${meeting.start_at}`,
    meeting.organizer ? `Organizer: ${meeting.organizer}` : '',
    meeting.attendees.length > 0 ? `Attendees: ${meeting.attendees.join(', ')}` : '',
    meeting.customer_domain ? `Customer domain: ${meeting.customer_domain}` : '',
  ].filter(Boolean).join('\n');
}

async function buildMeetingPrepText(params: {
  meeting: MeetingEventRow;
  observations: ReadinessObservationRow[];
}) {
  if (params.observations.length === 0) {
    return { shouldSend: false, reason: 'no_related_readiness_observations', text: null as string | null };
  }

  const { object } = await generateObject({
    model: llm,
    schema: MeetingPrepSchema,
    prompt: `You are Canon. Write a short meeting prep brief only if the readiness context is relevant to this specific meeting.

Meeting:
${meetingContext(params.meeting)}

Readiness context:
${relevantObservationText(params.observations)}

Rules:
- Send only when the context would help the attendee prepare for this meeting.
- Do not send a generic briefing.
- Keep it short: title plus up to 5 bullets.
- Use customer and company terminology when present.

Return should_send=false when the context is thin or unrelated.`,
  });

  if (!object.should_send) {
    return { shouldSend: false, reason: object.reason ?? 'thin_context', text: null };
  }

  const text = [
    `*${object.title || `Prep for ${params.meeting.title}`}*`,
    '',
    ...(object.bullets ?? []).map((bullet) => `• ${bullet}`),
  ].join('\n').trim();

  return text ? { shouldSend: true, reason: null, text } : { shouldSend: false, reason: 'empty_brief', text: null };
}

async function loadUpcomingMeetings(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
  minutesBefore: number;
}) {
  const now = new Date();
  const latestStart = new Date(now.getTime() + (params.minutesBefore + 15) * 60 * 1000);

  const { data, error } = await params.supabase
    .from('meeting_events')
    .select('*')
    .eq('organization_id', params.organizationId)
    .gte('start_at', now.toISOString())
    .lte('start_at', latestStart.toISOString())
    .order('start_at', { ascending: true })
    .limit(20);

  if (error) throw error;
  return (data ?? []) as MeetingEventRow[];
}

function domainTerms(meeting: MeetingEventRow) {
  const domains = new Set<string>();
  if (meeting.customer_domain) domains.add(meeting.customer_domain.toLowerCase());
  for (const attendee of meeting.attendees) {
    const domain = attendee.split('@')[1]?.toLowerCase();
    if (domain) domains.add(domain);
  }
  return domains;
}

async function loadRelatedObservations(params: {
  supabase: SupabaseServiceClient;
  organizationId: string;
  meeting: MeetingEventRow;
}) {
  const { data, error } = await params.supabase
    .from('readiness_observations')
    .select('*')
    .eq('organization_id', params.organizationId)
    .in('status', ['active', 'sent'])
    .order('updated_at', { ascending: false })
    .limit(30);

  if (error) throw error;

  const terms = new Set([
    ...normalizeKey(params.meeting.title).split(' ').filter((term) => term.length > 3),
    ...domainTerms(params.meeting),
  ]);

  return ((data ?? []) as ReadinessObservationRow[]).filter((observation) => {
    const text = normalizeKey(`${observation.title} ${observation.summary} ${JSON.stringify(observation.metadata ?? {})}`);
    return Array.from(terms).some((term) => text.includes(term));
  }).slice(0, 6);
}

async function alreadyPrepared(params: {
  supabase: SupabaseServiceClient;
  meetingId: string;
  targetProvider: ReadinessDeliveryProvider;
  targetId: string;
}) {
  const { data, error } = await params.supabase
    .from('meeting_prep_deliveries')
    .select('id')
    .eq('meeting_event_id', params.meetingId)
    .eq('target_provider', params.targetProvider)
    .eq('target_id', params.targetId)
    .limit(1);

  if (error) throw error;
  return (data ?? []).length > 0;
}

export const meetingPrepBriefing = inngest.createFunction(
  {
    id: 'meeting-prep-briefing',
    name: 'Canon: Meeting Prep Briefing',
    retries: 1,
  },
  { cron: '*/15 * * * *' },
  async ({ step }) => {
    const supabase = createServiceRoleClient();
    const orgs = await loadOrganizations(supabase);
    let sent = 0;
    let skipped = 0;

    for (const org of orgs) {
      const result = await step.run(`meeting-prep-${org.id}`, async () => {
        const config = await readinessDeliveryConfig({ supabase, organizationId: org.id });
        if (!config.meetingPrepEnabled) return { sent: 0, skipped: 0 };

        const dmTargets = config.targets.filter((target) => target.enabled && target.target_type === 'dm');
        if (dmTargets.length === 0) {
          log.info('meeting_prep_skipped', { orgId: org.id, reason: 'no_dm_targets' });
          return { sent: 0, skipped: 0 };
        }

        const meetings = await loadUpcomingMeetings({
          supabase,
          organizationId: org.id,
          minutesBefore: config.meetingPrepMinutesBefore,
        });
        let orgSent = 0;
        let orgSkipped = 0;

        for (const meeting of meetings) {
          const observations = await loadRelatedObservations({ supabase, organizationId: org.id, meeting });
          const prep = await buildMeetingPrepText({ meeting, observations });
          if (!prep.shouldSend || !prep.text) {
            orgSkipped++;
            log.info('meeting_prep_skipped', {
              orgId: org.id,
              meetingId: meeting.id,
              reason: prep.reason,
            });
            continue;
          }

          for (const target of dmTargets) {
            if (await alreadyPrepared({
              supabase,
              meetingId: meeting.id,
              targetProvider: target.provider,
              targetId: target.target_id,
            })) {
              continue;
            }

            const [delivery] = await sendReadinessToTargets({
              organizationId: org.id,
              targets: [target],
              text: prep.text,
            });
            const now = new Date().toISOString();
            const { error } = await supabase
              .from('meeting_prep_deliveries')
              .insert({
                organization_id: org.id,
                meeting_event_id: meeting.id,
                target_provider: target.provider,
                target_id: target.target_id,
                target_name: target.target_name,
                status: delivery?.sent ? 'delivered' : 'failed',
                reason: delivery?.reason ?? null,
                delivered_at: delivery?.sent ? now : null,
                metadata: {
                  observation_ids: observations.map((observation) => observation.id),
                  permalink: delivery?.permalink ?? null,
                },
                updated_at: now,
              });

            if (error) throw error;
            if (delivery?.sent) {
              orgSent++;
              log.info('meeting_prep_sent', { orgId: org.id, meetingId: meeting.id, target: target.target_id });
            } else {
              orgSkipped++;
              log.warn('delivery_failed', {
                orgId: org.id,
                meetingId: meeting.id,
                target: target.target_id,
                reason: delivery?.reason,
              });
            }
          }
        }

        return { sent: orgSent, skipped: orgSkipped };
      });

      sent += result.sent;
      skipped += result.skipped;
    }

    return { ok: true, orgsProcessed: orgs.length, sent, skipped };
  }
);
