// -------------------------------------------------------------
// PURPOSE
// Load the signed-in user's submissions on the SERVER.
// Thanks to RLS, the SELECT below only returns rows where
// created_by = auth.uid() for the current request.
// We also protect the page so guests are redirected to /login.
// -------------------------------------------------------------

import { redirect } from "@sveltejs/kit";

export const load = async ({ locals: { safeGetSession, supabase } }) => {
    // 1) Validate cookies with Supabase Auth and get a real user/session.
    //    If not logged in, both values will be null.
    const { user, session } = await safeGetSession();

    // 2) If no session, the visitor is a guest. Send them to /login.
    if (!session) throw redirect(303, "/login");

    // 3) Ask the Supabase **server client** for this user's submissions.
    //    IMPORTANT: We do NOT add a where(created_by = ...) filter here,
    //    because Row Level Security already enforces that on the server.
    //    If a row does not belong to this user, Postgres will hide it.
    const { data, error } = await supabase
        .from("submissions")
        .select(
            "id, created_at, input_type, input_content, status, summary, error_message"
        )
        .order("created_at", { ascending: false })
        .limit(50);

    // 4) If the query had an error, return an empty list (and an optional message).
    //    In your UI, you can show an empty state or a gentle error. Keeping it simple here.
    if (error) {
        return {
            user,               // we pass the verified user down for convenience
            submissions: [],    // empty list on error
            loadError: error.message as string
        };
    }

    // 5) Map the rows into a simple, UI-friendly shape.
    const submissions = (data ?? []).map((row) => ({
        id: String(row.id),
        created_date: row.created_at as string,
        input_type: row.input_type as
            | "github_repo"
            | "github_repo_directory"
            | "zipped_folder"
            | "pasted_code",
        input_content: (row.input_content ?? "") as string,
        status: row.status as "processing" | "completed" | "failed",
        summary: (row.summary ?? null) as string | null,
        error_message: (row.error_message ?? null) as string | null
    }));

    // 6) Whatever we return becomes $page.data.* on the client.
    return { user, submissions, loadError: null as string | null };
};
