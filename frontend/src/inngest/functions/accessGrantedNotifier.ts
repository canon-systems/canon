import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';

type AccessGrantedEvent = {
  accessRequestId?: string;
};

const log = createLogger('inngest.access_granted_notifier', {
  label: 'Access Granted Notifier',
  eventLabels: {
    notifier_start: 'Notifier Started',
    notifier_complete: 'Notifier Completed',
    notifier_failed: 'Notifier Failed',
    notifier_skipped: 'Notifier Skipped',
  },
  componentColor: 'cyan',
});

async function sendHireConfirmationDM(params: {
  botToken: string;
  slackUserId: string;
  hireName: string;
  toolName: string;
}): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `You've been granted access to ${params.toolName}`, emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Hi ${params.hireName} 👋 Your access to *${params.toolName}* has been set up. Please log in and confirm everything looks good.`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Confirm access', emoji: true },
          style: 'primary',
          action_id: 'access_confirmed_by_hire',
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
      text: `You've been granted access to ${params.toolName} — please log in to confirm.`,
      unfurl_links: false,
    }),
  });

  const data = (await res.json()) as { ok: boolean; ts?: string; error?: string };
  return data;
}

export const accessGrantedNotifier = inngest.createFunction(
  {
    id: 'access-granted-notifier',
    name: 'Canon: Access Granted Notifier',
    retries: 2,
    idempotency: 'event.data.accessRequestId',
  },
  { event: 'onboarding/access.granted' },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as AccessGrantedEvent;
    const accessRequestId = typeof data.accessRequestId === 'string' ? data.accessRequestId : '';

    if (!accessRequestId) {
      throw new Error('Missing accessRequestId in event payload');
    }

    const supabase = createServiceRoleClient();

    const { data: request, error } = await supabase
      .from('access_requests')
      .select(`
        id, tool_name, status,
        new_hires (
          id, name, slack_user_id, organization_id,
          organizations ( id, owner_id )
        )
      `)
      .eq('id', accessRequestId)
      .single();

    if (error || !request) {
      log.info('notifier_skipped', { accessRequestId, reason: 'request_not_found' });
      return { skipped: true, reason: 'request_not_found' };
    }

    log.info('notifier_start', { accessRequestId, toolName: request.tool_name });

    const hire = request.new_hires as unknown as {
      name: string;
      slack_user_id: string | null;
      organizations: { owner_id: string } | { owner_id: string }[];
    };

    if (!hire?.slack_user_id) {
      log.warn('notifier_skipped', { accessRequestId, reason: 'no_hire_slack_id' });
      return { skipped: true, reason: 'no_hire_slack_id' };
    }

    const orgData = Array.isArray(hire.organizations) ? hire.organizations[0] : hire.organizations;
    const orgOwnerId = orgData?.owner_id;

    const { data: slackConnection } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('user_id', orgOwnerId)
      .eq('provider', 'slack')
      .eq('status', 'active')
      .maybeSingle();

    if (!slackConnection) {
      log.warn('notifier_skipped', { accessRequestId, reason: 'no_slack_connection — connect Slack in Settings → Integrations' });
      return { skipped: true, reason: 'no_slack_connection' };
    }

    const botToken = await getProviderAccessToken({ provider: 'slack', connectionId: slackConnection.connection_id });

    if (!botToken) {
      log.warn('notifier_skipped', { accessRequestId, reason: 'no_bot_token — Slack token could not be retrieved' });
      return { skipped: true, reason: 'no_bot_token' };
    }

    try {
      await step.run('send-hire-confirmation-dm', async () => {
        const result = await sendHireConfirmationDM({
          botToken,
          slackUserId: hire.slack_user_id!,
          hireName: hire.name,
          toolName: request.tool_name,
        });

        if (!result.ok) {
          throw new Error(`Slack API error: ${result.error ?? 'unknown'}`);
        }

        log.info('notifier_complete', { accessRequestId, toolName: request.tool_name });
        return { ok: true, ts: result.ts };
      });

      return { ok: true, accessRequestId };
    } catch (error) {
      log.error('notifier_failed', { accessRequestId, error: errorMessage(error) });
      throw error;
    }
  }
);
