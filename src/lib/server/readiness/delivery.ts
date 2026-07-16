import { sendSlackDirectMessage, sendSlackMessage } from '@/lib/server/signals/delivery';
import { nangoProxyPost } from '@/lib/server/integrations/nango';
import { getActiveWorkspaceConnection } from '@/lib/server/integrations/workspaceConnections';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ReadinessDeliveryProvider, ReadinessDeliveryTargetType } from '@/types/onboarding';

export type ReadinessDeliveryTargetRow = {
  id?: string;
  organization_id: string;
  provider: ReadinessDeliveryProvider;
  target_type: ReadinessDeliveryTargetType;
  target_id: string;
  target_name: string | null;
  enabled: boolean;
};

export type ReadinessDeliveryResult = {
  target: ReadinessDeliveryTargetRow;
  sent: boolean;
  reason?: string;
  channel?: string;
  ts?: string;
  permalink?: string;
};

type AdapterResult = Omit<ReadinessDeliveryResult, 'target'>;

type ReadinessDeliveryAdapter = {
  send(params: {
    organizationId: string;
    target: ReadinessDeliveryTargetRow;
    text: string;
  }): Promise<AdapterResult>;
};

const slackAdapter: ReadinessDeliveryAdapter = {
  async send({ organizationId, target, text }) {
    if (target.target_type === 'dm') {
      return sendSlackDirectMessage({ organizationId, slackUserId: target.target_id, text });
    }

    return sendSlackMessage({ organizationId, channel: target.target_id, text });
  },
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

async function activeConnectionId(organizationId: string, provider: 'teams') {
  const supabase = createServiceRoleClient();
  const connection = await getActiveWorkspaceConnection(supabase, { organizationId, provider });
  return connection?.connection_id ?? null;
}

function parseTeamsChannelTarget(targetId: string) {
  const normalized = targetId.trim();
  const separator = normalized.includes('/') ? '/' : ':';
  const [teamId, channelId] = normalized.split(separator).map((part) => part.trim()).filter(Boolean);
  return teamId && channelId ? { teamId, channelId } : null;
}

const teamsAdapter: ReadinessDeliveryAdapter = {
  async send({ organizationId, target, text }) {
    const connectionId = await activeConnectionId(organizationId, 'teams');
    if (!connectionId) return { sent: false, reason: 'No active Microsoft Teams connection. Connect Teams before sending readiness updates.' };

    const body = {
      body: {
        contentType: 'html',
        content: escapeHtml(text),
      },
    };

    try {
      if (target.target_type === 'channel') {
        const parsed = parseTeamsChannelTarget(target.target_id);
        if (!parsed) {
          return {
            sent: false,
            reason: 'Teams channel targets must use teamId/channelId or teamId:channelId.',
          };
        }

        await nangoProxyPost({
          provider: 'teams',
          connectionId,
          endpoint: `/v1.0/teams/${encodeURIComponent(parsed.teamId)}/channels/${encodeURIComponent(parsed.channelId)}/messages`,
          body,
        });
        return { sent: true, channel: target.target_id };
      }

      await nangoProxyPost({
        provider: 'teams',
        connectionId,
        endpoint: `/v1.0/chats/${encodeURIComponent(target.target_id)}/messages`,
        body,
      });
      return { sent: true, channel: target.target_id };
    } catch (error) {
      return { sent: false, reason: error instanceof Error ? error.message : String(error) };
    }
  },
};

function adapterFor(provider: ReadinessDeliveryProvider): ReadinessDeliveryAdapter {
  if (provider === 'slack') return slackAdapter;
  return teamsAdapter;
}

export async function sendReadinessDelivery(params: {
  organizationId: string;
  target: ReadinessDeliveryTargetRow;
  text: string;
}): Promise<ReadinessDeliveryResult> {
  const result = await adapterFor(params.target.provider).send(params);
  return {
    target: params.target,
    ...result,
  };
}

export async function sendReadinessToTargets(params: {
  organizationId: string;
  targets: ReadinessDeliveryTargetRow[];
  text: string;
}) {
  const enabledTargets = params.targets.filter((target) => target.enabled);
  return Promise.all(enabledTargets.map((target) => (
    sendReadinessDelivery({
      organizationId: params.organizationId,
      target,
      text: params.text,
    })
  )));
}
