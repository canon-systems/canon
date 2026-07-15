import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { embed, generateText } from 'ai';
import { llm, embeddingModel } from '@/lib/ai';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { syncAccessReadinessEvidence } from '@/lib/server/milestoneEvidence';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import { rampDayFromStartDate } from '@/lib/onboarding/rampDay';
import { pickNextActionableMilestone } from '@/lib/onboarding/milestone-ramp';
import { postSlackDm } from '@/lib/server/slack/transport';
import type { HireRole, RampMilestone, MilestoneEvidenceRequirement } from '@/types/onboarding';

const log = createLogger('inngest.daily_ramp_check', {
  label: 'Daily Ramp Check',
  eventLabels: {
    check_start: 'Check Started',
    check_complete: 'Check Completed',
    check_failed: 'Check Failed',
    delivery_sent: 'Delivery Sent',
    delivery_failed: 'Delivery Failed',
    delivery_skipped: 'Delivery Skipped',
  },
  componentColor: 'orange',
});

type KnowledgeChunkResult = { id: string; content: string; metadata: Record<string, unknown>; similarity: number };

function buildBlockKitMessage(params: {
  rampDay: number;
  milestoneTitle: string;
  body: string;
  nextMilestoneDay: number | null;
  nextMilestoneTitle: string | null;
  newHireId: string;
  milestoneId: string;
}): { blocks: unknown[]; text: string } {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Day ${params.rampDay} — ${params.milestoneTitle}`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: params.body },
    },
    { type: 'divider' },
  ];

  if (params.nextMilestoneDay !== null && params.nextMilestoneTitle) {
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `*Next up:* Day ${params.nextMilestoneDay} — ${params.nextMilestoneTitle}` },
      ],
    });
  }

  const buttonValue = `${params.newHireId}|${params.milestoneId}`;
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'This happened', emoji: true },
        value: buttonValue,
        action_id: 'milestone_happened',
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'This did not happen', emoji: true },
        value: buttonValue,
        action_id: 'milestone_did_not_happen',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Need more context', emoji: true },
        value: buttonValue,
        action_id: 'milestone_need_context',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: "I'm blocked", emoji: true },
        value: buttonValue,
        action_id: 'milestone_blocked',
        style: 'danger',
      },
    ],
  });

  return { blocks, text: `Day ${params.rampDay} — ${params.milestoneTitle}` };
}

function metadataStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}

function evidenceSummary(requirements: MilestoneEvidenceRequirement[]) {
  if (!Array.isArray(requirements) || requirements.length === 0) return 'Real work activity or manager-confirmed evidence.';
  return requirements.map((requirement) => requirement.label).join('; ');
}

async function generateSummary(params: {
  firstName: string;
  role: HireRole;
  rampDay: number;
  milestone: RampMilestone;
  chunks: KnowledgeChunkResult[];
  nextMilestone: RampMilestone | null;
}): Promise<string> {
  const { firstName, role, rampDay, milestone, chunks, nextMilestone } = params;
  const requirements = milestone.evidence_requirements ?? [];
  const realWorkTrigger = milestone.real_work_trigger ?? 'the relevant real work for this capability';
  const capabilityOutcome = milestone.capability_outcome ?? milestone.description;
  const briefingGoal = milestone.briefing_goal ?? milestone.description;
  const successSignals = metadataStringArray(milestone.success_signals);

  if (chunks.length === 0) {
    return `Hey ${firstName}, here is the next ramp step.\n\n*Why:* ${capabilityOutcome}\n*Watch for:* ${realWorkTrigger}\n*Proof:* ${evidenceSummary(requirements)}`;
  }

  const chunkText = chunks.map((c) => c.content).join('\n\n---\n\n');

  const prompt = `You are Canon, an onboarding agent for technical GTM teams. You have retrieved company knowledge for a real-work milestone. Write a concise Day ${rampDay} pre-brief for ${firstName}, who joined as a ${role}.

Milestone: ${milestone.title}
Capability outcome: ${capabilityOutcome}
Briefing goal: ${briefingGoal}
Real-work trigger: ${realWorkTrigger}
Success signals: ${successSignals.length > 0 ? successSignals.join('; ') : evidenceSummary(requirements)}
Evidence Canon will look for: ${evidenceSummary(requirements)}

Retrieved knowledge:
${chunkText}

Write a Slack message that:
- Opens with a friendly greeting using their first name
- Briefs them before the real work, without assigning homework or a practice task
- Uses this compact format:
  "Hey [first name], here is the next ramp step."
  "*Why:* one sentence"
  "*Watch for:* one sentence"
  "*Proof:* one sentence"
  Optional final line: "*Next:* ${nextMilestone ? `Day ${nextMilestone.day_trigger} — ${nextMilestone.title}` : 'Canon will wait for proof before sending the next step'}"
- Uses at most 95 words total
- Includes only the one or two most useful company-specific facts
- Never mentions "chunks", "embeddings", "RAG", or any technical implementation detail`;

  const { text } = await generateText({ model: llm, prompt });
  return text;
}

export const dailyRampCheck = inngest.createFunction(
  {
    id: 'daily-ramp-check',
    name: 'Canon: Send Next Due Ramp Milestone',
    retries: 1,
  },
  { cron: '0 9 * * *' },
  async ({ step }) => {
    const supabase = createServiceRoleClient();

    log.info('check_start', {});

    const { data: activeHires } = await supabase
      .from('new_hires')
      .select('id, organization_id, first_name, last_name, name, role, slack_user_id, start_date, ramp_day, status')
      .eq('status', 'active');

    if (!activeHires || activeHires.length === 0) {
      log.info('check_complete', { hiresProcessed: 0 });
      return { ok: true, hiresProcessed: 0 };
    }

    const orgIds = [...new Set(activeHires.map((h) => h.organization_id))];
    const { data: slackConnections } = await supabase
      .from('oauth_connections')
      .select('organization_id, connection_id')
      .in('organization_id', orgIds)
      .eq('provider', 'slack')
      .eq('status', 'active');

    const connectionByOrganization = new Map((slackConnections ?? []).map((c) => [c.organization_id, c.connection_id]));

    let processed = 0;
    let failed = 0;

    for (const hire of activeHires) {
      try {
        await step.run(`process-hire-${hire.id}`, async () => {
          const newRampDay = rampDayFromStartDate(hire.start_date);

          await supabase
            .from('new_hires')
            .update({ ramp_day: newRampDay, updated_at: new Date().toISOString() })
            .eq('id', hire.id);

          const { data: activeRole } = await supabase
            .from('role_profiles')
            .select('id')
            .eq('organization_id', hire.organization_id)
            .eq('role', hire.role)
            .eq('status', 'active')
            .maybeSingle();
          if (!activeRole) return;

          await syncAccessReadinessEvidence({
            supabase,
            newHireId: hire.id,
          });

          // Find one due approved company milestone. No global fallback.
          const { data: dueMilestones } = await supabase
            .from('ramp_milestones')
            .select('*')
            .eq('organization_id', hire.organization_id)
            .eq('role', hire.role)
            .eq('status', 'active')
            .lte('day_trigger', newRampDay)
            .order('day_trigger', { ascending: true })
            .limit(10);

          const dueIds = (dueMilestones ?? []).map((m) => m.id);
          if (dueIds.length === 0) return;

          const [{ data: existingDeliveries }, { data: progressRows }] = await Promise.all([
            supabase
              .from('ramp_deliveries')
              .select('milestone_id')
              .eq('new_hire_id', hire.id)
              .in('milestone_id', dueIds),
            supabase
              .from('new_hire_milestone_progress')
              .select('milestone_id, status')
              .eq('new_hire_id', hire.id)
              .in('milestone_id', dueIds),
          ]);

          const milestone = pickNextActionableMilestone(
            (dueMilestones ?? []) as RampMilestone[],
            (progressRows ?? []).map((row) => ({
              milestone_id: row.milestone_id,
              status: row.status,
            })),
            (existingDeliveries ?? []).map((row) => ({ milestone_id: row.milestone_id }))
          );
          if (!milestone) return;

          if (!hire.slack_user_id) {
            await supabase.from('ramp_deliveries').insert({
              new_hire_id: hire.id,
              milestone_id: milestone.id,
              delivery_status: 'failed',
              error_message: 'No Slack user ID configured',
            });
            return;
          }

          const connectionId = connectionByOrganization.get(hire.organization_id);
          if (!connectionId) {
            await supabase.from('ramp_deliveries').insert({
              new_hire_id: hire.id,
              milestone_id: milestone.id,
              delivery_status: 'failed',
              error_message: 'No Slack connection for organization',
            });
            return;
          }

          const botToken = await getProviderAccessToken({ provider: 'slack', connectionId });
          if (!botToken) {
            await supabase.from('ramp_deliveries').insert({
              new_hire_id: hire.id,
              milestone_id: milestone.id,
              delivery_status: 'failed',
              error_message: 'Could not retrieve Slack token for organization',
            });
            return;
          }

          // Find next milestone for context
          const { data: allMilestonesForRole } = await supabase
            .from('ramp_milestones')
            .select('day_trigger, title')
            .eq('role', hire.role)
            .eq('organization_id', hire.organization_id)
            .eq('status', 'active')
            .gt('day_trigger', newRampDay)
            .order('day_trigger', { ascending: true })
            .limit(1);

          const nextMilestone = allMilestonesForRole?.[0] ?? null;

          // Embed the knowledge query and retrieve relevant chunks
          const { embedding: queryEmbedding } = await embed({
            model: embeddingModel,
            value: milestone.retrieval_brief ?? milestone.knowledge_query,
          });

          const { data: chunks } = await supabase.rpc('match_knowledge_chunks', {
            query_embedding: JSON.stringify(queryEmbedding),
            organization_id: hire.organization_id,
            match_threshold: 0.7,
            match_count: 5,
          });

          const firstName = hire.first_name;
          const summaryText = await generateSummary({
            firstName,
            role: hire.role as HireRole,
            rampDay: newRampDay,
            milestone: milestone as RampMilestone,
            chunks: (chunks ?? []) as KnowledgeChunkResult[],
            nextMilestone: nextMilestone
              ? ({ day_trigger: nextMilestone.day_trigger, title: nextMilestone.title } as RampMilestone)
              : null,
          });

          const { blocks, text } = buildBlockKitMessage({
            rampDay: newRampDay,
            milestoneTitle: milestone.title,
            body: summaryText,
            nextMilestoneDay: nextMilestone?.day_trigger ?? null,
            nextMilestoneTitle: nextMilestone?.title ?? null,
            newHireId: hire.id,
            milestoneId: milestone.id,
          });

          const slackResult = await postSlackDm({
            botToken,
            slackUserId: hire.slack_user_id,
            blocks,
            text,
          });

          if (slackResult.ok) {
            await supabase
              .from('new_hire_milestone_progress')
              .upsert({
                new_hire_id: hire.id,
                milestone_id: milestone.id,
                status: 'briefed',
                current_confidence: 0,
                first_briefed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: 'new_hire_id,milestone_id' });

            await supabase.from('ramp_deliveries').insert({
              new_hire_id: hire.id,
              milestone_id: milestone.id,
              delivery_status: 'delivered',
              content_delivered: summaryText,
              slack_ts: slackResult.ts ?? null,
              delivered_at: new Date().toISOString(),
            });
            log.info('delivery_sent', { hireId: hire.id, milestoneId: milestone.id, rampDay: newRampDay });
          } else {
            await supabase.from('ramp_deliveries').insert({
              new_hire_id: hire.id,
              milestone_id: milestone.id,
              delivery_status: 'failed',
              content_delivered: summaryText,
              error_message: slackResult.error ?? 'Slack API returned ok=false',
            });
            log.info('delivery_failed', { hireId: hire.id, error: slackResult.error });
          }
        });
        processed++;
      } catch (error) {
        failed++;
        log.error('check_failed', { hireId: hire.id, error: errorMessage(error) });
      }
    }

    log.info('check_complete', { hiresProcessed: processed, failed });
    return { ok: true, hiresProcessed: processed, failed };
  }
);
