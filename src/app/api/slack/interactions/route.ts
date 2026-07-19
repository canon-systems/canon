import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';
import { INNGEST_EVENTS } from '@/inngest/constants';
import {
  managerMilestoneDecisionConfig,
  managerReviewResultBlocks,
  recordManagerMilestoneDecision,
  recordMilestoneEvidence,
  syncAccessReadinessEvidence,
  type ManagerMilestoneDecision,
} from '@/lib/server/milestoneEvidence';
import { createLogger } from '@/lib/server/logging';
import { getAccessRequestContext } from '@/lib/server/slackInteractions';
import { getSlackBotTokenForOrganization } from '@/lib/server/slack/transport';

export const dynamic = 'force-dynamic';
// Must use nodejs runtime to access crypto and read the raw body
export const runtime = 'nodejs';

const log = createLogger('api.slack.interactions', {
  label: 'Slack Interactions',
  eventLabels: {
    interaction_received: 'Interaction Received',
    access_granted: 'Access Granted',
    milestone_feedback_received: 'Milestone Feedback Received',
    interaction_skipped: 'Interaction Skipped',
    interaction_failed: 'Interaction Failed',
  },
});

type SlackAction = {
  action_id: string;
  value?: string;
};

type SlackInteractionPayload = {
  type: string;
  trigger_id?: string;
  actions?: SlackAction[];
  response_url?: string;
  user?: { id: string; name: string };
  team?: { id?: string; domain?: string };
  view?: {
    callback_id: string;
    private_metadata: string;
    state: { values: Record<string, Record<string, { value?: string }>> };
  };
};

function verifySlackSignature(params: {
  signingSecret: string;
  signature: string;
  timestamp: string;
  rawBody: string;
}): boolean {
  const { signingSecret, signature, timestamp, rawBody } = params;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + createHmac('sha256', signingSecret).update(sigBase, 'utf8').digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

async function getBotTokenForHire(newHireId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data: hire } = await supabase
    .from('new_hires')
    .select('organization_id')
    .eq('id', newHireId)
    .single();
  if (!hire) return null;

  return getSlackBotTokenForOrganization({ supabase, organizationId: hire.organization_id });
}

async function openMilestoneFeedbackModal(params: {
  botToken: string;
  triggerId: string;
  newHireId: string;
  milestoneId: string;
  responseType: 'need_context' | 'blocked';
}): Promise<void> {
  const { botToken, triggerId, newHireId, milestoneId, responseType } = params;
  const privateMetadata = JSON.stringify({ new_hire_id: newHireId, milestone_id: milestoneId, response_type: responseType });
  await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'milestone_feedback',
        private_metadata: privateMetadata,
        title: { type: 'plain_text', text: responseType === 'blocked' ? "I'm Blocked" : 'Need Context' },
        submit: { type: 'plain_text', text: 'Send' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'input',
            block_id: 'feedback_block',
            label: { type: 'plain_text', text: 'What would help you move forward?' },
            element: {
              type: 'plain_text_input',
              action_id: 'feedback_message',
              multiline: true,
              placeholder: { type: 'plain_text', text: 'Describe what context you need or what\'s blocking you...' },
            },
          },
        ],
      },
    }),
  });
}

async function updateSlackMessage(responseUrl: string, toolName: string) {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_original: true,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Access granted* — you've marked *${toolName}* access as granted. The new hire has been notified to confirm.`,
            },
          },
        ],
        text: `Access granted for ${toolName}`,
      }),
    });
  } catch {
    log.warn('interaction_skipped', { reason: 'response_url_update_failed', toolName });
  }
}

function parseManagerMilestoneActionValue(value: string | undefined) {
  const [newHireId, milestoneId, evidenceId] = (value ?? '').split('|').map((entry) => entry.trim());
  return {
    newHireId: newHireId || null,
    milestoneId: milestoneId || null,
    evidenceId: evidenceId || null,
  };
}

