// -------------------------------------------------------------
// PURPOSE
// Protect the /submit page so only logged-in users can use it.
// We do not query Supabase here. We only gate access.
// The client-side code will insert/update into `submissions`.
// Row Level Security will set/verify created_by automatically.
// -------------------------------------------------------------

// We use SvelteKit's redirect helper to send guests to the login page.
import { redirect } from "@sveltejs/kit";

export const load = async ({ locals: { safeGetSession } }) => {
    // Ask our secure helper to validate cookies with Supabase Auth.
    // If the user is not logged in, both values are null.
    const { session } = await safeGetSession();

    // If there is no session, the user is a guest. Send them to /login.
    // 303 means "go do a GET on this other URL".
    if (!session) throw redirect(303, "/login");

    // Logged-in users are allowed to see the form.
    // We do not need to return any data yet.
    return {};
};
