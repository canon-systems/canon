import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  nangoProxyGet: vi.fn(),
  getActiveWorkspaceConnection: vi.fn(),
  createServiceRoleClient: vi.fn(() => ({ service: true })),
}));

vi.mock('@/lib/server/integrations/nango', () => ({
  nangoProxyGet: mocks.nangoProxyGet,
}));

vi.mock('@/lib/server/integrations/workspaceConnections', () => ({
  getActiveWorkspaceConnection: mocks.getActiveWorkspaceConnection,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { listDeliveryTargets } from './chat-targets';

describe('chat delivery target discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveWorkspaceConnection.mockResolvedValue({ connection_id: 'conn_123' });
  });

  it('normalizes Teams channels and chats into shared delivery targets', async () => {
    mocks.nangoProxyGet.mockImplementation(async ({ endpoint }: { endpoint: string }) => {
      if (endpoint === '/v1.0/me/joinedTeams') {
        return { value: [{ id: 'team_1', displayName: 'Revenue Team' }] };
      }
      if (endpoint === '/v1.0/teams/team_1/channels') {
        return { value: [{ id: 'channel_1', displayName: 'Sales Engineering' }] };
      }
      if (endpoint === '/v1.0/me/chats') {
        return { value: [{ id: 'chat_1', topic: 'Acme deal room' }] };
      }
      return {};
    });

    await expect(listDeliveryTargets({ organizationId: 'org_123', provider: 'teams' })).resolves.toEqual([
      {
        provider: 'teams',
        targetType: 'channel',
        targetId: 'team_1/channel_1',
        targetName: 'Revenue Team / Sales Engineering',
        enabled: true,
        label: 'Revenue Team / Sales Engineering',
      },
      {
        provider: 'teams',
        targetType: 'dm',
        targetId: 'chat_1',
        targetName: 'Acme deal room',
        enabled: true,
        label: 'Acme deal room',
      },
    ]);
  });

  it('lists only Teams channels when knowledge sources request channel targets', async () => {
    mocks.nangoProxyGet.mockImplementation(async ({ endpoint }: { endpoint: string }) => {
      if (endpoint === '/v1.0/me/joinedTeams') {
        return { value: [{ id: 'team_1', displayName: 'Revenue Team' }] };
      }
      if (endpoint === '/v1.0/teams/team_1/channels') {
        return { value: [{ id: 'channel_1', displayName: 'Sales Engineering' }] };
      }
      if (endpoint === '/v1.0/me/chats') {
        return { value: [{ id: 'chat_1', topic: 'Private chat' }] };
      }
      return {};
    });

    await expect(listDeliveryTargets({ organizationId: 'org_123', provider: 'teams', targetScope: 'channels' })).resolves.toEqual([
      {
        provider: 'teams',
        targetType: 'channel',
        targetId: 'team_1/channel_1',
        targetName: 'Revenue Team / Sales Engineering',
        enabled: true,
        label: 'Revenue Team / Sales Engineering',
      },
    ]);
    expect(mocks.nangoProxyGet).not.toHaveBeenCalledWith(expect.objectContaining({ endpoint: '/v1.0/me/chats' }));
  });

  it('returns no options when the provider is not connected', async () => {
    mocks.getActiveWorkspaceConnection.mockResolvedValue(null);

    await expect(listDeliveryTargets({ organizationId: 'org_123', provider: 'teams' })).resolves.toEqual([]);
    expect(mocks.nangoProxyGet).not.toHaveBeenCalled();
  });
});
