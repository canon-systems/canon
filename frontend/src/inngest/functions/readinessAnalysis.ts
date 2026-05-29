import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { embed, generateObject } from 'ai';
import { z } from 'zod';
import { llm, embeddingModel } from '@/lib/ai';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { sendSlackDirectMessage, sendSlackMessage, type SlackDeliveryResult } from '@/lib/server/signals/delivery';
import type { ReadinessCategory, HireRole } from '@/types/onboarding';

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
    signals_refreshed: 'Signals Refreshed',
    delivery_sent: 'Delivery Sent',
    delivery_failed: 'Delivery Failed',
    delivery_plan: 'Delivery Plan',
    delivery_target_result: 'Delivery Target Result',
  },
  componentColor: 'orange',
});

type KnowledgeChunkResult = {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

type ChunkRetrievalResult = {
  chunks: KnowledgeChunkResult[];
  strategy: 'vector_plus_recent' | 'recent' | 'company_recent' | 'none';
  vectorMatches: number;
  fallbackCandidates: number;
};

type ReadinessDeliveryItem = {
  id: string;
  organization_id: string;
  category: ReadinessCategory;
  title: string;
  summary: string;
  recommended_action: string | null;
  affected_roles: HireRole[];
  source_metadata: Record<string, unknown>;
};

type RoleProfileResult = {
  role: HireRole;
  job_description: string | null;
};

const ALL_ROLES: HireRole[] = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];

const CATEGORY_QUERIES: Record<ReadinessCategory, string> = {
  product_change:
    'product update feature change launch release announcement new capability limitation pricing packaging availability migration rollout',
  customer_objection:
    'customer concern objection pushback hesitation resistance problem complaint feedback blocker risk trust escalation',
  demo_guidance:
    'demo presentation pitch talk track narrative best practice show walkthrough discovery',
  implementation_pattern:
    'implementation setup configuration deployment technical pattern best practice architecture migration go-live launch risk',
};

const CATEGORY_DESCRIPTIONS: Record<ReadinessCategory, string> = {
  product_change:
    'a product capability, product limitation, reliability issue, launch dependency, availability change, pricing/packaging change, or customer-facing product gap that GTM teams need to know about',
  customer_objection:
    'a customer concern, objection, trust issue, product maturity concern, escalation, blocker, or recurring question pattern that GTM teams should have a prepared response to',
  demo_guidance:
    'updated demo guidance, new talk tracks, narrative changes, or presentation best practices',
  implementation_pattern:
    'an implementation pattern, technical setup issue, migration risk, deployment blocker, production configuration concern, or delivery best practice',
};

const ReadinessCategorySchema = z.enum([
  'product_change',
  'customer_objection',
  'demo_guidance',
  'implementation_pattern',
]);

const CATEGORIES = ReadinessCategorySchema.options satisfies ReadinessCategory[];

const CATEGORY_TITLES: Record<ReadinessCategory, string> = {
  product_change: 'Product Changes',
  customer_objection: 'Customer Objections',
  demo_guidance: 'Demo Guidance',
  implementation_pattern: 'Implementation Patterns',
};

const SignalItemSchema = z.object({
  title: z.string().describe('Concise headline under 10 words'),
  summary: z
    .string()
    .describe('1–2 sentences describing the signal in plain language'),
  recommended_action: z
    .string()
    .optional()
    .describe('Specific action starting with a verb'),
  impact_level: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('Urgency for GTM teams'),
  affected_roles: z
    .array(z.enum(['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer']))
    .optional()
    .describe('Which roles are affected'),
});

const SignalsSchema = z.object({
  signals: z
    .array(SignalItemSchema)
    .max(3)
    .describe('Distinct, actionable readiness signals found for this category. Empty when no clear signal exists.'),
});

const CompanySignalItemSchema = SignalItemSchema.extend({
  category: ReadinessCategorySchema.describe('Closest readiness category for this signal'),
});

const CompanySignalsSchema = z.object({
  signals: z
    .array(CompanySignalItemSchema)
    .max(12)
    .describe('Distinct, actionable company readiness signals across all categories. Empty when no clear signal exists.'),
});

