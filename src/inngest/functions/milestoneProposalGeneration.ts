import { inngest } from '../client';
import { INNGEST_EVENTS, INNGEST_FUNCTION_IDS } from '../constants';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { extractJsonMiddleware, generateText, Output, wrapLanguageModel } from 'ai';
import { z } from 'zod';
import { llm } from '@/lib/ai';
import { createLogger, errorMessage } from '@/lib/server/logging';
import {
  clampMilestoneDayToTarget,
  findAvailableMilestoneDay,
  generatedMilestoneSpacingDays,
  hasMilestoneContentOverlap,
  type MilestoneContentLike,
  normalizeMilestoneContentKey,
  normalizeRampTargets,
} from '@/lib/onboarding/milestone-ramp';
import type { Json, TablesInsert } from '@/lib/supabase/database.types';
import type { HireRole, MilestoneEvidenceRequirement, MilestoneSourceEvidence } from '@/types/onboarding';
import type { SupabaseClient } from '@supabase/supabase-js';

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

const PROMPT_CHUNK_LIMIT = 24;
const PROMPT_CHUNK_CHAR_LIMIT = 1200;
const MAX_PROPOSALS_PER_ROLE = 6;

const COMPANY_ANCHOR_STOPWORDS = new Set([
  'about',
  'after',
  'before',
  'briefing',
  'canon',
  'company',
  'complete',
  'context',
  'customer',
  'customers',
  'evidence',
  'foundation',
  'foundational',
  'learn',
  'learning',
  'manager',
  'milestone',
  'onboarding',
  'progress',
  'review',
  'should',
  'success',
  'support',
  'team',
  'teams',
  'training',
  'understand',
  'work',
  'workflow',
]);

