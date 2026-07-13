import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';

type AccessGrantedEvent = {
  accessRequestId?: string;
};

type AccessRequestRow = {
  id: string;
  tool_name: string;
  status: string | null;
  new_hire_id: string | null;
};

type NewHireRow = {
  id: string;
  first_name: string;
  last_name: string;
  slack_user_id: string | null;
  organization_id: string | null;
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
  hireFirstName: string;
  toolName: string;
  accessRequestId: string;
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
        text: `Hi ${params.hireFirstName} 👋, \n\nYour access to *${params.toolName}* has been set up. Please log in and confirm everything looks good.`,
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
          value: params.accessRequestId,
        },
      ],
    },
  ];

  // conversations.open is required to get the DM channel ID before posting —
  // chat.postMessage with a raw user ID fails with channel_not_found if the bot
  // hasn't previously opened a DM with that user.
  const openRes = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ users: params.slackUserId }),
  });
  const openData = (await openRes.json()) as { ok: boolean; channel?: { id: string }; error?: string };
  if (!openData.ok || !openData.channel?.id) {
    return { ok: false, error: openData.error ?? 'conversations_open_failed' };
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: openData.channel.id,
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

    const { data: request, error: requestError } = await supabase
      .from('access_requests')
      .select('id, tool_name, status, new_hire_id')
      .eq('id', accessRequestId)
      .maybeSingle<AccessRequestRow>();

    if (requestError) {
      log.error('notifier_failed', {
        accessRequestId,
        reason: 'request_lookup_failed',
        error: requestError.message,
      });
      throw requestError;
    }

    if (!request) {
      log.info('notifier_skipped', { accessRequestId, reason: 'request_not_found' });
      return { skipped: true, reason: 'request_not_found' };
    }

    log.info('notifier_start', { accessRequestId, toolName: request.tool_name });

    if (!request.new_hire_id) {
      log.error('notifier_failed', { accessRequestId, reason: 'request_missing_new_hire_id' });
      throw new Error('Access request is missing new_hire_id');
    }

    const { data: hire, error: hireError } = await supabase
      .from('new_hires')
      .select('id, first_name, last_name, slack_user_id, organization_id')
      .eq('id', request.new_hire_id)
      .maybeSingle<NewHireRow>();

    if (hireError) {
      log.error('notifier_failed', {
        accessRequestId,
        newHireId: request.new_hire_id,
        reason: 'hire_lookup_failed',
        error: hireError.message,
      });
      throw hireError;
    }

    if (!hire) {
      log.error('notifier_failed', { accessRequestId, newHireId: request.new_hire_id, reason: 'hire_not_found' });
      throw new Error('Access request hire was not found');
    }

    if (!hire?.slack_user_id) {
      log.error('notifier_failed', { accessRequestId, reason: 'hire_missing_slack_user_id' });
      throw new Error('Hire is missing slack_user_id — this should not happen since Slack ID is required on creation');
    }

    if (!hire.organization_id) {
      log.error('notifier_failed', { accessRequestId, newHireId: hire.id, reason: 'hire_missing_organization_id' });
      throw new Error('Hire is missing organization_id');
    }

    const { data: slackConnection } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('organization_id', hire.organization_id)
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
          hireFirstName: hire.first_name,
          toolName: request.tool_name,
          accessRequestId,
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
