// -------------------------------------------------------------
// PURPOSE
// This server load runs on every page request.
// It asks our helper for a verified user and the current session.
// Verified means Supabase checks the cookie with the auth server.
// We send "user" and "session" to the browser as $page.data.*
// The browser should use $page.data.user to know who is signed in.
// -------------------------------------------------------------

// We export a SvelteKit server load function.
// SvelteKit will call this on every navigation that hits the server.
export const load = async ({ locals: { safeGetSession } }) => {
    // Ask our helper to validate the cookie with Supabase Auth.
    // If the user is not logged in, both values are null.
    const { user, session } = await safeGetSession();

    // Whatever we return here becomes available as $page.data on the client.
    // Using "user" from getUser() is the secure way. Do not trust session.user.
    return { user, session };
};
