// -------------------------------------------------------------
// PURPOSE
// Server-side loader for /edit (the chooser page).
// - Redirects guests to /login
// - Uses the Supabase SERVER client tied to cookies
// - SELECTS current user's rows only (RLS enforces this automatically)
// - Returns a small list of submissions to render quick links to /edit/[id]
// -------------------------------------------------------------

import { redirect } from "@sveltejs/kit";

export const load = async ({ locals: { safeGetSession, supabase } }) => {
    // [1] Confirm the visitor is logged in (validated against Supabase Auth).
    const { user, session } = await safeGetSession();

    // [2] If no session, they are a guest. Send to /login.
    if (!session) throw redirect(303, "/login");

    // [3] Ask Postgres for this user's submissions via the server Supabase client.
    //     We do NOT manually filter by created_by because Row Level Security
    //     already hides rows that do not belong to auth.uid() for this request.
    const { data, error } = await supabase
        .from("submissions")
        .select("id, created_at, title, status")
        .order("created_at", { ascending: false })
        .limit(30); // keep the list short and snappy

    // [4] On error, give the page an empty list and a friendly reason to show.
    if (error) {
        return {
            user,                          // verified user object (you can show email if you want)
            items: [] as Array<{           // empty list when query fails
                id: string;
                created_date: string;
                title: string | null;
                status: "processing" | "completed" | "failed";
            }>,
            loadError: error.message as string
        };
    }

    // [5] Map the rows into a UI-friendly shape.
    const items = (data ?? []).map((row) => ({
        id: String(row.id),
        created_date: row.created_at as string,
        title: (row.title ?? "Untitled") as string,
        status: row.status as "processing" | "completed" | "failed"
    }));

    // [6] Hand the data to the page. It becomes $page.data.* on the client.
    return { user, items, loadError: null as string | null };
};
