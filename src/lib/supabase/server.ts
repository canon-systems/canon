import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';
import { supabaseUrl } from './env';

export function createServiceRoleClient() {
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseSecretKey) {
    throw new Error(
      'Missing Supabase environment variable. Please set SUPABASE_SECRET_KEY'
    );
  }

  return createSupabaseClient<Database>(supabaseUrl(), supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