async function updateManagerReviewMessage(params: {
  responseUrl: string | undefined;
  statusText: string;
  actor: string;
  reopenValue?: string;
}) {
  if (!params.responseUrl) return;

  try {
    await fetch(params.responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_original: true,
        blocks: managerReviewResultBlocks(params),
        text: params.statusText,
      }),
    });
  } catch {
    log.warn('interaction_skipped', { reason: 'manager_review_response_url_failed' });
  }
}

export async function POST(request: NextRequest) {
  // Always return 200 to Slack — any non-200 shows an error modal to the user.
  // Next.js will forward thrown Response objects (including fetch errors with a
  // status property) directly as the HTTP response, so every code path that can
  // throw must be wrapped.
  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch {
    log.warn('interaction_failed', { reason: 'failed_to_read_body' });
    return new NextResponse('', { status: 200 });
  }

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    log.error('interaction_failed', { reason: 'missing_SLACK_SIGNING_SECRET_env_var' });
    return new NextResponse('', { status: 200 });
  }

  const signature = request.headers.get('x-slack-signature') ?? '';
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? '';

  if (!verifySlackSignature({ signingSecret, signature, timestamp, rawBody })) {
    log.warn('interaction_failed', { reason: 'invalid_signature' });
    return new NextResponse('', { status: 200 });
  }

  let payload: SlackInteractionPayload;
  try {
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get('payload');
    if (!payloadStr) throw new Error('missing payload field');
    payload = JSON.parse(payloadStr) as SlackInteractionPayload;
  } catch {
    log.warn('interaction_failed', { reason: 'invalid_payload' });
    return new NextResponse('', { status: 200 });
  }

  log.info('interaction_received', { type: payload.type, actionId: payload.actions?.[0]?.action_id });

  try {
    if (payload.type === 'block_actions') {
      const action = payload.actions?.[0];

      if (action?.action_id === 'access_request_granted') {
        const accessRequestId = action.value;
        if (!accessRequestId) {
          log.warn('interaction_skipped', { reason: 'missing_access_request_id_in_button_value' });
          return new NextResponse('', { status: 200 });
        }

        const supabase = createServiceRoleClient();
        const requestContext = await getAccessRequestContext({
          supabase,
          accessRequestId,
          slackTeamId: payload.team?.id,
        });

        if (!requestContext) {
          log.warn('interaction_skipped', { reason: 'access_request_not_in_slack_workspace', accessRequestId });
          return new NextResponse('', { status: 200 });
        }

        const { data: updated, error } = await supabase
          .from('access_requests')
          .update({ status: 'granted', granted_at: new Date().toISOString() })
          .eq('id', accessRequestId)
          .eq('new_hire_id', requestContext.new_hire_id)
          .select()
          .single();

        if (error || !updated) {
          log.error('interaction_failed', { accessRequestId, reason: 'db_update_failed', error: error?.message });
          return new NextResponse('', { status: 200 });
        }

        log.info('access_granted', {
          accessRequestId,
          toolName: updated.tool_name,
          organizationId: requestContext.organization_id,
          grantedBy: payload.user?.name ?? payload.user?.id ?? '(unknown)',
        });

        // Fire side-effects independently so one failure doesn't block the other
        await syncAccessReadinessEvidence({ supabase, newHireId: requestContext.new_hire_id }).catch((err: unknown) => {
          log.warn('interaction_skipped', { reason: 'sync_readiness_failed', error: err instanceof Error ? err.message : String(err) });
        });

        await inngest.send({ name: INNGEST_EVENTS.ACCESS_GRANTED, data: { accessRequestId: updated.id } }).catch((err: unknown) => {
          log.warn('interaction_skipped', { reason: 'inngest_send_failed', error: err instanceof Error ? err.message : String(err) });
        });

        if (payload.response_url) {
          void updateSlackMessage(payload.response_url, updated.tool_name);
        }
      }

      if (
        action?.action_id === 'manager_milestone_verify' ||
        action?.action_id === 'manager_milestone_keep_open' ||
        action?.action_id === 'manager_milestone_mark_blocked' ||
        action?.action_id === 'manager_milestone_unverify'
      ) {
        const { newHireId, milestoneId, evidenceId } = parseManagerMilestoneActionValue(action.value);
        if (!newHireId || !milestoneId) {
          log.warn('interaction_skipped', { reason: 'missing_manager_milestone_button_params', actionId: action.action_id });
          return new NextResponse('', { status: 200 });
        }

        const supabase = createServiceRoleClient();
        const actor = payload.user?.name ?? payload.user?.id ?? 'a manager';
        const actionMetadata = {
          response_type: action.action_id.replace('manager_milestone_', ''),
          reviewed_from: 'slack_manager_review',
          reviewed_evidence_id: evidenceId,
          slack_user_id: payload.user?.id ?? null,
          slack_user_name: payload.user?.name ?? null,
        };

        const decision = action.action_id.replace('manager_milestone_', '') as ManagerMilestoneDecision;
        const evidenceConfig = managerMilestoneDecisionConfig(decision);
        const result = await recordManagerMilestoneDecision({
          supabase,
          newHireId,
          milestoneId,
          decision,
          source: 'manager_slack_review',
          sourceEventId: `manager-slack-review:${newHireId}:${milestoneId}:${action.action_id}:${payload.user?.id ?? 'unknown'}`,
          metadata: actionMetadata,
        });

        if (!result.ok) {
          log.error('interaction_failed', {
            reason: 'record_manager_review_failed',
            actionId: action.action_id,
            newHireId,
            milestoneId,
            error: result.error,
          });
          await updateManagerReviewMessage({
            responseUrl: payload.response_url,
            statusText: '*Canon could not save that review.* Open Canon and try again.',
            actor,
          });
          return new NextResponse('', { status: 200 });
        }

        await updateManagerReviewMessage({
          responseUrl: payload.response_url,
          statusText: evidenceConfig.statusText,
          actor,
          reopenValue: decision === 'verify'
            ? `${newHireId}|${milestoneId}|${evidenceId ?? ''}`
            : undefined,
        });

        log.info('milestone_feedback_received', {
          newHireId,
          milestoneId,
          evidenceId,
          responseType: action.action_id,
        });
      }

      if (action?.action_id === 'milestone_need_context' || action?.action_id === 'milestone_blocked') {
        const [newHireId, milestoneId] = (action.value ?? '').split('|');
        const responseType = action.action_id === 'milestone_blocked' ? 'blocked' : 'need_context';

        if (!newHireId || !milestoneId || !payload.trigger_id) {
          log.warn('interaction_skipped', { reason: 'missing_milestone_button_params', actionId: action.action_id });
          return new NextResponse('', { status: 200 });
        }

        const botToken = await getBotTokenForHire(newHireId);
        if (!botToken) {
          log.warn('interaction_skipped', { reason: 'no_bot_token_for_hire', newHireId });
          return new NextResponse('', { status: 200 });
        }

        await openMilestoneFeedbackModal({ botToken, triggerId: payload.trigger_id, newHireId, milestoneId, responseType }).catch((err: unknown) => {
          log.warn('interaction_skipped', { reason: 'open_modal_failed', error: err instanceof Error ? err.message : String(err) });
        });
      }

      if (action?.action_id === 'milestone_happened' || action?.action_id === 'milestone_did_not_happen') {
        const [newHireId, milestoneId] = (action.value ?? '').split('|');
        const happened = action.action_id === 'milestone_happened';

        if (!newHireId || !milestoneId) {
          log.warn('interaction_skipped', { reason: 'missing_milestone_button_params', actionId: action.action_id });
          return new NextResponse('', { status: 200 });
        }

        const supabase = createServiceRoleClient();
        await recordMilestoneEvidence({
          supabase,
          newHireId,
          milestoneId,
          evidenceType: happened ? 'communication_activity' : 'new_hire_blocker',
          trustLevel: happened ? 'medium' : 'low',
          confidence: happened ? 0.65 : 0.2,
          source: 'new_hire_slack_response',
          sourceEventId: `slack-action:${newHireId}:${milestoneId}:${action.action_id}:${payload.user?.id ?? 'unknown'}`,
          metadata: {
            response_type: happened ? 'happened' : 'did_not_happen',
            slack_user_id: payload.user?.id ?? null,
            slack_user_name: payload.user?.name ?? null,
          },
        }).catch((err: unknown) => {
          log.error('interaction_failed', { reason: 'record_milestone_action_failed', error: err instanceof Error ? err.message : String(err) });
        });

        log.info('milestone_feedback_received', {
          newHireId,
          milestoneId,
          responseType: happened ? 'happened' : 'did_not_happen',
        });
      }

      if (action?.action_id === 'access_confirmed_by_hire') {
        const accessRequestId = action.value;
        if (!accessRequestId) {
          log.warn('interaction_skipped', { reason: 'missing_access_request_id_in_confirm_button' });
          return new NextResponse('', { status: 200 });
        }

        const supabase = createServiceRoleClient();
        const requestContext = await getAccessRequestContext({
          supabase,
          accessRequestId,
          slackTeamId: payload.team?.id,
        });

        if (!requestContext) {
          log.warn('interaction_skipped', { reason: 'access_request_not_in_slack_workspace', accessRequestId });
          return new NextResponse('', { status: 200 });
        }

        const { data: updated, error } = await supabase
          .from('access_requests')
          .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
          .eq('id', accessRequestId)
          .eq('new_hire_id', requestContext.new_hire_id)
          .select()
          .single();

        if (error || !updated) {
          log.error('interaction_failed', { accessRequestId, reason: 'confirm_db_update_failed', error: error?.message });
          return new NextResponse('', { status: 200 });
        }

        log.info('access_granted', {
          accessRequestId,
          toolName: updated.tool_name,
          organizationId: requestContext.organization_id,
          confirmedBy: payload.user?.name ?? payload.user?.id ?? '(unknown)',
          event: 'hire_confirmed_access',
        });

        await syncAccessReadinessEvidence({ supabase, newHireId: requestContext.new_hire_id }).catch((err: unknown) => {
          log.warn('interaction_skipped', { reason: 'sync_readiness_after_confirm_failed', error: err instanceof Error ? err.message : String(err) });
        });

        if (payload.response_url) {
          try {
            await fetch(payload.response_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                replace_original: true,
                blocks: [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `✅ *Access confirmed* — you've confirmed your access to *${updated.tool_name}*. You're all set!`,
                    },
                  },
                ],
                text: `Access to ${updated.tool_name} confirmed`,
              }),
            });
          } catch {
            log.warn('interaction_skipped', { reason: 'confirm_response_url_failed', toolName: updated.tool_name });
          }
        }
      }
    }

    if (payload.type === 'view_submission' && payload.view?.callback_id === 'milestone_feedback') {
      let metadata: { new_hire_id?: string; milestone_id?: string; response_type?: string } = {};
      try {
        metadata = JSON.parse(payload.view.private_metadata) as typeof metadata;
      } catch {
        log.warn('interaction_failed', { reason: 'invalid_modal_private_metadata' });
        return new NextResponse('', { status: 200 });
      }

      const { new_hire_id: newHireId, milestone_id: milestoneId, response_type: responseType } = metadata;
      if (!newHireId || !milestoneId) {
        log.warn('interaction_skipped', { reason: 'missing_hire_or_milestone_in_modal_metadata' });
        return new NextResponse('', { status: 200 });
      }

      const message = payload.view.state.values['feedback_block']?.['feedback_message']?.value ?? '';
      const supabase = createServiceRoleClient();
      await recordMilestoneEvidence({
        supabase,
        newHireId,
        milestoneId,
        evidenceType: 'new_hire_blocker',
        trustLevel: 'low',
        confidence: 0.2,
        source: 'new_hire_slack_response',
        sourceEventId: `slack-modal:${newHireId}:${milestoneId}:${responseType ?? 'need_context'}`,
        metadata: { response_type: responseType ?? 'need_context', message },
      }).catch((err: unknown) => {
        log.error('interaction_failed', { reason: 'record_evidence_failed', error: err instanceof Error ? err.message : String(err) });
      });

      log.info('milestone_feedback_received', { newHireId, milestoneId, responseType: responseType ?? 'need_context' });
    }
  } catch (err: unknown) {
    log.error('interaction_failed', {
      reason: 'unhandled_exception',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return new NextResponse('', { status: 200 });
}
