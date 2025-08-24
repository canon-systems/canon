// -------------------------------------------------------------
// PURPOSE:
// This tiny file creates ONE Supabase client that the browser UI
// can reuse to talk to your Supabase project (insert/select docs).
// -------------------------------------------------------------

// We import the "createClient" function from the official SDK.
// This SDK knows how to talk to Supabase over HTTPS.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// We read the PUBLIC env vars from SvelteKit's public env module.
// IMPORTANT: only variables starting with PUBLIC_ are exposed to the browser.
// You already have these in your .env (safe to ship to the client).
import {
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY
} from "$env/static/public";

// We do a tiny bit of guard-rail checking so errors are obvious.
// If either value is missing, we throw right now with a friendly message.
// (This shows up clearly in your browser console/dev server logs.)
if (!PUBLIC_SUPABASE_URL) {
    throw new Error(
        "PUBLIC_SUPABASE_URL is missing. Put it in frontend/.env (or .env.local)."
    );
}
if (!PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
        "PUBLIC_SUPABASE_ANON_KEY is missing. Put it in frontend/.env (or .env.local)."
    );
}

// We create ONE shared client instance using your project's URL and anon key.
// The anon key is the public, browser-safe key (limited by RLS policies).
export const supabase: SupabaseClient = createClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
        // Optional settings (left default/simple for now):
        // - You could set auth.persistSession, headers, etc.
    }
);
