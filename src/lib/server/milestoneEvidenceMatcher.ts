import { generateObject } from 'ai';
import { z } from 'zod';
import { llm } from '@/lib/ai';
import type { ReadinessSourceEventRow } from '@/lib/server/readiness/source-events';
import type { MilestoneEvidenceType, RampMilestone } from '@/types/onboarding';

type HireContext = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role: string;
  slack_user_id: string | null;
};

export type MilestoneEvidenceMatch = {
  event: ReadinessSourceEventRow;
  evidenceType: Exclude<MilestoneEvidenceType, 'access_readiness' | 'manager_verification' | 'manager_reopened' | 'new_hire_blocker'>;
  confidence: number;
  reason: string;
  excerpt: string;
  matchedSignals: string[];
};

const MatchSchema = z.object({
  matches: z.array(z.object({
    source_index: z.number().int().min(1),
    evidence_type: z.enum(['tool_activity', 'communication_activity', 'customer_exposure']),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(8).max(400),
    excerpt: z.string().min(8).max(500),
    matched_signals: z.array(z.string().min(2).max(160)).max(5),
  })).max(3),
});

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'before',
  'brief',
  'canon',
  'customer',
  'customers',
  'during',
  'from',
  'have',
  'into',
  'learn',
  'milestone',
  'next',
  'proof',
  'role',
  'should',
  'step',
  'that',
  'their',
  'this',
  'with',
  'work',
]);

function compactText(value: string, maxLength: number) {
  const compacted = value.replace(/\s+/g, ' ').trim();
  return compacted.length <= maxLength ? compacted : compacted.slice(0, maxLength - 1).trimEnd();
}

function tokenSet(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
  );
}

function milestoneSearchText(milestone: RampMilestone) {
  return [
    milestone.title,
    milestone.description,
    milestone.capability_outcome,
    milestone.briefing_goal,
    milestone.real_work_trigger,
    milestone.retrieval_brief,
    milestone.knowledge_query,
    ...(milestone.success_signals ?? []),
    ...(milestone.evidence_requirements ?? []).map((requirement) => requirement.label),
  ].filter(Boolean).join(' ');
}

function eventRelevanceScore(params: {
  event: ReadinessSourceEventRow;
  milestoneTokens: Set<string>;
  hireTokens: Set<string>;
}) {
  const eventText = params.event.content.toLowerCase();
  let tokenScore = 0;

  for (const token of params.milestoneTokens) {
    if (eventText.includes(token)) tokenScore += 1;
  }

  for (const token of params.hireTokens) {
    if (eventText.includes(token)) tokenScore += 3;
  }

  if (tokenScore === 0) return 0;
  let score = tokenScore;
  if (params.event.source_type === 'team_chat') score += 0.5;
  if (params.event.source_type === 'transcript') score += 0.75;
  return score;
}

export function rankMilestoneEvidenceCandidates(params: {
  hire: HireContext;
  milestone: RampMilestone;
  events: ReadinessSourceEventRow[];
  limit?: number;
}) {
  const milestoneTokens = tokenSet(milestoneSearchText(params.milestone));
  const hireTokens = tokenSet([
    params.hire.first_name,
    params.hire.last_name,
    params.hire.email ?? '',
    params.hire.slack_user_id ?? '',
  ].join(' '));

  return params.events
    .map((event) => ({
      event,
      score: eventRelevanceScore({ event, milestoneTokens, hireTokens }),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = new Date(a.event.occurred_at ?? a.event.created_at).getTime();
      const bTime = new Date(b.event.occurred_at ?? b.event.created_at).getTime();
      return bTime - aTime;
    })
    .slice(0, params.limit ?? 8)
    .map((entry) => entry.event);
}

function sourceMaterial(events: ReadinessSourceEventRow[]) {
  return events.map((event, index) => [
    `Source ${index + 1}`,
    `provider=${event.provider}`,
    `type=${event.source_type}`,
    event.occurred_at ? `date=${event.occurred_at}` : '',
    '',
    compactText(event.content, 1800),
  ].filter((part) => part !== '').join('\n')).join('\n\n---\n\n');
}

function evidenceRequirementText(milestone: RampMilestone) {
  const requirements = milestone.evidence_requirements ?? [];
  if (requirements.length === 0) return 'No explicit proof requirements. Look for concrete real-work evidence only.';
  return requirements.map((requirement) => `- ${requirement.type}: ${requirement.label}`).join('\n');
}

export async function matchMilestoneEvidence(params: {
  hire: HireContext;
  milestone: RampMilestone;
  events: ReadinessSourceEventRow[];
}): Promise<MilestoneEvidenceMatch | null> {
  const candidates = rankMilestoneEvidenceCandidates(params);
  if (candidates.length === 0) return null;

  const { object } = await generateObject({
    model: llm,
    schema: MatchSchema,
    prompt: `You are Canon, an onboarding evidence reviewer.

Decide whether any source below proves that the new hire made real progress on the current milestone.

New hire:
- Name: ${params.hire.first_name} ${params.hire.last_name}
- Email: ${params.hire.email ?? 'unknown'}
- Slack user ID: ${params.hire.slack_user_id ?? 'unknown'}
- Role: ${params.hire.role}

Milestone:
- Title: ${params.milestone.title}
- Outcome: ${params.milestone.capability_outcome ?? params.milestone.description}
- Real work trigger: ${params.milestone.real_work_trigger ?? 'not specified'}
- Success signals: ${(params.milestone.success_signals ?? []).join('; ') || 'not specified'}

Evidence requirements:
${evidenceRequirementText(params.milestone)}

Rules:
- Return a match only when the source shows the new hire participated in or completed the real work, not just when the topic is mentioned.
- Use source material only. Do not infer completion from general company context.
- Slack or transcript evidence should need manager review, so do not treat it as final verification.
- Prefer customer-facing or real workflow evidence over generic chatter.
- If there is no concrete proof, return {"matches":[]}.

Source material:
${sourceMaterial(candidates)}`,
  });

  const best = object.matches
    .filter((match) => match.confidence >= 0.6)
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (!best) return null;

  const event = candidates[best.source_index - 1];
  if (!event) return null;

  return {
    event,
    evidenceType: best.evidence_type,
    confidence: Math.min(best.confidence, 0.79),
    reason: best.reason,
    excerpt: best.excerpt,
    matchedSignals: best.matched_signals,
  };
}
