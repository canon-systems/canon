import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { supabasePublishableKey, supabaseUrl } from './env';

const ORIGINAL_ENV = process.env;
const LEGACY_PUBLIC_URL = ['NEXT_PUBLIC', 'SUPABASE_URL'].join('_');
const LEGACY_PUBLIC_KEY = ['NEXT_PUBLIC', 'SUPABASE_PUBLISHABLE_KEY'].join('_');

describe('Supabase environment helpers', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env[LEGACY_PUBLIC_URL];
    delete process.env[LEGACY_PUBLIC_KEY];
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('uses the current Supabase URL and publishable key names', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_123';

    expect(supabaseUrl()).toBe('https://example.supabase.co');
    expect(supabasePublishableKey()).toBe('sb_publishable_123');
  });

  it('does not fall back to legacy NEXT_PUBLIC Supabase names', () => {
    process.env[LEGACY_PUBLIC_URL] = 'https://legacy.supabase.co';
    process.env[LEGACY_PUBLIC_KEY] = 'legacy_key';

    expect(() => supabaseUrl()).toThrow('SUPABASE_URL');
    expect(() => supabasePublishableKey()).toThrow('SUPABASE_PUBLISHABLE_KEY');
  });
});
