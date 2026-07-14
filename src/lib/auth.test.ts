import { describe, expect, it, vi, beforeEach } from 'vitest';

const authMock = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
}));

import { getSession } from './auth';

describe('Clerk session normalization', () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it('returns a null Canon session when Clerk has no user', async () => {
    authMock.mockResolvedValue({ userId: null });

    await expect(getSession()).resolves.toEqual({ user: null, session: null });
  });

  it('maps Clerk session claims into the Canon user shape', async () => {
    authMock.mockResolvedValue({
      userId: 'user_123',
      sessionId: 'sess_123',
      orgId: 'org_123',
      orgRole: 'org:admin',
      sessionClaims: {
        primary_email_address: 'avery@example.com',
        given_name: 'Avery',
        family_name: 'Admin',
      },
    });

    await expect(getSession()).resolves.toEqual({
      user: {
        id: 'user_123',
        email: 'avery@example.com',
        user_metadata: {
          first_name: 'Avery',
          last_name: 'Admin',
          full_name: 'Avery Admin',
          name: 'Avery Admin',
        },
      },
      session: {
        id: 'sess_123',
        orgId: 'org_123',
        orgRole: 'org:admin',
      },
    });
  });
});
