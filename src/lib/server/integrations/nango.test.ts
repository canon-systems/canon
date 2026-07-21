import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createNangoConnectSession } from './nango';

const fetchMock = vi.fn();
const originalApiKey = process.env.NANGO_API_KEY;

describe('createNangoConnectSession', () => {
  beforeEach(() => {
    process.env.NANGO_API_KEY = 'test-nango-key';
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      data: { token: 'session-token', expires_at: '2026-07-20T12:00:00Z' },
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) delete process.env.NANGO_API_KEY;
    else process.env.NANGO_API_KEY = originalApiKey;
  });

  it('requests Microsoft group access for new Outlook connections', async () => {
    const session = await createNangoConnectSession({
      provider: 'outlook',
      userId: 'user-1',
      organizationId: 'organization-1',
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      integrations_config_defaults?: Record<string, {
        connection_config?: { oauth_scopes_override?: string };
      }>;
    };
    const scopes = body.integrations_config_defaults?.[session.integrationId]
      ?.connection_config?.oauth_scopes_override?.split(',') ?? [];

    expect(scopes).toContain('Calendars.Read');
    expect(scopes).toContain('User.Read');
    expect(scopes).toContain('Group.Read.All');
  });
});
