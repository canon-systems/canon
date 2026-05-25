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
  strategy: 'vector' | 'recent_keyword_fallback' | 'none';
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

const ALL_ROLES: HireRole[] = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];

const CATEGORY_QUERIES: Record<ReadinessCategory, string> = {
  product_change:
    'product update feature change launch release announcement new capability limitation pricing',
  customer_objection:
    'customer concern objection pushback hesitation resistance problem complaint feedback',
  demo_guidance:
    'demo presentation pitch talk track narrative best practice show walkthrough discovery',
  implementation_pattern:
    'implementation setup configuration deployment technical pattern best practice architecture',
};

const CATEGORY_KEYWORDS: Record<ReadinessCategory, string[]> = {
  product_change: [
    'product',
    'feature',
    'launch',
    'release',
    'pricing',
    'packaging',
    'migration',
    'availability',
    'rollout',
    'capability',
    'limitation',
  ],
  customer_objection: [
    'objection',
    'pushback',
    'hesitation',
    'concern',
    'question',
    'blocker',
    'signature',
    'prospect',
    'customer',
    'momentum',
  ],
  demo_guidance: [
    'demo',
    'deck',
    'presentation',
    'pitch',
    'talk track',
    'narrative',
    'show',
    'walkthrough',
    'discovery',
    'conversion',
  ],
  implementation_pattern: [
    'implementation',
    'go-live',
    'deployment',
    'setup',
    'configuration',
    'technical',
    'project manager',
    'kickoff',
    'stakeholder',
    'approval',
  ],
};

const CATEGORY_DESCRIPTIONS: Record<ReadinessCategory, string> = {
  product_change:
    'a product change, new feature, launch, updated capability, or pricing/limit change that GTM teams need to know about',
  customer_objection:
    'a customer objection, concern, or recurring question pattern that GTM teams should have a prepared response to',
  demo_guidance:
    'updated demo guidance, new talk tracks, narrative changes, or presentation best practices',
  implementation_pattern:
    'an implementation pattern, technical setup change, common issue, or delivery best practice',
};

const CATEGORIES: ReadinessCategory[] = [
  'product_change',
  'customer_objection',
  'demo_guidance',
  'implementation_pattern',
];

const CATEGORY_TITLES: Record<ReadinessCategory, string> = {
  product_change: 'Product Changes',
  customer_objection: 'Customer Objections',
  demo_guidance: 'Demo Guidance',
  implementation_pattern: 'Implementation Patterns',
};

const SignalSchema = z.object({
  detected: z
    .boolean()
    .describe('Whether a clear, actionable signal was found in the knowledge chunks'),
  title: z.string().optional().describe('Concise headline under 10 words; omit if not detected'),
  summary: z
    .string()
    .optional()
    .describe('1–2 sentences describing the signal in plain language; omit if not detected'),
  recommended_action: z
    .string()
    .optional()
    .describe('Specific action starting with a verb; omit if not detected'),
  impact_level: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('Urgency for GTM teams; omit if not detected'),
  affected_roles: z
    .array(z.enum(['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer']))
    .optional()
    .describe('Which roles are affected; omit if not detected'),
});

