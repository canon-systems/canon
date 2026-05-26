import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';
import { syncAccessReadinessEvidence } from '@/lib/server/milestoneEvidence';
import { createLogger } from '@/lib/server/logging';

export const dynamic = 'force-dynamic';
// Must use nodejs runtime to access crypto and read the raw body
export const runtime = 'nodejs';

const log = createLogger('api.slack.interactions', {
  label: 'Slack Interactions',
  eventLabels: {
    interaction_received: 'Interaction Received',
    access_granted: 'Access Granted',
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
  actions?: SlackAction[];
  response_url?: string;
  user?: { id: string; name: string };
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

        const { data: updated, error } = await supabase
          .from('access_requests')
          .update({ status: 'granted' })
          .eq('id', accessRequestId)
          .select()
          .single();

        if (error || !updated) {
          log.error('interaction_failed', { accessRequestId, reason: 'db_update_failed', error: error?.message });
          return new NextResponse('', { status: 200 });
        }

        log.info('access_granted', {
          accessRequestId,
          toolName: updated.tool_name,
          grantedBy: payload.user?.name ?? payload.user?.id ?? '(unknown)',
        });

        // Fire side-effects independently so one failure doesn't block the other
        await syncAccessReadinessEvidence({ supabase, newHireId: updated.new_hire_id }).catch((err: unknown) => {
          log.warn('interaction_skipped', { reason: 'sync_readiness_failed', error: err instanceof Error ? err.message : String(err) });
        });

        await inngest.send({ name: 'onboarding/access.granted', data: { accessRequestId: updated.id } }).catch((err: unknown) => {
          log.warn('interaction_skipped', { reason: 'inngest_send_failed', error: err instanceof Error ? err.message : String(err) });
        });

        if (payload.response_url) {
          void updateSlackMessage(payload.response_url, updated.tool_name);
        }
      }
    }
  } catch (err: unknown) {
    log.error('interaction_failed', {
      reason: 'unhandled_exception',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return new NextResponse('', { status: 200 });
}