async function detectSignals(params: {
  category: ReadinessCategory;
  chunks: KnowledgeChunkResult[];
  roleProfiles: RoleProfileResult[];
}): Promise<Array<z.infer<typeof SignalItemSchema>>> {
  const { category, chunks, roleProfiles } = params;

  if (chunks.length === 0) return [];

  const chunkText = chunks.map((c) => c.content).join('\n\n---\n\n');
  const roleContext = roleProfileContext(roleProfiles);

  const { object } = await generateObject({
    model: llm,
    schema: SignalsSchema,
    prompt: `You are Canon, an AI that monitors company Slack channels to keep GTM teams current.

Analyze these Slack knowledge chunks and determine whether they contain a clear signal of ${CATEGORY_DESCRIPTIONS[category]}.

Use these role job descriptions when deciding affected_roles and recommended actions:
${roleContext}

Only flag signals if there is genuine, actionable information — not general chatter or tangentially related messages. If the chunks are vague, unrelated, or insufficient to form a clear signal, return an empty signals array.

Return up to 3 distinct signals for this category. Do not collapse unrelated customer blockers into one generic signal. Do not duplicate the same signal with different wording.

Knowledge chunks:
${chunkText}

For each clear signal, provide:
- title: A concise headline (under 10 words)
- summary: 1–2 sentences describing what GTM teams need to know
- recommended_action: A specific next step starting with a verb (e.g. "Update the Day 14 milestone with...")
- impact_level: How urgently teams need this (low / medium / high)
- affected_roles: Which roles are affected based on the role job descriptions and concrete implications (subset of: AI Solutions Architect, Solutions Engineer, Implementation Engineer)

If there is no clear signal, return { "signals": [] }.`,
  });

  return object.signals;
}

async function detectCompanyReadinessSignals(params: {
  chunks: KnowledgeChunkResult[];
  roleProfiles: RoleProfileResult[];
}): Promise<Array<z.infer<typeof CompanySignalItemSchema>>> {
  const { chunks, roleProfiles } = params;

  if (chunks.length === 0) return [];

  const chunkText = chunks.map((c) => c.content).join('\n\n---\n\n');
  const roleContext = roleProfileContext(roleProfiles);

  const { object } = await generateObject({
    model: llm,
    schema: CompanySignalsSchema,
    prompt: `You are Canon, an AI that monitors company knowledge to keep technical GTM teams continuously ready.

Analyze these knowledge chunks and extract any company-related readiness signals. Do not depend on exact keywords or a predefined topic list. Use judgment: if a Solutions Engineer, AI Solutions Architect, Implementation Engineer, or customer-facing technical teammate would need to change what they say, demo, qualify, document, escalate, configure, or promise, it is a readiness signal.

Use these role job descriptions when deciding whether each signal applies to each role:
${roleContext}

Strong signals include, but are not limited to:
- product gaps, maturity concerns, reliability issues, permissions/audit/reporting issues, integration limitations, pricing or packaging confusion
- customer objections, trust issues, support escalations, repeated tickets, stakeholder hesitation, rollout risk
- demo-to-reality mismatch, outdated talk tracks, unclear positioning, expectation gaps created during sales or onboarding
- implementation blockers, auth/configuration ambiguity, migration risk, manual work replacing expected automation, unsupported architecture concerns
- process changes, owner gaps, missing documentation, launch timing risk, enablement requests, or preventative guidance

Only return signals with concrete implications and a clear recommended action. Do not return general chatter, vague status updates, or duplicates. If multiple unrelated blockers appear, return them as separate signals.

Map every signal to the closest category:
- product_change: product capability, limitation, maturity, reliability, reporting, admin controls, pricing/packaging, rollout, or customer-facing product gap
- customer_objection: customer concern, trust issue, objection, escalation, repeated support complaint, stakeholder hesitation, or response gap
- demo_guidance: demo narrative, sales expectation mismatch, talk track, presentation, proof point, or demo flow change
- implementation_pattern: setup, auth, configuration, deployment, migration, architecture, integration, go-live, or delivery risk

Knowledge chunks:
${chunkText}

For each clear signal, provide:
- category
- title: A concise headline (under 10 words)
- summary: 1–2 sentences describing what technical GTM teams need to know
- recommended_action: A specific next step starting with a verb
- impact_level: How urgently teams need this (low / medium / high)
- affected_roles: Which roles are affected based on the role job descriptions and concrete implications (subset of: AI Solutions Architect, Solutions Engineer, Implementation Engineer)

If there is no clear signal, return { "signals": [] }.`,
  });

  return object.signals;
}

function normalizeChunk(row: {
  id: string;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity?: number | null;
}): KnowledgeChunkResult {
  return {
    id: row.id,
    content: row.content,
    metadata: row.metadata ?? {},
    similarity: typeof row.similarity === 'number' ? row.similarity : 0,
  };
}

function isGeneratedReadinessChunk(content: string) {
  return /(^|\n)\*(readiness|product changes|customer objections|demo guidance|implementation patterns|product|customer objections|implementation patterns) update\*/i.test(content);
}

function nonGeneratedReadinessChunks(chunks: KnowledgeChunkResult[]) {
  return chunks.filter((chunk) => !isGeneratedReadinessChunk(chunk.content));
}

function uniqueChunks(chunks: KnowledgeChunkResult[]) {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    if (seen.has(chunk.id)) return false;
    seen.add(chunk.id);
    return true;
  });
}

function uniqueChunkMetadataStrings(chunks: KnowledgeChunkResult[], key: string) {
  return Array.from(
    new Set(
      chunks
        .map((chunk) => chunk.metadata?.[key])
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    )
  );
}

