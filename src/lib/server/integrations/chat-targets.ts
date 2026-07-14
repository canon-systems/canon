import { nangoProxyGet } from '@/lib/server/integrations/nango';
import { getActiveWorkspaceConnection } from '@/lib/server/integrations/workspaceConnections';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ReadinessDeliveryProvider, ReadinessDeliveryTargetType } from '@/types/onboarding';

type RawRecord = Record<string, unknown>;

export type DeliveryTargetOption = {
  provider: ReadinessDeliveryProvider;
  targetType: ReadinessDeliveryTargetType;
  targetId: string;
  targetName: string | null;
  enabled: boolean;
  label: string;
};

function isRecord(value: unknown): value is RawRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringField(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function arrayField(response: unknown, keys: string[]) {
  if (Array.isArray(response)) return response;
  if (!isRecord(response)) return [];
  for (const key of keys) {
    const value = response[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function teamsName(record: RawRecord) {
  return stringField(record, ['displayName', 'topic', 'name', 'subject']) ?? 'Untitled';
}

async function activeConnectionId(organizationId: string, provider: 'teams' | 'google_chat') {
  const supabase = createServiceRoleClient();
  const connection = await getActiveWorkspaceConnection(supabase, { organizationId, provider });
  return connection?.connection_id ?? null;
}

async function listTeamsTargets(organizationId: string): Promise<DeliveryTargetOption[]> {
  const connectionId = await activeConnectionId(organizationId, 'teams');
  if (!connectionId) return [];

  const targets: DeliveryTargetOption[] = [];
  const teamsResponse = await nangoProxyGet({
    provider: 'teams',
    connectionId,
    endpoint: '/v1.0/me/joinedTeams',
  });

  for (const rawTeam of arrayField(teamsResponse, ['value', 'teams'])) {
    if (!isRecord(rawTeam)) continue;
    const teamId = stringField(rawTeam, ['id']);
    if (!teamId) continue;
    const teamName = teamsName(rawTeam);

    const channelsResponse = await nangoProxyGet({
      provider: 'teams',
      connectionId,
      endpoint: `/v1.0/teams/${encodeURIComponent(teamId)}/channels`,
    }).catch(() => null);

    for (const rawChannel of arrayField(channelsResponse, ['value', 'channels'])) {
      if (!isRecord(rawChannel)) continue;
      const channelId = stringField(rawChannel, ['id']);
      if (!channelId) continue;
      const channelName = teamsName(rawChannel);
      targets.push({
        provider: 'teams',
        targetType: 'channel',
        targetId: `${teamId}/${channelId}`,
        targetName: `${teamName} / ${channelName}`,
        enabled: true,
        label: `${teamName} / ${channelName}`,
      });
    }
  }

  const chatsResponse = await nangoProxyGet({
    provider: 'teams',
    connectionId,
    endpoint: '/v1.0/me/chats',
    query: { '$top': 50 },
  }).catch(() => null);

  for (const rawChat of arrayField(chatsResponse, ['value', 'chats'])) {
    if (!isRecord(rawChat)) continue;
    const chatId = stringField(rawChat, ['id']);
    if (!chatId) continue;
    const name = stringField(rawChat, ['topic', 'displayName']) ?? 'Teams chat';
    targets.push({
      provider: 'teams',
      targetType: 'dm',
      targetId: chatId,
      targetName: name,
      enabled: true,
      label: name,
    });
  }

  return targets;
}

async function listGoogleChatTargets(organizationId: string): Promise<DeliveryTargetOption[]> {
  const connectionId = await activeConnectionId(organizationId, 'google_chat');
  if (!connectionId) return [];

  const spacesResponse = await nangoProxyGet({
    provider: 'google_chat',
    connectionId,
    endpoint: '/v1/spaces',
    query: { pageSize: 100 },
  });

  return arrayField(spacesResponse, ['spaces', 'value', 'data']).flatMap((rawSpace): DeliveryTargetOption[] => {
    if (!isRecord(rawSpace)) return [];
    const name = stringField(rawSpace, ['name']);
    if (!name) return [];
    const displayName = stringField(rawSpace, ['displayName', 'spaceDisplayName']) ?? name;
    const type = stringField(rawSpace, ['spaceType', 'type']);
    return [{
      provider: 'google_chat',
      targetType: type === 'DIRECT_MESSAGE' ? 'dm' : 'channel',
      targetId: name,
      targetName: displayName,
      enabled: true,
      label: displayName,
    }];
  });
}

export async function listDeliveryTargets(params: {
  organizationId: string;
  provider: ReadinessDeliveryProvider;
}): Promise<DeliveryTargetOption[]> {
  if (params.provider === 'teams') return listTeamsTargets(params.organizationId);
  if (params.provider === 'google_chat') return listGoogleChatTargets(params.organizationId);
  return [];
}
