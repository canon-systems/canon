import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendSlackDirectMessage: vi.fn(),
  sendSlackMessage: vi.fn(),
  nangoProxyPost: vi.fn(),
  getActiveWorkspaceConnection: vi.fn(),
  createServiceRoleClient: vi.fn(() => ({ service: true })),
}));

vi.mock('@/lib/server/signals/delivery', () => ({
  sendSlackDirectMessage: mocks.sendSlackDirectMessage,
  sendSlackMessage: mocks.sendSlackMessage,
}));

vi.mock('@/lib/server/integrations/nango', () => ({
  nangoProxyPost: mocks.nangoProxyPost,
}));

vi.mock('@/lib/server/integrations/workspaceConnections', () => ({
  getActiveWorkspaceConnection: mocks.getActiveWorkspaceConnection,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { sendReadinessDelivery, type ReadinessDeliveryTargetRow } from './delivery';

function target(overrides: Partial<ReadinessDeliveryTargetRow>): ReadinessDeliveryTargetRow {
  return {
    organization_id: 'org_123',
    provider: 'slack',
    target_type: 'channel',
    target_id: 'C123',
    target_name: null,
    enabled: true,
    ...overrides,
  };
}

describe('readiness delivery adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendSlackMessage.mockResolvedValue({ sent: true, channel: 'C123', ts: '123.456' });
    mocks.sendSlackDirectMessage.mockResolvedValue({ sent: true, channel: 'D123', ts: '123.456' });
    mocks.nangoProxyPost.mockResolvedValue({});
    mocks.getActiveWorkspaceConnection.mockResolvedValue({ connection_id: 'conn_123' });
  });

  it('sends Slack channel updates through the Slack channel adapter', async () => {
    await expect(sendReadinessDelivery({
      organizationId: 'org_123',
      target: target({ provider: 'slack', target_type: 'channel', target_id: 'C123' }),
      text: 'Weekly readiness update',
    })).resolves.toMatchObject({ sent: true });

    expect(mocks.sendSlackMessage).toHaveBeenCalledWith({
      organizationId: 'org_123',
      channel: 'C123',
      text: 'Weekly readiness update',
    });
    expect(mocks.sendSlackDirectMessage).not.toHaveBeenCalled();
  });

  it('sends Slack DM updates through the Slack DM adapter', async () => {
    await expect(sendReadinessDelivery({
      organizationId: 'org_123',
      target: target({ provider: 'slack', target_type: 'dm', target_id: 'U123' }),
      text: 'Meeting prep',
    })).resolves.toMatchObject({ sent: true });

    expect(mocks.sendSlackDirectMessage).toHaveBeenCalledWith({
      organizationId: 'org_123',
      slackUserId: 'U123',
      text: 'Meeting prep',
    });
    expect(mocks.sendSlackMessage).not.toHaveBeenCalled();
  });

  it('sends Teams channel updates through Microsoft Graph', async () => {
    await expect(sendReadinessDelivery({
      organizationId: 'org_123',
      target: target({ provider: 'teams', target_type: 'channel', target_id: 'team_1/channel_1' }),
      text: 'Weekly readiness update',
    })).resolves.toMatchObject({ sent: true, channel: 'team_1/channel_1' });

    expect(mocks.nangoProxyPost).toHaveBeenCalledWith({
      provider: 'teams',
      connectionId: 'conn_123',
      endpoint: '/v1.0/teams/team_1/channels/channel_1/messages',
      body: {
        body: {
          contentType: 'html',
          content: 'Weekly readiness update',
        },
      },
    });
  });

  it('sends Teams chat updates through Microsoft Graph', async () => {
    await expect(sendReadinessDelivery({
      organizationId: 'org_123',
      target: target({ provider: 'teams', target_type: 'dm', target_id: 'chat_1' }),
      text: 'Meeting prep',
    })).resolves.toMatchObject({ sent: true, channel: 'chat_1' });

    expect(mocks.nangoProxyPost).toHaveBeenCalledWith({
      provider: 'teams',
      connectionId: 'conn_123',
      endpoint: '/v1.0/chats/chat_1/messages',
      body: {
        body: {
          contentType: 'html',
          content: 'Meeting prep',
        },
      },
    });
  });

  it('sends Google Chat updates to the selected space', async () => {
    await expect(sendReadinessDelivery({
      organizationId: 'org_123',
      target: target({ provider: 'google_chat', target_type: 'channel', target_id: 'spaces/AAAA' }),
      text: 'Weekly readiness update',
    })).resolves.toMatchObject({ sent: true, channel: 'spaces/AAAA' });

    expect(mocks.nangoProxyPost).toHaveBeenCalledWith({
      provider: 'google_chat',
      connectionId: 'conn_123',
      endpoint: '/v1/spaces/AAAA/messages',
      body: { text: 'Weekly readiness update' },
    });
  });

  it('skips Teams and Google Chat when the provider is not connected', async () => {
    mocks.getActiveWorkspaceConnection.mockResolvedValue(null);

    await expect(sendReadinessDelivery({
      organizationId: 'org_123',
      target: target({ provider: 'teams', target_type: 'dm', target_id: 'chat_1' }),
      text: 'Meeting prep',
    })).resolves.toMatchObject({ sent: false });

    expect(mocks.nangoProxyPost).not.toHaveBeenCalled();
  });
});