function signalKey(signal: {
  category: ReadinessCategory;
  title: string;
  summary: string;
}) {
  return `${signal.category}:${signal.title}:${signal.summary}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function metadataStringArray(item: Pick<ReadinessDeliveryItem, 'source_metadata'>, key: string) {
  const value = item.source_metadata?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}

function compactText(value: string, maxLength: number) {
  const compacted = value.replace(/\s+/g, ' ').trim();
  return compacted.length <= maxLength ? compacted : compacted.slice(0, maxLength - 1).trimEnd();
}

function roleProfileContext(roleProfiles: RoleProfileResult[]) {
  const profilesByRole = new Map(roleProfiles.map((profile) => [profile.role, profile]));
  return ALL_ROLES.map((role) => {
    const jobDescription = compactText(profilesByRole.get(role)?.job_description ?? '', 1800);
    return jobDescription
      ? `${role}:\n${jobDescription}`
      : `${role}:\nNo job description provided. Use only explicit evidence and the role title.`;
  }).join('\n\n');
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

function evidenceFromChunks(chunks: KnowledgeChunkResult[]) {
  const seen = new Set<string>();
  return chunks.flatMap((chunk) => {
    const channelId = typeof chunk.metadata.channel_id === 'string' ? chunk.metadata.channel_id : null;
    const channelName = typeof chunk.metadata.channel_name === 'string' ? chunk.metadata.channel_name : null;
    const messageTs = typeof chunk.metadata.latest_ts === 'string'
      ? chunk.metadata.latest_ts
      : typeof chunk.metadata.earliest_ts === 'string'
        ? chunk.metadata.earliest_ts
        : null;

    if (!channelId && !channelName) return [];

    const key = `${channelId ?? ''}:${messageTs ?? channelName ?? ''}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      provider: 'slack',
      channel_id: channelId,
      channel_name: channelName,
      message_ts: messageTs,
      url: channelId ? slackMessageUrl(channelId, messageTs) : null,
    }];
  });
}

function buildReadinessNote(items: ReadinessDeliveryItem[]) {
  const categories = Array.from(new Set(items.map((item) => item.category)));
  const title = categories.length === 1 ? CATEGORY_TITLES[categories[0]] : 'Readiness';
  const lines = [
    `*${title} update*`,
    '',
    ...items.flatMap((item) => [
      `*${item.title}*`,
      item.summary,
      item.recommended_action ? `_Recommended action:_ ${item.recommended_action}` : '',
      '',
    ]),
  ];

  return lines.filter((line, index, all) => line || all[index - 1]).join('\n').trim();
}

async function fallbackReadinessChannel(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  organizationId: string;
}) {
  const { supabase, organizationId } = params;
  const { data: source } = await supabase
    .from('knowledge_sources')
    .select('slack_channel_id')
    .eq('organization_id', organizationId)
    .eq('provider', 'slack')
    .not('slack_channel_id', 'is', null)
    .order('last_synced_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return typeof source?.slack_channel_id === 'string' ? source.slack_channel_id : null;
}

async function activeRoleSlackUsers(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  organizationId: string;
  roles: HireRole[];
}) {
  const { supabase, organizationId, roles } = params;
  if (roles.length === 0) return [];

  const { data, error } = await supabase
    .from('new_hires')
    .select('slack_user_id')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .in('role', roles)
    .not('slack_user_id', 'is', null);

  if (error) throw error;

  return Array.from(
    new Set(
      (data ?? [])
        .map((row) => row.slack_user_id)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    )
  );
}

async function readinessDeliverySettings(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  organizationId: string;
}) {
  const { supabase, organizationId } = params;
  const { data, error } = await supabase
    .from('readiness_delivery_settings')
    .select('channel_ids, slack_user_ids')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    channelIds: Array.isArray(data.channel_ids)
      ? data.channel_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
    userIds: Array.isArray(data.slack_user_ids)
      ? data.slack_user_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
  };
}

