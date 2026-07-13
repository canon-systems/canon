export function supabaseUrl() {
  const value = process.env.SUPABASE_URL;

  if (!value) {
    throw new Error('Missing Supabase environment variable. Please set SUPABASE_URL');
  }

  return value;
}

export function supabasePublishableKey() {
  const value = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!value) {
    throw new Error(
      'Missing Supabase environment variable. Please set SUPABASE_PUBLISHABLE_KEY'
    );
  }

  return value;
}
