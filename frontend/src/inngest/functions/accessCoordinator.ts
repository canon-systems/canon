import { inngest } from '../client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';

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

// Admin/user-management URLs for known tools. These land the owner as close as
// possible to where they can grant access — one click from the Slack message.
const TOOL_ACCESS_URLS: Record<string, string> = {
  salesforce:  'https://login.salesforce.com',
  gong:        'https://app.gong.io/settings/users',
  github:      'https://github.com/settings/organizations',
  jira:        'https://admin.atlassian.com',
  confluence:  'https://admin.atlassian.com',
  zoom:        'https://zoom.us/account/user#/',
  outreach:    'https://app.outreach.io/settings/users',
  hubspot:     'https://app.hubspot.com/settings/users',
  notion:      'https://www.notion.so/settings/members',
  slack:       'https://slack.com/admin',
  linear:      'https://linear.app/settings/members',
  figma:       'https://www.figma.com/settings',
  asana:       'https://app.asana.com/admin',
};

function getToolAccessUrl(toolName: string): string | null {
  return TOOL_ACCESS_URLS[toolName.toLowerCase().trim()] ?? null;
}

async function sendAccessRequestDM(params: {
  botToken: string;
  slackUserId: string;
  newHireName: string;
  newHireRole: string;
  requestedFromName: string | null;
  toolName: string;
  toolAccessUrl: string | null;
  accessRequestId: string;
}): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const greeting = params.requestedFromName ? `Hi ${params.requestedFromName}` : 'Hi';

  const actionButtons: unknown[] = [];
  if (params.toolAccessUrl) {
    actionButtons.push({
      type: 'button',
      text: { type: 'plain_text', text: `Open ${params.toolName}`, emoji: true },
      url: params.toolAccessUrl,
    });
  }
  actionButtons.push({
    type: 'button',
    text: { type: 'plain_text', text: 'Mark as granted', emoji: true },
    style: 'primary',
    action_id: 'access_request_granted',
    value: params.accessRequestId,
  });

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
      elements: actionButtons,
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
          organizations ( id, owner_id )
        )
      `)
      .eq('id', accessRequestId)
      .single();

    if (error || !request) {
      log.warn('coordinator_skipped', { accessRequestId, reason: 'request_not_found' });
      return { skipped: true, reason: 'request_not_found' };
    }

    const hire = request.new_hires as unknown as { name: string; role: string; organizations: { owner_id: string } | { owner_id: string }[] };
    const orgData = Array.isArray(hire.organizations) ? hire.organizations[0] : hire.organizations;
    const orgOwnerId = orgData?.owner_id;

    log.info('coordinator_start', {
      accessRequestId,
      tool: request.tool_name,
      hire: hire.name,
      hireRole: hire.role,
      ownerName: request.requested_from_name ?? '(unknown)',
      ownerEmail: request.requested_from_email ?? '(none)',
      ownerSlackId: request.requested_from_slack_id ?? '(none)',
    });

    if (!request.requested_from_slack_id) {
      log.warn('coordinator_skipped', {
        accessRequestId,
        tool: request.tool_name,
        hire: hire.name,
        reason: 'no_slack_id_for_owner — add one in Settings → Tools',
      });
      return { skipped: true, reason: 'no_slack_id_for_requester' };
    }

    const { data: slackConnection } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('user_id', orgOwnerId)
      .eq('provider', 'slack')
      .eq('status', 'active')
      .maybeSingle();

    if (!slackConnection) {
      log.warn('coordinator_skipped', {
        accessRequestId,
        tool: request.tool_name,
        hire: hire.name,
        reason: 'no_slack_connection — connect Slack in Settings → Integrations',
      });
      return { skipped: true, reason: 'no_slack_connection' };
    }

    const botToken = await getProviderAccessToken({ provider: 'slack', connectionId: slackConnection.connection_id });

    if (!botToken) {
      log.warn('coordinator_skipped', {
        accessRequestId,
        tool: request.tool_name,
        hire: hire.name,
        reason: 'no_bot_token — Slack token could not be retrieved',
      });
      return { skipped: true, reason: 'no_bot_token' };
    }

    try {
      await step.run('send-slack-dm', async () => {
        log.debug('coordinator_start', {
          accessRequestId,
          action: 'sending_slack_dm',
          tool: request.tool_name,
          hire: hire.name,
          dmChannel: request.requested_from_slack_id,
        });

        const result = await sendAccessRequestDM({
          botToken,
          slackUserId: request.requested_from_slack_id!,
          newHireName: hire.name,
          newHireRole: hire.role,
          requestedFromName: request.requested_from_name,
          toolName: request.tool_name,
          toolAccessUrl: getToolAccessUrl(request.tool_name),
          accessRequestId,
        });

        if (!result.ok) {
          throw new Error(`Slack API error: ${result.error ?? 'unknown'}`);
        }

        const sentAt = new Date().toISOString();
        await supabase
          .from('access_requests')
          .update({ status: 'sent', sent_at: sentAt })
          .eq('id', accessRequestId);

        log.info('coordinator_complete', {
          accessRequestId,
          tool: request.tool_name,
          hire: hire.name,
          owner: request.requested_from_name ?? request.requested_from_slack_id,
          slackMessageTs: result.ts,
          sentAt,
          statusUpdated: 'sent',
        });

        return { ok: true, ts: result.ts };
      });

      return { ok: true, accessRequestId };
    } catch (error) {
      log.error('coordinator_failed', {
        accessRequestId,
        tool: request.tool_name,
        hire: hire.name,
        owner: request.requested_from_name ?? request.requested_from_slack_id,
        error: errorMessage(error),
      });
      throw error;
    }
  }
);
