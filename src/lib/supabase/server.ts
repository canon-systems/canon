import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { supabaseUrl } from './env';

export function createServiceRoleClient() {
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceRoleKey) {
    throw new Error(
      'Missing Supabase environment variable. Please set SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createSupabaseClient(supabaseUrl(), supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
