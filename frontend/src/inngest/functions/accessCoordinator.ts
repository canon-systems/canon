import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createLogger, errorMessage } from '@/lib/server/logging';

type AccessRequestCreatedEvent = {
  accessRequestId?: string;
};

const log = createLogger('inngest.access_coordinator', {
  label: 'Access Coordinator',
  eventLabels: {
    coordinator_start: 'Coordinator Started',
    coordinator_complete: 'Coordinator Completed',
    coordinator_failed: 'Coordinator Failed',
    coordinator_skipped: 'Coordinator Skipped',
  },
  componentColor: 'orange',
});

async function sendAccessRequestDM(params: {
  botToken: string;
  slackUserId: string;
  newHireName: string;
  newHireRole: string;
  requestedFromName: string | null;
  toolName: string;
}): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const greeting = params.requestedFromName ? `Hi ${params.requestedFromName}` : 'Hi';
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Access request for ${params.newHireName}`, emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${greeting} 👋 ${params.newHireName} just joined as ${params.newHireRole} and needs access to *${params.toolName}*. Could you grant them access when you get a chance?`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Mark as granted', emoji: true },
          style: 'primary',
          action_id: 'access_request_granted',
        },
      ],
    },
  ];

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: params.slackUserId,
      blocks,
      text: `Access request for ${params.newHireName}: needs access to ${params.toolName}`,
      unfurl_links: false,
    }),
  });

  const data = (await res.json()) as { ok: boolean; ts?: string; error?: string };
  return data;
}

export const accessCoordinator = inngest.createFunction(
  {
    id: 'access-coordinator',
    name: 'Canon: Access Coordinator',
    retries: 2,
    idempotency: 'event.data.accessRequestId',
  },
  { event: 'onboarding/access.request.created' },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as AccessRequestCreatedEvent;
    const accessRequestId = typeof data.accessRequestId === 'string' ? data.accessRequestId : '';

    if (!accessRequestId) {
      throw new Error('Missing accessRequestId in event payload');
    }

    const supabase = createServiceRoleClient();

    const { data: request, error } = await supabase
      .from('access_requests')
      .select(`
        id, tool_name, requested_from_name, requested_from_email, requested_from_slack_id, status,
        new_hire_id,
        new_hires (
          id, name, role, organization_id,
          organizations ( id, slack_bot_token )
        )
      `)
      .eq('id', accessRequestId)
      .single();

    if (error || !request) {
      log.info('coordinator_skipped', { accessRequestId, reason: 'request_not_found' });
      return { skipped: true, reason: 'request_not_found' };
    }

    log.info('coordinator_start', { accessRequestId, toolName: request.tool_name });

    if (!request.requested_from_slack_id) {
      log.warn('coordinator_skipped', { accessRequestId, reason: 'no_slack_id' });
      return { skipped: true, reason: 'no_slack_id_for_requester' };
    }

    const hire = request.new_hires as unknown as { name: string; role: string; organizations: { slack_bot_token: string | null } | { slack_bot_token: string | null }[] };
    const orgData = Array.isArray(hire.organizations) ? hire.organizations[0] : hire.organizations;
    const botToken = orgData?.slack_bot_token;

    if (!botToken) {
      log.warn('coordinator_skipped', { accessRequestId, reason: 'no_bot_token' });
      return { skipped: true, reason: 'no_bot_token' };
    }

    try {
      await step.run('send-slack-dm', async () => {
        const result = await sendAccessRequestDM({
          botToken,
          slackUserId: request.requested_from_slack_id!,
          newHireName: hire.name,
          newHireRole: hire.role,
          requestedFromName: request.requested_from_name,
          toolName: request.tool_name,
        });

        if (!result.ok) {
          throw new Error(`Slack API error: ${result.error ?? 'unknown'}`);
        }

        await supabase
          .from('access_requests')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', accessRequestId);

        log.info('coordinator_complete', { accessRequestId, toolName: request.tool_name });
        return { ok: true, ts: result.ts };
      });

      return { ok: true, accessRequestId };
    } catch (error) {
      log.error('coordinator_failed', { accessRequestId, error: errorMessage(error) });
      throw error;
    }
  }
);