async function deliverReadinessItems(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  ownerId: string;
  organizationId: string;
  items: ReadinessDeliveryItem[];
}) {
  const { supabase, ownerId, organizationId, items } = params;
  if (items.length === 0) return;

  const settings = await readinessDeliverySettings({ supabase, organizationId });
  const roles = Array.from(new Set(items.flatMap((item) => item.affected_roles)));

  let channelIds: string[];
  let userIds: string[];

  if (settings) {
    channelIds = settings.channelIds;
    userIds = settings.userIds;
  } else {
    const fallbackChannel = items.flatMap((item) => metadataStringArray(item, 'channel_ids'))[0]
      ?? (await fallbackReadinessChannel({ supabase, organizationId }));
    channelIds = fallbackChannel ? [fallbackChannel] : [];
    userIds = await activeRoleSlackUsers({ supabase, organizationId, roles });
  }

  const text = buildReadinessNote(items);
  const deliveries: Array<{ target: string; type: 'channel' | 'dm' } & SlackDeliveryResult> = [];

  log.info('delivery_plan', {
    orgId: organizationId,
    ownerId,
    itemCount: items.length,
    itemIds: items.map((item) => item.id),
    source: settings ? 'saved_settings' : 'fallback_targets',
    channels: channelIds,
    dmTargets: userIds,
    roles,
  });

  for (const channel of channelIds) {
    const sent = await sendSlackMessage({ userId: ownerId, channel, text });
    deliveries.push({ target: channel, type: 'channel', ...sent });
  }

  for (const slackUserId of userIds) {
    const sent = await sendSlackDirectMessage({ userId: ownerId, slackUserId, text });
    deliveries.push({ target: slackUserId, type: 'dm', ...sent });
  }

  for (const delivery of deliveries) {
    log.info('delivery_target_result', {
      orgId: organizationId,
      type: delivery.type,
      target: delivery.target,
      sent: delivery.sent,
      reason: delivery.reason,
      slackChannel: delivery.channel,
      slackTs: delivery.ts,
      permalink: delivery.permalink,
    });
  }

  const failed = deliveries.filter((delivery) => !delivery.sent);
  if (failed.length > 0 || deliveries.length === 0) {
    log.warn('delivery_failed', {
      orgId: organizationId,
      itemCount: items.length,
      failedTargets: failed.length,
      reason: failed[0]?.reason ?? 'no_channel_or_dm_targets',
      deliveries,
    });
    return;
  }

  const sentAt = new Date().toISOString();
  const { error } = await supabase
    .from('readiness_items')
    .update({ status: 'sent', sent_at: sentAt, updated_at: sentAt })
    .in('id', items.map((item) => item.id));

  if (error) throw error;

  log.info('delivery_sent', {
    orgId: organizationId,
    itemCount: items.length,
    channelTargets: deliveries.filter((delivery) => delivery.type === 'channel').length,
    dmTargets: deliveries.filter((delivery) => delivery.type === 'dm').length,
  });
}

async function fallbackSlackSourceMetadata(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  organizationId: string;
}) {
  const { supabase, organizationId } = params;
  const { data: source } = await supabase
    .from('knowledge_sources')
    .select('name, slack_channel_id, slack_channel_name')
    .eq('organization_id', organizationId)
    .eq('provider', 'slack')
    .order('last_synced_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return {
    channelId: typeof source?.slack_channel_id === 'string' ? source.slack_channel_id : null,
    channelName: typeof source?.slack_channel_name === 'string'
      ? source.slack_channel_name
      : typeof source?.name === 'string'
        ? source.name.replace(/^#/, '')
        : null,
  };
}

async function retrieveCandidateChunks(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  organizationId: string;
  category: ReadinessCategory;
}): Promise<ChunkRetrievalResult> {
  const { supabase, organizationId, category } = params;

  const { embedding: queryEmbedding } = await embed({
    model: embeddingModel,
    value: CATEGORY_QUERIES[category],
  });

  const { data: vectorChunks, error: vectorError } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    organization_id: organizationId,
    match_threshold: 0.35,
    match_count: 8,
  });

  if (vectorError) throw vectorError;

  const normalizedVectorChunks = nonGeneratedReadinessChunks(
    ((vectorChunks ?? []) as KnowledgeChunkResult[]).map(normalizeChunk)
  );

  const { data: recentChunks, error: recentError } = await supabase
    .from('knowledge_chunks')
    .select('id, content, metadata')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(25);

  if (recentError) throw recentError;

  const recentNonGeneratedChunks = nonGeneratedReadinessChunks(((recentChunks ?? []) as Array<{
    id: string;
    content: string;
    metadata: Record<string, unknown> | null;
  }>).map(normalizeChunk)).slice(0, 12);

  const chunks = uniqueChunks([...normalizedVectorChunks, ...recentNonGeneratedChunks]).slice(0, 12);

  return {
    chunks,
    strategy: normalizedVectorChunks.length > 0 ? 'vector_plus_recent' : chunks.length > 0 ? 'recent' : 'none',
    vectorMatches: normalizedVectorChunks.length,
    fallbackCandidates: recentChunks?.length ?? 0,
  };
}

async function retrieveCompanyReadinessChunks(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  organizationId: string;
}): Promise<ChunkRetrievalResult> {
  const { supabase, organizationId } = params;

  const { data: recentChunks, error: recentError } = await supabase
    .from('knowledge_chunks')
    .select('id, content, metadata')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (recentError) throw recentError;

  const chunks = nonGeneratedReadinessChunks(((recentChunks ?? []) as Array<{
    id: string;
    content: string;
    metadata: Record<string, unknown> | null;
  }>).map(normalizeChunk)).slice(0, 40);

  return {
    chunks,
    strategy: chunks.length > 0 ? 'company_recent' : 'none',
    vectorMatches: 0,
    fallbackCandidates: recentChunks?.length ?? 0,
  };
}

