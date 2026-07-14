import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { supabaseUrl } from './env';

const ORIGINAL_ENV = process.env;
const LEGACY_PUBLIC_URL = ['NEXT_PUBLIC', 'SUPABASE_URL'].join('_');

describe('Supabase environment helpers', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SUPABASE_URL;
    delete process.env[LEGACY_PUBLIC_URL];
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('uses the current Supabase URL name', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';

    expect(supabaseUrl()).toBe('https://example.supabase.co');
  });

  it('does not fall back to legacy NEXT_PUBLIC Supabase URL names', () => {
    process.env[LEGACY_PUBLIC_URL] = 'https://legacy.supabase.co';

    expect(() => supabaseUrl()).toThrow('SUPABASE_URL');
  });
});
