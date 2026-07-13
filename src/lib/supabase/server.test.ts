import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseClientMock = vi.hoisted(() => vi.fn(() => ({ mocked: true })));

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createSupabaseClientMock,
}));

import { createClient, createServiceRoleClient } from './server';

describe('Supabase server clients', () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseClientMock.mockClear();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_123';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_service_role_123';
  });

  it('creates a Clerk-token Supabase client with the publishable key', async () => {
    authMock.mockResolvedValue({
      getToken: vi.fn().mockResolvedValue('clerk_supabase_token'),
    });

    expect(createClient()).toEqual({ mocked: true });

    expect(createSupabaseClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'sb_publishable_123',
      expect.objectContaining({
        accessToken: expect.any(Function),
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    );

    const [, , options] = createSupabaseClientMock.mock.calls[0] as unknown as [
      string,
      string,
      { accessToken: () => Promise<string> },
    ];
    await expect(options.accessToken()).resolves.toBe('clerk_supabase_token');
  });

  it('creates a trusted service-role client only from SUPABASE_SERVICE_ROLE_KEY', () => {
    expect(createServiceRoleClient()).toEqual({ mocked: true });

    expect(createSupabaseClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'sb_service_role_123',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  });
});
