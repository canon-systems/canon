import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { extractJsonMiddleware, generateText, Output, wrapLanguageModel } from 'ai';
import { z } from 'zod';
import { llm } from '@/lib/ai';
import { createLogger, errorMessage } from '@/lib/server/logging';
import type { HireRole, MilestoneEvidenceRequirement, MilestoneSourceEvidence } from '@/types/onboarding';

const log = createLogger('inngest.milestone_proposal_generation', {
  label: 'Milestone Proposal Generation',
  eventLabels: {
    generation_start: 'Generation Started',
    generation_complete: 'Generation Complete',
    knowledge_loaded: 'Knowledge Loaded',
    org_skipped: 'Org Skipped',
    org_complete: 'Org Complete',
    role_complete: 'Role Complete',
    role_failed: 'Role Failed',
    proposals_insert_failed: 'Proposals Insert Failed',
  },
  componentColor: 'orange',
});

const ROLES: HireRole[] = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];
const PROMPT_CHUNK_LIMIT = 24;
const PROMPT_CHUNK_CHAR_LIMIT = 1200;

type KnowledgeChunkResult = {
  id: string;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const EvidenceRequirementSchema = z.object({
  type: z.enum(['access_readiness', 'tool_activity', 'communication_activity', 'customer_exposure']),
  label: z.string().min(3).max(120),
  required: z.boolean().optional(),
  trust_level: z.enum(['medium', 'high']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const ProposalSchema = z.object({
  suggested_day_trigger: z.number().int().min(0).max(120),
  title: z.string().min(4).max(90),
  capability_outcome: z.string().min(12).max(240),
  briefing_goal: z.string().min(12).max(240),
  real_work_trigger: z.string().min(8).max(180),
  success_signals: z.array(z.string().min(3).max(140)).min(1).max(5),
  retrieval_brief: z.string().min(10).max(240),
  evidence_requirements: z.array(EvidenceRequirementSchema).min(1).max(5),
  rationale: z.string().min(12).max(300),
  confidence: z.number().min(0).max(1),
});

const LooseEvidenceRequirementSchema = z.object({
  type: z.string().optional(),
  label: z.string().optional(),
  required: z.union([z.boolean(), z.string()]).optional(),
  trust_level: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const LooseProposalSchema = z.object({
  suggested_day_trigger: z.union([z.number(), z.string()]).optional(),
  title: z.string().optional(),
  capability_outcome: z.string().optional(),
  briefing_goal: z.string().optional(),
  real_work_trigger: z.string().optional(),
  success_signals: z.union([z.array(z.string()), z.string()]).optional(),
  retrieval_brief: z.string().optional(),
  evidence_requirements: z.array(LooseEvidenceRequirementSchema).optional(),
  rationale: z.string().optional(),
  confidence: z.union([z.number(), z.string()]).optional(),
}).passthrough();

const LooseProposalListSchema = z.object({
  proposals: z.array(LooseProposalSchema).optional(),
}).passthrough();

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function compactText(value: string, maxLength: number) {
  const compacted = value.replace(/\s+/g, ' ').trim();
  return compacted.length <= maxLength ? compacted : compacted.slice(0, maxLength - 1).trimEnd();
}

function stringValue(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim()
    ? compactText(value, maxLength)
    : '';
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function stringList(value: unknown, maxItems: number, maxLength: number) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\n|;|,/)
      : [];

  const seen = new Set<string>();
  return raw.flatMap((entry) => {
    const text = stringValue(entry, maxLength);
    if (!text || seen.has(text.toLowerCase())) return [];
    seen.add(text.toLowerCase());
    return [text];
  }).slice(0, maxItems);
}

function evidenceType(value: unknown, trigger: string): MilestoneEvidenceRequirement['type'] {
  if (
    value === 'access_readiness' ||
    value === 'tool_activity' ||
    value === 'communication_activity' ||
    value === 'customer_exposure'
  ) {
    return value;
  }

  if (/\b(customer|call|demo|qbr|kickoff|go-live|implementation|poc|proof of concept)\b/i.test(trigger)) return 'customer_exposure';
  if (/\b(slack|thread|message|email|status update|handoff)\b/i.test(trigger)) return 'communication_activity';
  if (/\b(access|permission|salesforce|gong|jira|github|confluence|crm)\b/i.test(trigger)) return 'access_readiness';
  return 'tool_activity';
}

function evidenceRequirements(value: unknown, trigger: string): MilestoneEvidenceRequirement[] {
  const parsed = Array.isArray(value) ? value : [];
  const requirements = parsed.flatMap((entry): MilestoneEvidenceRequirement[] => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const type = evidenceType(item.type, trigger);
    const label = stringValue(item.label, 120);
    const metadata = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
      ? item.metadata as Record<string, unknown>
      : undefined;
    if (!label) return [];
    return [{
      type,
      label,
      required: typeof item.required === 'boolean' ? item.required : true,
      trust_level: item.trust_level === 'high' ? 'high' : 'medium',
      metadata,
    }];
  }).slice(0, 5);

  if (requirements.length > 0) return requirements;
  return [{
    type: evidenceType(null, trigger),
    label: `Evidence shows the hire experienced: ${compactText(trigger, 78)}`,
    required: true,
    trust_level: 'medium',
  }];
}

function normalizeProposal(raw: z.infer<typeof LooseProposalSchema>) {
  const day = numberValue(raw.suggested_day_trigger);
  const title = stringValue(raw.title, 90);
  const capabilityOutcome = stringValue(raw.capability_outcome, 240);
  const briefingGoal = stringValue(raw.briefing_goal, 240);
  const realWorkTrigger = stringValue(raw.real_work_trigger, 180);
  const retrievalBrief = stringValue(raw.retrieval_brief, 240);
  const rationale = stringValue(raw.rationale, 300);

  if (day === null || !title || !capabilityOutcome || !briefingGoal || !realWorkTrigger || !retrievalBrief || !rationale) {
    return null;
  }

  const successSignals = stringList(raw.success_signals, 5, 140);
  const normalized = {
    suggested_day_trigger: Math.round(clamp(day, 0, 120)),
    title,
    capability_outcome: capabilityOutcome,
    briefing_goal: briefingGoal,
    real_work_trigger: realWorkTrigger,
    success_signals: successSignals.length > 0
      ? successSignals
      : [`Real work evidence matches ${compactText(realWorkTrigger, 110)}`],
    retrieval_brief: retrievalBrief,
    evidence_requirements: evidenceRequirements(raw.evidence_requirements, realWorkTrigger),
    rationale,
    confidence: clamp(numberValue(raw.confidence) ?? 0.5, 0, 1),
  };

  const parsed = ProposalSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

function chunkEvidence(chunks: KnowledgeChunkResult[]): MilestoneSourceEvidence[] {
  const seen = new Set<string>();
  return chunks.flatMap((chunk) => {
    const metadata = chunk.metadata ?? {};
    const provider = typeof metadata.provider === 'string' ? metadata.provider : 'slack';
    const channelId = typeof metadata.channel_id === 'string' ? metadata.channel_id : null;
    const channelName = typeof metadata.channel_name === 'string' ? metadata.channel_name : null;
    const sourceName = typeof metadata.source_name === 'string' ? metadata.source_name : null;
    const latestTs = typeof metadata.latest_ts === 'string' ? metadata.latest_ts : null;
    const label = channelName ? `#${channelName.replace(/^#/, '')}` : sourceName ?? provider;
    const url = channelId
      ? `https://slack.com/app_redirect?${new URLSearchParams({
        channel: channelId,
        ...(latestTs ? { message_ts: latestTs } : {}),
      }).toString()}`
      : null;
    const key = `${provider}:${label}:${url ?? chunk.id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ provider, label, url, metadata: { chunk_id: chunk.id } }];
  }).slice(0, 5);
}

async function generateRoleProposals(params: {
  chunks: KnowledgeChunkResult[];
  role: HireRole;
}) {
  const { chunks, role } = params;
  const promptChunks = chunks.slice(0, PROMPT_CHUNK_LIMIT);
  const chunkText = promptChunks.map((chunk, index) => {
    const metadata = chunk.metadata ?? {};
    const source = typeof metadata.channel_name === 'string'
      ? `#${metadata.channel_name}`
      : typeof metadata.source_name === 'string'
        ? metadata.source_name
        : 'company knowledge';
    return `Source ${index + 1} (${source}):\n${compactText(chunk.content, PROMPT_CHUNK_CHAR_LIMIT)}`;
  }).join('\n\n---\n\n');

  const { output } = await generateText({
    model: wrapLanguageModel({
      model: llm,
      middleware: extractJsonMiddleware(),
    }),
    output: Output.object({ schema: LooseProposalListSchema }),
    prompt: `You are Canon, an onboarding architect. Create empirical milestone proposals for a ${role}.

Return only JSON with this shape:
{
  "proposals": [
    {
      "suggested_day_trigger": 14,
      "title": "Short capability name",
      "capability_outcome": "What the hire can do after experiencing this work",
      "briefing_goal": "What Canon should brief before the experience",
      "real_work_trigger": "The real company activity that proves this milestone is relevant",
      "success_signals": ["Observable sign of readiness"],
      "retrieval_brief": "Phrase used to retrieve future company context",
      "evidence_requirements": [
        {
          "type": "tool_activity",
          "label": "Concrete evidence Canon can look for",
          "required": true,
          "trust_level": "medium",
          "metadata": {}
        }
      ],
      "rationale": "Why the company knowledge supports this milestone",
      "confidence": 0.7
    }
  ]
}

Use only the company knowledge below. Do not create generic onboarding defaults. If the knowledge is too thin or unrelated to this role, return {"proposals":[]}.

Milestones are pre-briefs before real work. They should prepare a new hire for a real experience and define concrete signals that prove the experience happened. Do not include practice tasks or homework.

Order proposals by likely ramp timing:
- Early: vocabulary, access, where work happens, first observation.
- Middle: participating in real customer/internal work with support.
- Later: owning meaningful work with less support.

Each proposal must include:
- title: short capability name
- capability_outcome: what the hire can do after experiencing this work
- briefing_goal: what Canon should brief before the experience
- real_work_trigger: the real activity that proves this milestone is relevant
- success_signals: observable signs of readiness
- retrieval_brief: phrase used to retrieve future company context
- evidence_requirements: concrete evidence types; prefer tool_activity, customer_exposure, communication_activity, or access_readiness
- if evidence type is access_readiness and specific tools are named, include metadata.tools as an array of tool names
- rationale: why the company knowledge supports this milestone
- confidence: 0-1 based on evidence specificity

Company knowledge:
${chunkText}`,
  });

  const parsed = LooseProposalListSchema.safeParse(output);
  const proposals = parsed.success ? parsed.data.proposals ?? [] : [];
  const normalized = proposals.flatMap((proposal) => {
    const result = normalizeProposal(proposal);
    return result ? [result] : [];
  });

  return {
    proposals: normalized,
    rawCount: proposals.length,
    invalidCount: Math.max(0, proposals.length - normalized.length),
    promptChunkCount: promptChunks.length,
  };
}

async function generateForOrg(organizationId: string) {
  const supabase = createServiceRoleClient();

  const { count } = await supabase
    .from('knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  if (!count || count === 0) {
    log.info('org_skipped', { orgId: organizationId, reason: 'no_knowledge_chunks' });
    return { proposalsCreated: 0, rolesProcessed: 0 };
  }

  const [{ data: chunks, error }, { data: activeMilestones }, { data: draftProposals }] = await Promise.all([
    supabase
      .from('knowledge_chunks')
      .select('id, content, metadata, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('ramp_milestones')
      .select('role, title, real_work_trigger')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .limit(500),
    supabase
      .from('milestone_proposals')
      .select('role, normalized_key')
      .eq('organization_id', organizationId)
      .eq('status', 'draft')
      .limit(500),
  ]);

  if (error) throw error;

  const typedChunks = (chunks ?? []) as KnowledgeChunkResult[];
  if (typedChunks.length === 0) return { proposalsCreated: 0, rolesProcessed: 0 };

  const sourceEvidence = chunkEvidence(typedChunks);
  log.info('knowledge_loaded', {
    orgId: organizationId,
    chunkCount: typedChunks.length,
    sourceCount: sourceEvidence.length,
  });

  // Build per-role dedup sets from the two prefetched queries
  const existingKeysByRole = new Map<HireRole, Set<string>>(
    ROLES.map((role) => {
      const keys = new Set<string>();
      for (const m of (activeMilestones ?? []).filter((m) => m.role === role)) {
        keys.add(normalizeKey(`${m.title}-${m.real_work_trigger ?? ''}`));
      }
      for (const p of (draftProposals ?? []).filter((p) => p.role === role)) {
        keys.add(p.normalized_key);
      }
      return [role, keys];
    })
  );

  const roleResults = await Promise.all(
    ROLES.map(async (role) => {
      try {
        const { proposals, rawCount, invalidCount, promptChunkCount } = await generateRoleProposals({ role, chunks: typedChunks });
        const existingKeys = existingKeysByRole.get(role) ?? new Set<string>();
        const inserts: object[] = [];
        let duplicateCount = 0;

        for (const proposal of proposals) {
          const normalizedKey = normalizeKey(`${proposal.title}-${proposal.real_work_trigger}`);
          if (!normalizedKey || existingKeys.has(normalizedKey)) {
            duplicateCount++;
            continue;
          }
          inserts.push({
            organization_id: organizationId,
            role,
            suggested_day_trigger: proposal.suggested_day_trigger,
            title: proposal.title,
            capability_outcome: proposal.capability_outcome,
            briefing_goal: proposal.briefing_goal,
            real_work_trigger: proposal.real_work_trigger,
            success_signals: proposal.success_signals,
            retrieval_brief: proposal.retrieval_brief,
            evidence_requirements: proposal.evidence_requirements,
            source_evidence: sourceEvidence,
            rationale: proposal.rationale,
            confidence: proposal.confidence,
            normalized_key: normalizedKey,
            status: 'draft',
            updated_at: new Date().toISOString(),
          });
        }

        if (inserts.length > 0) {
          const { error: insertError } = await supabase.from('milestone_proposals').insert(inserts);
          if (insertError) {
            log.error('proposals_insert_failed', { orgId: organizationId, role, insertCount: inserts.length, error: insertError.message });
            throw insertError;
          }
        }

        log.info('role_complete', {
          orgId: organizationId,
          role,
          promptChunks: promptChunkCount,
          rawProposals: rawCount,
          proposed: proposals.length,
          created: inserts.length,
          duplicatesSkipped: duplicateCount,
          invalidSkipped: invalidCount,
        });

        return { created: inserts.length, success: true };
      } catch (error) {
        log.error('role_failed', { orgId: organizationId, role, error: errorMessage(error) });
        return { created: 0, success: false };
      }
    })
  );

  const proposalsCreated = roleResults.reduce((sum, r) => sum + r.created, 0);
  const rolesProcessed = roleResults.filter((r) => r.success).length;
  log.info('org_complete', { orgId: organizationId, proposalsCreated, rolesProcessed });
  return { proposalsCreated, rolesProcessed };
}

export const milestoneProposalGeneration = inngest.createFunction(
  {
    id: 'milestone-proposal-generation',
    name: 'Canon: Milestone Proposal Generation',
    retries: 1,
  },
  { event: 'onboarding/milestones.generate.requested' },
  async ({ event, step }) => {
    const organizationId = event.data?.organizationId as string | undefined;
    log.info('generation_start', { organizationId: organizationId ?? 'all' });

    const supabase = createServiceRoleClient();
    const orgs = organizationId
      ? [{ id: organizationId }]
      : ((await supabase.from('organizations').select('id')).data ?? []);

    let totalCreated = 0;
    for (const org of orgs) {
      const result = await step.run(`generate-org-${org.id}`, () => generateForOrg(org.id));
      totalCreated += result.proposalsCreated;
    }

    log.info('generation_complete', { orgsProcessed: orgs.length, proposalsCreated: totalCreated });
    return { ok: true, orgsProcessed: orgs.length, proposalsCreated: totalCreated };
  }
);

export const milestoneProposalScheduledGeneration = inngest.createFunction(
  {
    id: 'milestone-proposal-scheduled-generation',
    name: 'Canon: Scheduled Milestone Proposal Generation',
    retries: 1,
  },
  { cron: '0 7 * * 1' },
  async ({ step }) => {
    log.info('generation_start', { organizationId: 'scheduled_all' });
    const supabase = createServiceRoleClient();
    const { data: orgs } = await supabase.from('organizations').select('id');

    let totalCreated = 0;
    for (const org of orgs ?? []) {
      const result = await step.run(`scheduled-generate-org-${org.id}`, () => generateForOrg(org.id));
      totalCreated += result.proposalsCreated;
    }

    log.info('generation_complete', { orgsProcessed: orgs?.length ?? 0, proposalsCreated: totalCreated });
    return { ok: true, orgsProcessed: orgs?.length ?? 0, proposalsCreated: totalCreated };
  }
);
