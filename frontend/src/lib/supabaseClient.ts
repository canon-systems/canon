// -------------------------------------------------------------
// PURPOSE
// Create one Supabase client for the browser only.
// The browser client uses your public URL and public anon key.
// Row Level Security protects the data on the server.
// We use the SSR helper's createBrowserClient so cookies and
// auth state line up with what the server sees.
// -------------------------------------------------------------

// We import the "createBrowserClient" from the Supabase SSR helper.
// This version is made for browser use and cooperates with cookies.
import { createBrowserClient, type SupabaseClient } from "@supabase/ssr";

// We read the public env values SvelteKit exposes to the browser.
// Only PUBLIC_ variables are available on the client side.
import {
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY
} from "$env/static/public";

// Helpful guard so misconfigurations are loud and clear.
// If you forget to set these in .env, you will see an error early.
if (!PUBLIC_SUPABASE_URL) {
    throw new Error(
        "PUBLIC_SUPABASE_URL is missing. Put it in frontend/.env or .env.local."
    );
}
if (!PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
        "PUBLIC_SUPABASE_ANON_KEY is missing. Put it in frontend/.env or .env.local."
    );
}

// We create one shared browser client.
// The anon key is safe for the browser because RLS protects your data.
// We do not pass custom headers here. Defaults are fine for now.
export const supabase: SupabaseClient = createBrowserClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY
);