async function detectSignal(params: {
  category: ReadinessCategory;
  chunks: KnowledgeChunkResult[];
}): Promise<z.infer<typeof SignalSchema>> {
  const { category, chunks } = params;

  if (chunks.length === 0) return { detected: false };

  const chunkText = chunks.map((c) => c.content).join('\n\n---\n\n');

  const { object } = await generateObject({
    model: llm,
    schema: SignalSchema,
    prompt: `You are Canon, an AI that monitors company Slack channels to keep GTM teams current.

Analyze these Slack knowledge chunks and determine whether they contain a clear signal of ${CATEGORY_DESCRIPTIONS[category]}.

Only flag a signal if there is genuine, actionable information — not general chatter or tangentially related messages. If the chunks are vague, unrelated, or insufficient to form a clear signal, set detected to false.

Knowledge chunks:
${chunkText}

If a clear signal exists, provide:
- title: A concise headline (under 10 words)
- summary: 1–2 sentences describing what GTM teams need to know
- recommended_action: A specific next step starting with a verb (e.g. "Update the Day 14 milestone with...")
- impact_level: How urgently teams need this (low / medium / high)
- affected_roles: Which roles are affected (subset of: AI Solutions Architect, Solutions Engineer, Implementation Engineer)

If there is no clear signal, set detected to false and omit all other fields.`,
  });

  return object;
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

function keywordScore(content: string, category: ReadinessCategory) {
  const normalized = content.toLowerCase();
  return CATEGORY_KEYWORDS[category].reduce((score, keyword) => {
    return normalized.includes(keyword) ? score + 1 : score;
  }, 0);
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

function metadataStringArray(item: Pick<ReadinessDeliveryItem, 'source_metadata'>, key: string) {
  const value = item.source_metadata?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
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
    .select('channel_id, slack_user_ids')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    channelId: typeof data.channel_id === 'string' && data.channel_id.trim().length > 0 ? data.channel_id : null,
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
  const channel = settings?.channelId ??
    items.flatMap((item) => metadataStringArray(item, 'channel_ids'))[0] ??
    (await fallbackReadinessChannel({ supabase, organizationId }));
  const roles = Array.from(new Set(items.flatMap((item) => item.affected_roles)));
  const userIds = settings
    ? settings.userIds
    : await activeRoleSlackUsers({ supabase, organizationId, roles });
  const text = buildReadinessNote(items);
  const deliveries: Array<{ target: string; type: 'channel' | 'dm' } & SlackDeliveryResult> = [];

  log.info('delivery_plan', {
    orgId: organizationId,
    ownerId,
    itemCount: items.length,
    itemIds: items.map((item) => item.id),
    source: settings ? 'saved_settings' : 'fallback_targets',
    channel: channel ?? 'none',
    dmTargets: userIds,
    roles,
  });

  if (channel) {
    const sent = await sendSlackMessage({ supabase, userId: ownerId, channel, text });
    deliveries.push({ target: channel, type: 'channel', ...sent });
  }

  for (const slackUserId of userIds) {
    const sent = await sendSlackDirectMessage({ supabase, userId: ownerId, slackUserId, text });
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

  const normalizedVectorChunks = ((vectorChunks ?? []) as KnowledgeChunkResult[]).map(normalizeChunk);
  if (normalizedVectorChunks.length > 0) {
    return {
      chunks: normalizedVectorChunks,
      strategy: 'vector',
      vectorMatches: normalizedVectorChunks.length,
      fallbackCandidates: 0,
    };
  }

  const { data: recentChunks, error: recentError } = await supabase
    .from('knowledge_chunks')
    .select('id, content, metadata')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(25);

  if (recentError) throw recentError;

  const rankedFallbackChunks = ((recentChunks ?? []) as Array<{
    id: string;
    content: string;
    metadata: Record<string, unknown> | null;
  }>)
    .map((chunk) => ({
      chunk: normalizeChunk(chunk),
      score: keywordScore(chunk.content, category),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ chunk }) => chunk);

  return {
    chunks: rankedFallbackChunks,
    strategy: rankedFallbackChunks.length > 0 ? 'recent_keyword_fallback' : 'none',
    vectorMatches: 0,
    fallbackCandidates: recentChunks?.length ?? 0,
  };
}

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
      await step.run(`analyze-org-${org.id}`, async () => {
        const { count } = await supabase
          .from('knowledge_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org.id);

        if (!count || count === 0) {
          log.info('org_skipped', { orgId: org.id, reason: 'no_knowledge_chunks' });
          return;
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
        let signalsReviewedTotal = 0;

        for (const category of CATEGORIES) {
          try {
            const retrieval = await retrieveCandidateChunks({
              supabase,
              organizationId: org.id,
              category,
            });
            const typedChunks = retrieval.chunks;
            signalsReviewedTotal += typedChunks.length;

            const signal = await detectSignal({ category, chunks: typedChunks });

            if (!signal.detected || !signal.title || !signal.summary) {
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
            totalSignals++;
          } catch (error) {
            log.error('signal_failed', { orgId: org.id, category, error: errorMessage(error) });
          }
        }

        if (itemsToInsert.length > 0) {
          const { data: existingItems } = await supabase
            .from('readiness_items')
            .select('category')
            .eq('organization_id', org.id)
            .neq('status', 'archived');

          const existingCategories = new Set(
            (existingItems ?? []).map((row) => row.category as ReadinessCategory)
          );

          const toInsert = itemsToInsert.filter((item) => !existingCategories.has(item.category));
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
      });
    }

    log.info('analysis_complete', { orgsProcessed: orgs.length, totalSignals });
    return { ok: true, orgsProcessed: orgs.length, totalSignals };
  }
);
