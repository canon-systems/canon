import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSupabaseClientMock = vi.hoisted(() => vi.fn(() => ({ mocked: true })));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createSupabaseClientMock,
}));

import { createServiceRoleClient } from './server';

describe('Supabase server clients', () => {
  beforeEach(() => {
    createSupabaseClientMock.mockClear();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_service_role_123';
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
