export function supabaseUrl() {
  const value = process.env.SUPABASE_URL;

  if (!value) {
    throw new Error('Missing Supabase environment variable. Please set SUPABASE_URL');
  }

  return value;
}
