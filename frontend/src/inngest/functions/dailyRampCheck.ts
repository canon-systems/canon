import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { embed, generateText } from 'ai';
import { llm, embeddingModel } from '@/lib/ai';
import { createLogger, errorMessage } from '@/lib/server/logging';
import type { HireRole, RampMilestone } from '@/types/onboarding';

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
});

type KnowledgeChunkResult = { id: string; content: string; metadata: Record<string, unknown>; similarity: number };

async function sendSlackDM(params: {
  botToken: string;
  slackUserId: string;
  blocks: unknown[];
  text: string;
}): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: params.slackUserId,
      blocks: params.blocks,
      text: params.text,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });
  const data = (await res.json()) as { ok: boolean; ts?: string; error?: string };
  return data;
}

function buildBlockKitMessage(params: {
  rampDay: number;
  milestoneTitle: string;
  body: string;
  nextMilestoneDay: number | null;
  nextMilestoneTitle: string | null;
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

  return { blocks, text: `Day ${params.rampDay} — ${params.milestoneTitle}` };
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

  if (chunks.length === 0) {
    return `Hey ${firstName}! 👋\n\nWelcome to Day ${rampDay}. Today's focus: *${milestone.title}*.\n\n${milestone.description}\n\n_Our knowledge base is still being indexed — more context will flow your way as it syncs._`;
  }

  const chunkText = chunks.map((c) => c.content).join('\n\n---\n\n');

  const prompt = `You are Canon, an onboarding agent for technical GTM teams. You have retrieved the following knowledge chunks from the company's Slack history. Your job is to write a warm, helpful Day ${rampDay} message to ${firstName}, who just joined as a ${role}.

Milestone: ${milestone.title}
Goal: ${milestone.description}

Retrieved knowledge:
${chunkText}

Write a Slack message that:
- Opens with a friendly greeting using their first name
- Summarizes the most useful 2-3 insights from the knowledge in plain, conversational language
- Feels like a smart teammate sharing context, not a bot dumping data
- Ends with what to expect next (${nextMilestone ? `the next milestone: Day ${nextMilestone.day_trigger} — ${nextMilestone.title}` : 'that they are making great progress'})
- Is under 300 words total
- Never mentions "chunks", "embeddings", "RAG", or any technical implementation detail`;

  const { text } = await generateText({ model: llm, prompt });
  return text;
}

export const dailyRampCheck = inngest.createFunction(
  {
    id: 'daily-ramp-check',
    name: 'Canon: Daily Ramp Check',
    retries: 1,
  },
  { cron: '0 9 * * *' },
  async ({ step }) => {
    const supabase = createServiceRoleClient();

    log.info('check_start', {});

    const { data: activeHires } = await supabase
      .from('new_hires')
      .select('id, organization_id, name, role, slack_user_id, ramp_day, status')
      .eq('status', 'active');

    if (!activeHires || activeHires.length === 0) {
      log.info('check_complete', { hiresProcessed: 0 });
      return { ok: true, hiresProcessed: 0 };
    }

    // Fetch all organizations we need in one query
    const orgIds = [...new Set(activeHires.map((h) => h.organization_id))];
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, slack_bot_token')
      .in('id', orgIds);

    const orgMap = new Map((orgs ?? []).map((o) => [o.id, o]));

    let processed = 0;
    let failed = 0;

    for (const hire of activeHires) {
      try {
        await step.run(`process-hire-${hire.id}`, async () => {
          const newRampDay = hire.ramp_day + 1;

          await supabase
            .from('new_hires')
            .update({ ramp_day: newRampDay, updated_at: new Date().toISOString() })
            .eq('id', hire.id);

          // Find matching milestone — org-specific first, then global
          const { data: orgMilestones } = await supabase
            .from('ramp_milestones')
            .select('*')
            .eq('organization_id', hire.organization_id)
            .eq('role', hire.role)
            .eq('day_trigger', newRampDay);

          const { data: globalMilestones } = await supabase
            .from('ramp_milestones')
            .select('*')
            .is('organization_id', null)
            .eq('role', hire.role)
            .eq('day_trigger', newRampDay);

          const milestone = orgMilestones?.[0] ?? globalMilestones?.[0] ?? null;
          if (!milestone) return;

          // Check if already delivered
          const { data: existing } = await supabase
            .from('ramp_deliveries')
            .select('id')
            .eq('new_hire_id', hire.id)
            .eq('milestone_id', milestone.id)
            .maybeSingle();

          if (existing) {
            log.info('delivery_skipped', { hireId: hire.id, milestoneId: milestone.id, reason: 'already_delivered' });
            return;
          }

          if (!hire.slack_user_id) {
            await supabase.from('ramp_deliveries').insert({
              new_hire_id: hire.id,
              milestone_id: milestone.id,
              delivery_status: 'failed',
              error_message: 'No Slack user ID configured',
            });
            return;
          }

          const org = orgMap.get(hire.organization_id);
          if (!org?.slack_bot_token) {
            await supabase.from('ramp_deliveries').insert({
              new_hire_id: hire.id,
              milestone_id: milestone.id,
              delivery_status: 'failed',
              error_message: 'No Slack bot token for organization',
            });
            return;
          }

          // Find next milestone for context
          const { data: allMilestonesForRole } = await supabase
            .from('ramp_milestones')
            .select('day_trigger, title')
            .eq('role', hire.role)
            .is('organization_id', null)
            .gt('day_trigger', newRampDay)
            .order('day_trigger', { ascending: true })
            .limit(1);

          const nextMilestone = allMilestonesForRole?.[0] ?? null;

          // Embed the knowledge query and retrieve relevant chunks
          const { embedding: queryEmbedding } = await embed({
            model: embeddingModel,
            value: milestone.knowledge_query,
          });

          const { data: chunks } = await supabase.rpc('match_knowledge_chunks', {
            query_embedding: JSON.stringify(queryEmbedding),
            organization_id: hire.organization_id,
            match_threshold: 0.7,
            match_count: 5,
          });

          const firstName = hire.name.split(' ')[0];

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
          });

          const slackResult = await sendSlackDM({
            botToken: org.slack_bot_token,
            slackUserId: hire.slack_user_id,
            blocks,
            text,
          });

          if (slackResult.ok) {
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
