import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  nangoProxyGet: vi.fn(),
  embedAndReplaceKnowledgeChunks: vi.fn(),
  upsertReadinessSourceEvents: vi.fn(),
}));

vi.mock('@/lib/server/integrations/nango', () => ({
  nangoProxyGet: mocks.nangoProxyGet,
}));

vi.mock('@/lib/server/knowledge-sync/chunk-writer', () => ({
  embedAndReplaceKnowledgeChunks: mocks.embedAndReplaceKnowledgeChunks,
}));

vi.mock('@/lib/server/readiness/source-events', () => ({
  upsertReadinessSourceEvents: mocks.upsertReadinessSourceEvents,
}));

import { fetchEmbedPersistTeamChatSource } from './chat-sync';

const log = {
  info: vi.fn(),
  error: vi.fn(),
};

function baseParams(provider: 'teams' | 'google_chat') {
  return {
    supabase: {} as never,
    organizationId: 'org_123',
    sourceId: 'source_123',
    sourceName: 'Customer team chat',
    provider,
    connectionId: 'conn_123',
    targetId: provider === 'teams' ? 'team_1/channel_1' : 'spaces/AAAA',
    targetName: provider === 'teams' ? 'Revenue / Sales Engineering' : 'Implementation',
    log,
    assertActive: vi.fn(),
  };
}

describe('team chat source sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsertReadinessSourceEvents.mockResolvedValue(undefined);
    mocks.embedAndReplaceKnowledgeChunks.mockImplementation(async ({ chunks }: { chunks: unknown[] }) => ({
      embeddedCount: chunks.length,
    }));
  });

  it('normalizes human Teams messages into readiness source events and knowledge chunks', async () => {
    mocks.nangoProxyGet.mockResolvedValue({
      value: [
        {
          id: 'message_1',
          createdDateTime: '2026-07-13T15:00:00.000Z',
          webUrl: 'https://teams.example/message_1',
          body: { content: '<p>Customer needs launch readiness notes &amp; updated objection handling before the call.</p>' },
          from: { user: { displayName: 'Alex Seller' } },
        },
        {
          id: 'message_bot',
          body: { content: '<p>This bot message should be ignored because Canon should not loop.</p>' },
          from: { application: { displayName: 'Canon' } },
        },
      ],
    });

    await expect(fetchEmbedPersistTeamChatSource(baseParams('teams'))).resolves.toEqual({
      embeddedCount: 1,
      messageCount: 1,
    });

    expect(mocks.nangoProxyGet).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'teams',
      endpoint: '/v1.0/teams/team_1/channels/channel_1/messages',
    }));
    expect(mocks.upsertReadinessSourceEvents).toHaveBeenCalledWith(expect.objectContaining({
      events: [
        expect.objectContaining({
          provider: 'teams',
          sourceType: 'team_chat',
          externalId: 'team_1/channel_1:message_1',
          content: 'Customer needs launch readiness notes & updated objection handling before the call.',
          metadata: expect.objectContaining({
            target_id: 'team_1/channel_1',
            target_name: 'Revenue / Sales Engineering',
            author_type: 'human',
            author_name: 'Alex Seller',
          }),
        }),
      ],
    }));
    expect(mocks.embedAndReplaceKnowledgeChunks).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: 'source_123',
      chunks: [
        expect.objectContaining({
          metadata: expect.objectContaining({
            provider: 'teams',
            source_type: 'team_chat',
            external_id: 'message_1',
          }),
        }),
      ],
    }));
  });

  it('normalizes Google Chat messages and filters system messages', async () => {
    mocks.nangoProxyGet.mockResolvedValue({
      messages: [
        {
          name: 'spaces/AAAA/messages/message_1',
          text: 'Customer asked for a clearer migration plan before the implementation review.',
          createTime: '2026-07-13T16:00:00.000Z',
          sender: { displayName: 'Jordan Customer' },
        },
        {
          name: 'spaces/AAAA/messages/system_1',
          text: 'This system event should not be used for readiness.',
          type: 'system_event',
        },
      ],
    });

    await expect(fetchEmbedPersistTeamChatSource(baseParams('google_chat'))).resolves.toEqual({
      embeddedCount: 1,
      messageCount: 1,
    });

    expect(mocks.nangoProxyGet).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'google_chat',
      endpoint: '/v1/spaces/AAAA/messages',
    }));
    expect(mocks.upsertReadinessSourceEvents).toHaveBeenCalledWith(expect.objectContaining({
      events: [
        expect.objectContaining({
          provider: 'google_chat',
          externalId: 'spaces/AAAA:spaces/AAAA/messages/message_1',
          content: 'Customer asked for a clearer migration plan before the implementation review.',
          metadata: expect.objectContaining({
            target_id: 'spaces/AAAA',
            target_name: 'Implementation',
            author_type: 'human',
            author_name: 'Jordan Customer',
          }),
        }),
      ],
    }));
  });
});