type KnowledgeChunkResult = {
  id: string;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type RoleProfileResult = {
  role: HireRole;
  job_description: string | null;
  baseline_ramp_days: number | null;
  target_ramp_days: number | null;
};

type OrgToolResult = {
  tool_name: string;
  role: HireRole | null;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type ExistingMilestoneResult = {
  role: HireRole;
  day_trigger: number | null;
  title: string;
  capability_outcome: string | null;
  briefing_goal: string | null;
  real_work_trigger: string | null;
  success_signals: unknown;
  retrieval_brief: string | null;
  evidence_requirements: unknown;
};

type DraftProposalResult = {
  role: HireRole;
  suggested_day_trigger: number | null;
  normalized_key: string;
  title: string;
  capability_outcome: string;
  briefing_goal: string;
  real_work_trigger: string;
  success_signals: unknown;
  retrieval_brief: string;
  evidence_requirements: unknown;
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

function isMissingRampTargetColumn(error: SupabaseErrorLike | null | undefined) {
  if (!error) return false;
  const message = error.message ?? '';
  return message.includes('baseline_ramp_days') || message.includes('target_ramp_days');
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
  if (/\b(access|permission|salesforce|gong|github|crm)\b/i.test(trigger)) return 'access_readiness';
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

function normalizeProposal(raw: z.infer<typeof LooseProposalSchema>, targetRampDays: number) {
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
    suggested_day_trigger: clampMilestoneDayToTarget(day, targetRampDays),
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

function termSet(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 4 && !COMPANY_ANCHOR_STOPWORDS.has(term))
  );
}

function hasCompanyEvidenceAnchor(params: {
  proposal: z.infer<typeof ProposalSchema>;
  chunks: KnowledgeChunkResult[];
  tools: OrgToolResult[];
}) {
  const combined = [
    params.proposal.title,
    params.proposal.capability_outcome,
    params.proposal.briefing_goal,
    params.proposal.real_work_trigger,
    params.proposal.retrieval_brief,
    ...params.proposal.success_signals,
    ...params.proposal.evidence_requirements.map((requirement) => requirement.label),
  ].join(' ');
  const sourceText = params.chunks.map((chunk) => chunk.content.toLowerCase()).join('\n');
  const configuredToolMatch = params.tools.some((tool) => {
    const toolName = tool.tool_name.trim().toLowerCase();
    return toolName.length > 1 && combined.toLowerCase().includes(toolName) && sourceText.includes(toolName);
  });
  if (configuredToolMatch) return true;

  let sharedTerms = 0;
  for (const term of termSet(combined)) {
    if (sourceText.includes(term)) sharedTerms += 1;
    if (sharedTerms >= 2) return true;
  }
  return false;
}

function proposalPassesQualityGate(params: {
  proposal: z.infer<typeof ProposalSchema>;
  sourceEvidence: MilestoneSourceEvidence[];
  chunks: KnowledgeChunkResult[];
  tools: OrgToolResult[];
}) {
  const { proposal, sourceEvidence, chunks, tools } = params;
  if (sourceEvidence.length === 0) return false;
  if (proposal.evidence_requirements.length === 0 || proposal.success_signals.length === 0) return false;
  if (proposal.confidence < 0.45) return false;

  const combined = [
    proposal.title,
    proposal.capability_outcome,
    proposal.real_work_trigger,
    proposal.retrieval_brief,
  ].join(' ');

  if (/\b(learn the product|complete training|review documentation|meet the team|shadow a teammate|read the docs|company overview|product overview|onboarding basics|foundation training)\b/i.test(combined)) return false;
  if (!hasCompanyEvidenceAnchor({ proposal, chunks, tools })) return false;
  return /\b(customer|account|call|demo|implementation|handoff|tool|access|slack|salesforce|gong|support|workflow|launch|migration|objection|risk|owner|admin)\b/i.test(combined);
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
  roleProfile?: RoleProfileResult | null;
  tools: OrgToolResult[];
}) {
  const { chunks, role, roleProfile, tools } = params;
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
  const jobDescription = compactText(roleProfile?.job_description ?? '', 4000);
  const rampTargets = normalizeRampTargets({
    baselineRampDays: roleProfile?.baseline_ramp_days ?? null,
    targetRampDays: roleProfile?.target_ramp_days ?? null,
  });
  const roleTools = tools
    .filter((tool) => tool.role === null || tool.role === role)
    .map((tool) => tool.tool_name)
    .filter(Boolean)
    .slice(0, 20);
  const roleContext = jobDescription
    ? `Role job description:\n${jobDescription}`
    : `Role job description: Not provided. Use the role title only and avoid assumptions beyond company evidence.`;

  const { output } = await generateText({
    model: wrapLanguageModel({
      model: llm,
      middleware: extractJsonMiddleware(),
    }),
    output: Output.object({ schema: LooseProposalListSchema }),
    prompt: `You are Canon, an onboarding architect. Create customer-facing learning step proposals for a ${role}.

${roleContext}

Ramp target:
- Current ramp baseline: ${rampTargets.baselineRampDays} days
- Target ramp: ${rampTargets.targetRampDays} days
- Keep suggested_day_trigger within the target ramp window.
- Return at most ${MAX_PROPOSALS_PER_ROLE} proposals.
- Do not use fixed templates such as day 3, day 14, or day 30. Pick days from the evidence and leave breathing room between steps.
- Do not reuse the same suggested_day_trigger for more than one proposal. If two ideas belong on the same day, merge them into one sharper proposal.
- The path should build from the customer-specific basics this company actually shows into supported real work and then more independent execution.

Configured tools for this role:
${roleTools.length > 0 ? roleTools.map((tool) => `- ${tool}`).join('\n') : '- No role tools configured yet. Only mention tools that appear in company evidence.'}

Use simple, standalone language that a manager and new hire can understand without extra context. Use the company's own terminology when it appears in the source material, including product names, feature names, customer names, team names, acronyms, workflows, tools, and role names. Do not replace company terms with generic wording. If a company term may be unclear, keep the term and explain it briefly in plain language.

Return only JSON with this shape:
{
  "proposals": [
    {
      "suggested_day_trigger": 0,
      "title": "Short learning step name using company terminology when relevant",
      "capability_outcome": "What the hire should be able to do after this real work",
      "briefing_goal": "What Canon should explain before the experience",
      "real_work_trigger": "The real company activity that makes this step matter",
      "success_signals": ["Plain proof point that shows the hire did the work"],
      "retrieval_brief": "Plain phrase describing what Canon should look for later",
      "evidence_requirements": [
        {
          "type": "tool_activity",
          "label": "Concrete proof Canon can look for",
          "required": true,
          "trust_level": "medium",
          "metadata": {}
        }
      ],
      "rationale": "Why the company knowledge supports this learning step",
      "confidence": 0.7
    }
  ]
}

Use only the company knowledge below. Do not create generic onboarding defaults or a standard foundation path. If the knowledge is too thin, stale, or unrelated to this role, return {"proposals":[]}.

Use the job description to decide which company evidence matters for this role. Favor learning steps that connect role knowledge to the company's current operating reality: recent repeated customer issues, product changes, objections, implementation blockers, active tools, and handoffs. Recent source material should matter more than old static docs. Do not create learning steps for duties outside the role description unless the company knowledge clearly shows the role owns that work.

Learning steps are short briefings before real work. They should prepare a new hire for a real experience and define concrete proof that the experience happened. Do not include practice tasks or homework.

Order proposals by likely ramp timing from the evidence. Each later proposal should build on earlier customer-specific context. Do not create scattered day-based reminders or multiple same-day items.
Each proposal should be compact: one real-work trigger, one capability outcome, and the minimum proof needed to decide whether it happened.

Each proposal must include:
- title: short learning step name using company terminology when relevant
- capability_outcome: what the hire should be able to do after this real work
- briefing_goal: what Canon should explain before the experience
- real_work_trigger: the real activity that makes this step matter
- success_signals: plain proof points that show the hire did the work
- retrieval_brief: plain phrase describing what Canon should look for later
- evidence_requirements: concrete proof types; prefer tool_activity, customer_exposure, communication_activity, or access_readiness
- if evidence type is access_readiness and specific tools are named, include metadata.tools as an array of tool names
- rationale: why the company knowledge supports this learning step
- confidence: 0-1 based on evidence specificity

Company knowledge:
${chunkText}`,
  });

  const parsed = LooseProposalListSchema.safeParse(output);
  const proposals = parsed.success ? (parsed.data.proposals ?? []).slice(0, MAX_PROPOSALS_PER_ROLE) : [];
  const normalized = proposals.flatMap((proposal) => {
    const result = normalizeProposal(proposal, rampTargets.targetRampDays);
    return result ? [result] : [];
  });

  return {
    proposals: normalized,
    rawCount: proposals.length,
    invalidCount: Math.max(0, proposals.length - normalized.length),
    promptChunkCount: promptChunks.length,
  };
}

async function loadActiveRoleProfiles(
  supabase: SupabaseClient,
  organizationId: string
) {
  const withRampTargets = await supabase
    .from('role_profiles')
    .select('role, job_description, baseline_ramp_days, target_ramp_days')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('display_order', { ascending: true })
    .order('role', { ascending: true });

  if (!isMissingRampTargetColumn(withRampTargets.error)) {
    if (withRampTargets.error) throw withRampTargets.error;
    return (withRampTargets.data ?? []) as RoleProfileResult[];
  }

  log.warn('role_profile_ramp_columns_missing', {
    orgId: organizationId,
    error: withRampTargets.error?.message,
  });

  const legacyProfiles = await supabase
    .from('role_profiles')
    .select('role, job_description')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('display_order', { ascending: true })
    .order('role', { ascending: true });

  if (legacyProfiles.error) throw legacyProfiles.error;
  return ((legacyProfiles.data ?? []) as Array<Pick<RoleProfileResult, 'role' | 'job_description'>>).map((profile) => ({
    ...profile,
    baseline_ramp_days: null,
    target_ramp_days: null,
  }));
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

  const [
    chunksResult,
    activeMilestonesResult,
    draftProposalsResult,
    roleProfiles,
    orgToolsResult,
  ] = await Promise.all([
    supabase
      .from('knowledge_chunks')
      .select('id, content, metadata, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('ramp_milestones')
      .select('role, day_trigger, title, capability_outcome, briefing_goal, real_work_trigger, success_signals, retrieval_brief, evidence_requirements')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .limit(500),
    supabase
      .from('milestone_proposals')
      .select('role, suggested_day_trigger, normalized_key, title, capability_outcome, briefing_goal, real_work_trigger, success_signals, retrieval_brief, evidence_requirements')
      .eq('organization_id', organizationId)
      .eq('status', 'draft')
      .limit(500),
    loadActiveRoleProfiles(supabase, organizationId),
    supabase
      .from('org_tools')
      .select('tool_name, role')
      .eq('organization_id', organizationId),
  ]);

  if (chunksResult.error) throw chunksResult.error;
  if (activeMilestonesResult.error) throw activeMilestonesResult.error;
  if (draftProposalsResult.error) throw draftProposalsResult.error;
  if (orgToolsResult.error) throw orgToolsResult.error;

  const typedChunks = (chunksResult.data ?? []) as KnowledgeChunkResult[];
  if (typedChunks.length === 0) return { proposalsCreated: 0, rolesProcessed: 0 };

  const sourceEvidence = chunkEvidence(typedChunks);
  log.info('knowledge_loaded', {
    orgId: organizationId,
    chunkCount: typedChunks.length,
    sourceCount: sourceEvidence.length,
  });

  // Build per-role dedup sets from the two prefetched queries
  const activeRoles = roleProfiles
    .map((profile) => profile.role)
    .filter((role) => role.trim().length > 0);

  if (activeRoles.length === 0) {
    log.info('org_skipped', { orgId: organizationId, reason: 'no_active_roles' });
    return { proposalsCreated: 0, rolesProcessed: 0 };
  }

  const existingKeysByRole = new Map<HireRole, Set<string>>(
    activeRoles.map((role) => {
      const keys = new Set<string>();
      for (const m of ((activeMilestonesResult.data ?? []) as ExistingMilestoneResult[]).filter((m) => m.role === role)) {
        keys.add(normalizeMilestoneContentKey(`${m.title}-${m.real_work_trigger ?? ''}`));
      }
      for (const p of ((draftProposalsResult.data ?? []) as DraftProposalResult[]).filter((p) => p.role === role)) {
        keys.add(p.normalized_key);
      }
      return [role, keys];
    })
  );
  const existingContentByRole = new Map<HireRole, MilestoneContentLike[]>(
    activeRoles.map((role) => [
      role,
      [
        ...((activeMilestonesResult.data ?? []) as ExistingMilestoneResult[]).filter((item) => item.role === role),
        ...((draftProposalsResult.data ?? []) as DraftProposalResult[]).filter((item) => item.role === role),
      ],
    ])
  );
  const roleProfileByRole = new Map<HireRole, RoleProfileResult>(
    roleProfiles.map((profile) => [profile.role, profile])
  );

  const roleResults = await Promise.all(
    activeRoles.map(async (role) => {
      try {
        const { proposals, rawCount, invalidCount, promptChunkCount } = await generateRoleProposals({
          role,
          chunks: typedChunks,
          roleProfile: roleProfileByRole.get(role) ?? null,
          tools: (orgToolsResult.data ?? []) as OrgToolResult[],
        });
        const existingKeys = existingKeysByRole.get(role) ?? new Set<string>();
        const existingContent = existingContentByRole.get(role) ?? [];
        const roleProfile = roleProfileByRole.get(role) ?? null;
        const roleRampTargets = normalizeRampTargets({
          baselineRampDays: roleProfile?.baseline_ramp_days ?? null,
          targetRampDays: roleProfile?.target_ramp_days ?? null,
        });
        const occupiedDays = new Set<number>();
        for (const milestone of ((activeMilestonesResult.data ?? []) as ExistingMilestoneResult[]).filter((item) => item.role === role)) {
          if (typeof milestone.day_trigger === 'number') occupiedDays.add(milestone.day_trigger);
        }
        for (const proposal of ((draftProposalsResult.data ?? []) as DraftProposalResult[]).filter((item) => item.role === role)) {
          if (typeof proposal.suggested_day_trigger === 'number') occupiedDays.add(proposal.suggested_day_trigger);
        }
        const inserts: TablesInsert<'milestone_proposals'>[] = [];
        let duplicateCount = 0;
        let timingConflictCount = 0;
        let earliestDay = 0;

        for (const proposal of [...proposals].sort((a, b) => a.suggested_day_trigger - b.suggested_day_trigger)) {
          if (!proposalPassesQualityGate({
            proposal,
            sourceEvidence,
            chunks: typedChunks,
            tools: (orgToolsResult.data ?? []) as OrgToolResult[],
          })) continue;
          const normalizedKey = normalizeMilestoneContentKey(`${proposal.title}-${proposal.real_work_trigger}`);
          if (!normalizedKey || existingKeys.has(normalizedKey)) {
            duplicateCount++;
            continue;
          }
          if (hasMilestoneContentOverlap(proposal, existingContent)) {
            duplicateCount++;
            continue;
          }
          const assignedDay = findAvailableMilestoneDay({
            preferredDay: proposal.suggested_day_trigger,
            targetRampDays: roleRampTargets.targetRampDays,
            occupiedDays,
            earliestDay,
            minimumSpacingDays: generatedMilestoneSpacingDays(roleRampTargets.targetRampDays),
          });
          if (assignedDay === null) {
            timingConflictCount++;
            continue;
          }
          occupiedDays.add(assignedDay);
          earliestDay = assignedDay + generatedMilestoneSpacingDays(roleRampTargets.targetRampDays);
          existingKeys.add(normalizedKey);
          existingContent.push(proposal);
          inserts.push({
            organization_id: organizationId,
            role,
            suggested_day_trigger: assignedDay,
            title: proposal.title,
            capability_outcome: proposal.capability_outcome,
            briefing_goal: proposal.briefing_goal,
            real_work_trigger: proposal.real_work_trigger,
            success_signals: proposal.success_signals,
            retrieval_brief: proposal.retrieval_brief,
            evidence_requirements: proposal.evidence_requirements as unknown as Json,
            source_evidence: sourceEvidence as unknown as Json,
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
          timingConflictsSkipped: timingConflictCount,
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

async function updateGenerationRun(params: {
  generationRunId?: string;
  status: 'running' | 'completed' | 'failed';
  proposalsCreated?: number;
  rolesProcessed?: number;
  errorMessage?: string;
}) {
  if (!params.generationRunId) return;

  const supabase = createServiceRoleClient();
  const timestamp = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: params.status,
    updated_at: timestamp,
  };

  if (params.status === 'running') patch.started_at = timestamp;
  if (params.status === 'completed' || params.status === 'failed') patch.completed_at = timestamp;
  if (typeof params.proposalsCreated === 'number') patch.proposals_created = params.proposalsCreated;
  if (typeof params.rolesProcessed === 'number') patch.roles_processed = params.rolesProcessed;
  if (params.errorMessage) patch.error_message = params.errorMessage;

  await supabase
    .from('milestone_generation_runs')
    .update(patch)
    .eq('id', params.generationRunId);
}

export const generateMilestoneProposals = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.GENERATE_MILESTONE_PROPOSALS,
    name: 'Canon: Generate Role Ramp Milestone Proposals',
    retries: 1,
  },
  { event: INNGEST_EVENTS.MILESTONE_PROPOSALS_REQUESTED },
  async ({ event, step }) => {
    const organizationId = event.data?.organizationId as string | undefined;
    const generationRunId = event.data?.generationRunId as string | undefined;
    log.info('generation_start', { organizationId: organizationId ?? 'all', generationRunId });

    await step.run('mark-generation-running', () => updateGenerationRun({
      generationRunId,
      status: 'running',
    }));

    const supabase = createServiceRoleClient();
    try {
      const orgs = organizationId
        ? [{ id: organizationId }]
        : ((await supabase.from('organizations').select('id')).data ?? []);

      let totalCreated = 0;
      let totalRolesProcessed = 0;
      for (const org of orgs) {
        const result = await step.run(`generate-org-${org.id}`, () => generateForOrg(org.id));
        totalCreated += result.proposalsCreated;
        totalRolesProcessed += result.rolesProcessed;
      }

      await step.run('mark-generation-completed', () => updateGenerationRun({
        generationRunId,
        status: 'completed',
        proposalsCreated: totalCreated,
        rolesProcessed: totalRolesProcessed,
      }));

      log.info('generation_complete', { orgsProcessed: orgs.length, proposalsCreated: totalCreated, generationRunId });
      return { ok: true, orgsProcessed: orgs.length, proposalsCreated: totalCreated };
    } catch (error) {
      await step.run('mark-generation-failed', () => updateGenerationRun({
        generationRunId,
        status: 'failed',
        errorMessage: errorMessage(error),
      }));
      throw error;
    }
  }
);
