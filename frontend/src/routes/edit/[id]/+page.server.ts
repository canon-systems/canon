// -------------------------------------------------------------
// PURPOSE
// Load a single submission by its id on the SERVER.
// RLS guarantees we will only find the row if it belongs to
// the signed-in user (created_by = auth.uid()).
// If not found (either it doesn't exist or it is not yours),
// we return a 404.
// Guests are redirected to /login.
// -------------------------------------------------------------

import { error, redirect } from "@sveltejs/kit";

export const load = async ({ params, locals: { safeGetSession, supabase } }) => {
    // 1) Validate login status.
    const { session } = await safeGetSession();
    if (!session) throw redirect(303, "/login");

    // 2) Read the id from the URL like /edit/abc-uuid-here
    const { id } = params;

    // 3) Ask Supabase for that single row.
    //    We do NOT filter by created_by here; RLS will do that for us.
    const { data, error: qerr } = await supabase
        .from("submissions")
        .select(
            "id, created_at, title, markdown, status, error_message, input_type, input_content, summary, source_meta"
        )
        .eq("id", id)
        .single();

    // 4) If the query itself failed unexpectedly, show a generic 500.
    if (qerr && qerr.code !== "PGRST116") {
        // PGRST116 is "Results contain 0 rows" which we handle below as 404.
        throw error(500, qerr.message);
    }

    // 5) If no row was found, either it does not exist OR it exists but is not owned by the user.
    //    RLS hides non-owned rows so they look like "not found". Return 404.
    if (!data) throw error(404, "Submission not found");

    // 6) Return the row to the page. It becomes $page.data.submission.
    return {
        submission: {
            id: String(data.id),
            created_date: data.created_at as string,
            title: (data.title ?? "Untitled") as string,
            markdown: (data.markdown ?? "") as string,
            status: data.status as "processing" | "completed" | "failed",
            error_message: (data.error_message ?? null) as string | null,
            input_type: data.input_type as
                | "github_repo"
                | "github_repo_directory"
                | "zipped_folder"
                | "pasted_code",
            input_content: (data.input_content ?? "") as string,
            summary: (data.summary ?? null) as string | null,
            source_meta: (data.source_meta ?? {}) as any
        }
    };
};