export const readinessAnalysisOnDemand = inngest.createFunction(
  {
    id: 'readiness-analysis-on-demand',
    name: 'Canon: Readiness Analysis (On Demand)',
    retries: 1,
  },
  { event: 'onboarding/readiness.generate.requested' },
  async ({ event, step }) => {
    const { organizationId, ownerId } = event.data as { organizationId: string; ownerId: string };
    const supabase = createServiceRoleClient();

    log.info('analysis_start', { organizationId, triggered: 'on_demand' });

    const orgs = [{ id: organizationId, owner_id: ownerId }];

    let totalSignals = 0;

    for (const org of orgs) {
      const result = await step.run(`analyze-org-${org.id}`, async () => {
        const { count } = await supabase
          .from('knowledge_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org.id);

        if (!count || count === 0) {
          log.info('org_skipped', { orgId: org.id, reason: 'no_knowledge_chunks' });
          return { signalsDetected: 0, signalsReviewed: 0 };
        }

        type ReadinessItemPayload = {
          organization_id: string;
          category: ReadinessCategory;
          title: string;
          summary: string;
          recommended_action: string | null;
          impact_level: string;
          affected_roles: HireRole[];
          source: string;
          source_url: null;
          source_metadata: object;
          status: string;
          updated_at: string;
        };

        const itemsToInsert: ReadinessItemPayload[] = [];
        const seenSignalKeys = new Set<string>();
        let signalsReviewedTotal = 0;
        const { data: roleProfileRows } = await supabase
          .from('role_profiles')
          .select('role, job_description')
          .eq('organization_id', org.id);
        const roleProfiles = (roleProfileRows ?? []) as RoleProfileResult[];
        const roleProfileSourceMetadata = roleProfileMetadata(roleProfiles);

        try {
          const retrieval = await retrieveCompanyReadinessChunks({
            supabase,
            organizationId: org.id,
          });
          const typedChunks = retrieval.chunks;
          signalsReviewedTotal += typedChunks.length;

          const signals = await detectCompanyReadinessSignals({ chunks: typedChunks, roleProfiles });

          if (signals.length === 0) {
            log.info('signal_none', {
              orgId: org.id,
              category: 'company_scan',
              chunksReviewed: typedChunks.length,
              retrievalStrategy: retrieval.strategy,
              vectorMatches: retrieval.vectorMatches,
              fallbackCandidates: retrieval.fallbackCandidates,
            });
          }

          const channelIds = uniqueChunkMetadataStrings(typedChunks, 'channel_id');
          const channelNames = uniqueChunkMetadataStrings(typedChunks, 'channel_name');
          const sourceEvidence = evidenceFromChunks(typedChunks);
          if (channelIds.length === 0 || channelNames.length === 0) {
            const fallbackSource = await fallbackSlackSourceMetadata({ supabase, organizationId: org.id });
            if (channelIds.length === 0 && fallbackSource.channelId) channelIds.push(fallbackSource.channelId);
            if (channelNames.length === 0 && fallbackSource.channelName) channelNames.push(fallbackSource.channelName);
            if (sourceEvidence.length === 0 && (fallbackSource.channelId || fallbackSource.channelName)) {
              sourceEvidence.push({
                provider: 'slack',
                channel_id: fallbackSource.channelId,
                channel_name: fallbackSource.channelName,
                message_ts: null,
                url: fallbackSource.channelId ? slackMessageUrl(fallbackSource.channelId, null) : null,
              });
            }
          }

          for (const signal of signals) {
            const key = signalKey(signal);
            if (seenSignalKeys.has(key)) continue;
            seenSignalKeys.add(key);

            itemsToInsert.push({
              organization_id: org.id,
              category: signal.category,
              title: signal.title,
              summary: signal.summary,
              recommended_action: signal.recommended_action ?? null,
              impact_level: signal.impact_level ?? 'medium',
              affected_roles: signal.affected_roles ?? ALL_ROLES,
              source: 'slack',
              source_url: null,
              source_metadata: {
                signals_reviewed: typedChunks.length,
                detected_by: 'company_readiness_scan',
                retrieval_strategy: retrieval.strategy,
                vector_matches: retrieval.vectorMatches,
                fallback_candidates: retrieval.fallbackCandidates,
                channel_ids: channelIds,
                channel_names: channelNames,
                source_evidence: sourceEvidence,
                role_profiles: roleProfileSourceMetadata,
              },
              status: 'draft',
              updated_at: new Date().toISOString(),
            });

            log.info('signal_detected', {
              orgId: org.id,
              category: signal.category,
              title: signal.title,
              impact: signal.impact_level,
              chunksReviewed: typedChunks.length,
              retrievalStrategy: retrieval.strategy,
            });
          }
        } catch (error) {
          log.error('signal_failed', { orgId: org.id, category: 'company_scan', error: errorMessage(error) });
        }

        for (const category of CATEGORIES) {
          try {
            const retrieval = await retrieveCandidateChunks({
              supabase,
              organizationId: org.id,
              category,
            });
            const typedChunks = retrieval.chunks;
            signalsReviewedTotal += typedChunks.length;

            const signals = await detectSignals({ category, chunks: typedChunks, roleProfiles });

            if (signals.length === 0) {
              log.info('signal_none', {
                orgId: org.id,
                category,
                chunksReviewed: typedChunks.length,
                retrievalStrategy: retrieval.strategy,
                vectorMatches: retrieval.vectorMatches,
                fallbackCandidates: retrieval.fallbackCandidates,
              });
              continue;
            }

            const channelIds = uniqueChunkMetadataStrings(typedChunks, 'channel_id');
            const channelNames = uniqueChunkMetadataStrings(typedChunks, 'channel_name');
            const sourceEvidence = evidenceFromChunks(typedChunks);
            if (channelIds.length === 0 || channelNames.length === 0) {
              const fallbackSource = await fallbackSlackSourceMetadata({ supabase, organizationId: org.id });
              if (channelIds.length === 0 && fallbackSource.channelId) channelIds.push(fallbackSource.channelId);
              if (channelNames.length === 0 && fallbackSource.channelName) channelNames.push(fallbackSource.channelName);
              if (sourceEvidence.length === 0 && (fallbackSource.channelId || fallbackSource.channelName)) {
                sourceEvidence.push({
                  provider: 'slack',
                  channel_id: fallbackSource.channelId,
                  channel_name: fallbackSource.channelName,
                  message_ts: null,
                  url: fallbackSource.channelId ? slackMessageUrl(fallbackSource.channelId, null) : null,
                });
              }
            }

            for (const signal of signals) {
              const key = signalKey({ category, title: signal.title, summary: signal.summary });
              if (seenSignalKeys.has(key)) continue;
              seenSignalKeys.add(key);

              itemsToInsert.push({
                organization_id: org.id,
                category,
                title: signal.title,
                summary: signal.summary,
                recommended_action: signal.recommended_action ?? null,
                impact_level: signal.impact_level ?? 'medium',
                affected_roles: signal.affected_roles ?? ALL_ROLES,
                source: 'slack',
                source_url: null,
                source_metadata: {
                  signals_reviewed: typedChunks.length,
                  detected_by: 'ai_pipeline',
                  retrieval_strategy: retrieval.strategy,
                  vector_matches: retrieval.vectorMatches,
                  fallback_candidates: retrieval.fallbackCandidates,
                  channel_ids: channelIds,
                  channel_names: channelNames,
                  source_evidence: sourceEvidence,
                  role_profiles: roleProfileSourceMetadata,
                },
                status: 'draft',
                updated_at: new Date().toISOString(),
              });

              log.info('signal_detected', {
                orgId: org.id,
                category,
                title: signal.title,
                impact: signal.impact_level,
                chunksReviewed: typedChunks.length,
                retrievalStrategy: retrieval.strategy,
              });
            }
          } catch (error) {
            log.error('signal_failed', { orgId: org.id, category, error: errorMessage(error) });
          }
        }

        if (itemsToInsert.length > 0) {
          const categoriesToRefresh = Array.from(new Set(itemsToInsert.map((item) => item.category)));
          const refreshedAt = new Date().toISOString();

          const { error: archiveError } = await supabase
            .from('readiness_items')
            .update({ status: 'archived', updated_at: refreshedAt })
            .eq('organization_id', org.id)
            .in('category', categoriesToRefresh)
            .neq('status', 'archived');

          if (archiveError) throw archiveError;

          log.info('signals_refreshed', {
            orgId: org.id,
            categories: categoriesToRefresh,
            itemCount: itemsToInsert.length,
          });

          const { data: insertedItems, error: insertError } = await supabase
            .from('readiness_items')
            .insert(itemsToInsert)
            .select('id, organization_id, category, title, summary, recommended_action, affected_roles, source_metadata');

          if (insertError) throw insertError;

          await deliverReadinessItems({
            supabase,
            ownerId: org.owner_id,
            organizationId: org.id,
            items: (insertedItems ?? []) as ReadinessDeliveryItem[],
          });
        }

        log.info('org_complete', {
          orgId: org.id,
          signalsDetected: itemsToInsert.length,
          signalsReviewed: signalsReviewedTotal,
        });

        return {
          signalsDetected: itemsToInsert.length,
          signalsReviewed: signalsReviewedTotal,
        };
      });
      totalSignals += result.signalsDetected;
    }

    log.info('analysis_complete', { orgsProcessed: 1, totalSignals });
    return { ok: true, orgsProcessed: 1, totalSignals };
  }
);

export const readinessAnalysis = inngest.createFunction(
  {
    id: 'readiness-analysis',
    name: 'Canon: Readiness Analysis',
    retries: 1,
  },
  { cron: '0 0 * * *' },
  async ({ step }) => {
    const supabase = createServiceRoleClient();

    log.info('analysis_start', {});

    const { data: orgs } = await supabase.from('organizations').select('id, owner_id');

    if (!orgs || orgs.length === 0) {
      log.info('analysis_complete', { orgsProcessed: 0 });
      return { ok: true, orgsProcessed: 0 };
    }

    let totalSignals = 0;

    for (const org of orgs) {
      const result = await step.run(`analyze-org-${org.id}`, async () => {
        const { count } = await supabase
          .from('knowledge_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org.id);

        if (!count || count === 0) {
          log.info('org_skipped', { orgId: org.id, reason: 'no_knowledge_chunks' });
          return { signalsDetected: 0, signalsReviewed: 0 };
        }

        type ReadinessItemPayload = {
          organization_id: string;
          category: ReadinessCategory;
          title: string;
          summary: string;
          recommended_action: string | null;
          impact_level: string;
          affected_roles: HireRole[];
          source: string;
          source_url: null;
          source_metadata: object;
          status: string;
          updated_at: string;
        };

        const itemsToInsert: ReadinessItemPayload[] = [];
        const seenSignalKeys = new Set<string>();
        let signalsReviewedTotal = 0;
        const { data: roleProfileRows } = await supabase
          .from('role_profiles')
          .select('role, job_description')
          .eq('organization_id', org.id);
        const roleProfiles = (roleProfileRows ?? []) as RoleProfileResult[];
        const roleProfileSourceMetadata = roleProfileMetadata(roleProfiles);

        try {
          const retrieval = await retrieveCompanyReadinessChunks({
            supabase,
            organizationId: org.id,
          });
          const typedChunks = retrieval.chunks;
          signalsReviewedTotal += typedChunks.length;

          const signals = await detectCompanyReadinessSignals({ chunks: typedChunks, roleProfiles });

          if (signals.length === 0) {
            log.info('signal_none', {
              orgId: org.id,
              category: 'company_scan',
              chunksReviewed: typedChunks.length,
              retrievalStrategy: retrieval.strategy,
              vectorMatches: retrieval.vectorMatches,
              fallbackCandidates: retrieval.fallbackCandidates,
            });
          }

          const channelIds = uniqueChunkMetadataStrings(typedChunks, 'channel_id');
          const channelNames = uniqueChunkMetadataStrings(typedChunks, 'channel_name');
          const sourceEvidence = evidenceFromChunks(typedChunks);
          if (channelIds.length === 0 || channelNames.length === 0) {
            const fallbackSource = await fallbackSlackSourceMetadata({ supabase, organizationId: org.id });
            if (channelIds.length === 0 && fallbackSource.channelId) channelIds.push(fallbackSource.channelId);
            if (channelNames.length === 0 && fallbackSource.channelName) channelNames.push(fallbackSource.channelName);
            if (sourceEvidence.length === 0 && (fallbackSource.channelId || fallbackSource.channelName)) {
              sourceEvidence.push({
                provider: 'slack',
                channel_id: fallbackSource.channelId,
                channel_name: fallbackSource.channelName,
                message_ts: null,
                url: fallbackSource.channelId ? slackMessageUrl(fallbackSource.channelId, null) : null,
              });
            }
          }

          for (const signal of signals) {
            const key = signalKey(signal);
            if (seenSignalKeys.has(key)) continue;
            seenSignalKeys.add(key);

            itemsToInsert.push({
              organization_id: org.id,
              category: signal.category,
              title: signal.title,
              summary: signal.summary,
              recommended_action: signal.recommended_action ?? null,
              impact_level: signal.impact_level ?? 'medium',
              affected_roles: signal.affected_roles ?? ALL_ROLES,
              source: 'slack',
              source_url: null,
              source_metadata: {
                signals_reviewed: typedChunks.length,
                detected_by: 'company_readiness_scan',
                retrieval_strategy: retrieval.strategy,
                vector_matches: retrieval.vectorMatches,
                fallback_candidates: retrieval.fallbackCandidates,
                channel_ids: channelIds,
                channel_names: channelNames,
                source_evidence: sourceEvidence,
                role_profiles: roleProfileSourceMetadata,
              },
              status: 'draft',
              updated_at: new Date().toISOString(),
            });

            log.info('signal_detected', {
              orgId: org.id,
              category: signal.category,
              title: signal.title,
              impact: signal.impact_level,
              chunksReviewed: typedChunks.length,
              retrievalStrategy: retrieval.strategy,
            });
          }
        } catch (error) {
          log.error('signal_failed', { orgId: org.id, category: 'company_scan', error: errorMessage(error) });
        }

        for (const category of CATEGORIES) {
          try {
            const retrieval = await retrieveCandidateChunks({
              supabase,
              organizationId: org.id,
              category,
            });
            const typedChunks = retrieval.chunks;
            signalsReviewedTotal += typedChunks.length;

            const signals = await detectSignals({ category, chunks: typedChunks, roleProfiles });

            if (signals.length === 0) {
              log.info('signal_none', {
                orgId: org.id,
                category,
                chunksReviewed: typedChunks.length,
                retrievalStrategy: retrieval.strategy,
                vectorMatches: retrieval.vectorMatches,
                fallbackCandidates: retrieval.fallbackCandidates,
              });
              continue;
            }

            const channelIds = uniqueChunkMetadataStrings(typedChunks, 'channel_id');
            const channelNames = uniqueChunkMetadataStrings(typedChunks, 'channel_name');
            const sourceEvidence = evidenceFromChunks(typedChunks);
            if (channelIds.length === 0 || channelNames.length === 0) {
              const fallbackSource = await fallbackSlackSourceMetadata({ supabase, organizationId: org.id });
              if (channelIds.length === 0 && fallbackSource.channelId) channelIds.push(fallbackSource.channelId);
              if (channelNames.length === 0 && fallbackSource.channelName) channelNames.push(fallbackSource.channelName);
              if (sourceEvidence.length === 0 && (fallbackSource.channelId || fallbackSource.channelName)) {
                sourceEvidence.push({
                  provider: 'slack',
                  channel_id: fallbackSource.channelId,
                  channel_name: fallbackSource.channelName,
                  message_ts: null,
                  url: fallbackSource.channelId ? slackMessageUrl(fallbackSource.channelId, null) : null,
                });
              }
            }

            for (const signal of signals) {
              const key = signalKey({ category, title: signal.title, summary: signal.summary });
              if (seenSignalKeys.has(key)) continue;
              seenSignalKeys.add(key);

              itemsToInsert.push({
                organization_id: org.id,
                category,
                title: signal.title,
                summary: signal.summary,
                recommended_action: signal.recommended_action ?? null,
                impact_level: signal.impact_level ?? 'medium',
                affected_roles: signal.affected_roles ?? ALL_ROLES,
                source: 'slack',
                source_url: null,
                source_metadata: {
                  signals_reviewed: typedChunks.length,
                  detected_by: 'ai_pipeline',
                  retrieval_strategy: retrieval.strategy,
                  vector_matches: retrieval.vectorMatches,
                  fallback_candidates: retrieval.fallbackCandidates,
                  channel_ids: channelIds,
                  channel_names: channelNames,
                  source_evidence: sourceEvidence,
                  role_profiles: roleProfileSourceMetadata,
                },
                status: 'draft',
                updated_at: new Date().toISOString(),
              });

              log.info('signal_detected', {
                orgId: org.id,
                category,
                title: signal.title,
                impact: signal.impact_level,
                chunksReviewed: typedChunks.length,
                retrievalStrategy: retrieval.strategy,
              });
            }
          } catch (error) {
            log.error('signal_failed', { orgId: org.id, category, error: errorMessage(error) });
          }
        }

        if (itemsToInsert.length > 0) {
          const { data: existingItems } = await supabase
            .from('readiness_items')
            .select('category, title, summary')
            .eq('organization_id', org.id)
            .neq('status', 'archived');

          const existingSignalKeys = new Set(
            (existingItems ?? []).map((row) => signalKey({
              category: row.category as ReadinessCategory,
              title: row.title,
              summary: row.summary,
            }))
          );

          const toInsert = itemsToInsert.filter((item) => !existingSignalKeys.has(signalKey(item)));
          if (toInsert.length > 0) {
            const { data: insertedItems, error: insertError } = await supabase
              .from('readiness_items')
              .insert(toInsert)
              .select('id, organization_id, category, title, summary, recommended_action, affected_roles, source_metadata');

            if (insertError) throw insertError;

            await deliverReadinessItems({
              supabase,
              ownerId: org.owner_id,
              organizationId: org.id,
              items: (insertedItems ?? []) as ReadinessDeliveryItem[],
            });
          }
        }

        log.info('org_complete', {
          orgId: org.id,
          signalsDetected: itemsToInsert.length,
          signalsReviewed: signalsReviewedTotal,
        });

        return {
          signalsDetected: itemsToInsert.length,
          signalsReviewed: signalsReviewedTotal,
        };
      });
      totalSignals += result.signalsDetected;
    }

    log.info('analysis_complete', { orgsProcessed: orgs.length, totalSignals });
    return { ok: true, orgsProcessed: orgs.length, totalSignals };
  }
);
