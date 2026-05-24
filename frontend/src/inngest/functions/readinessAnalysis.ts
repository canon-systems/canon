import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { embed, generateObject } from 'ai';
import { z } from 'zod';
import { llm, embeddingModel } from '@/lib/ai';
import { createLogger, errorMessage } from '@/lib/server/logging';
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
  },
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
  { cron: '0 6 * * *' },
  async ({ step }) => {
    const supabase = createServiceRoleClient();

    log.info('analysis_start', {});

    const { data: orgs } = await supabase.from('organizations').select('id');

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

        const itemsToInsert: object[] = [];
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
          await supabase.from('readiness_items').insert(itemsToInsert);
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
