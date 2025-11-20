// This is a SvelteKit "server endpoint" file.
// It runs ONLY on the server, never in the browser.
//
// Our goal:
//   The frontend will call POST /api/docs/post-process
//   with a JSON body { submissionId: "..." }.
//
// This endpoint will:
//   1) Load that submission from the database
//   2) Call trackSubmissionFiles(...) to update submission_files
//   3) Return a small JSON status

import type { RequestHandler } from '@sveltejs/kit'
import { json } from '@sveltejs/kit'

// We import the helper we already wrote.
// This helper:
//   - Looks at submission.code_snapshot
//   - Talks to GitHub to get file sizes/types
//   - Upserts rows into submission_files
import { trackSubmissionFiles } from '$lib/server/trackSubmissionFiles'

export const POST: RequestHandler = async (event) => {
    console.log('[post-process] ===== REQUEST RECEIVED =====');
    
    // 1) Read the request body as JSON.
    // We expect something like: { "submissionId": "uuid-here" }
    const body = await event.request.json().catch(() => ({} as any))

    const submissionId: string | undefined = body.submissionId

    console.log('[post-process] Processing submission', submissionId);

    // If the client forgot to send a submissionId,
    // we return a 400 Bad Request so it is clear what is wrong.
    if (!submissionId) {
        console.error('[post-process] Missing submissionId');
        return json(
            { error: 'submissionId is required in the request body' },
            { status: 400 }
        )
    }

    // 2) Get the Supabase client from event.locals.
    // This is the same client you use elsewhere in server routes.
    const supabase = event.locals.supabase

    // 3) Load the submission row from the database.
    const { data: submission, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('id', submissionId)
        .single()

    // If we could not find it or there was a DB error, tell the client.
    if (error || !submission) {
        console.error('[post-process] Submission not found:', error?.message);
        return json(
            {
                error: 'Submission not found',
                details: error?.message
            },
            { status: 404 }
        )
    }

    console.log('[post-process] Submission loaded:', {
        id: submission.id,
        input_type: submission.input_type,
        selected_files_count: Array.isArray(submission.selected_files) ? submission.selected_files.length : 0,
        has_code_snapshot: !!submission.code_snapshot
    });

    try {
        // Get user ID from the submission (created_by field)
        const userId = submission.created_by || null

        // 4) Call our helper.
        // This will:
        //   - Use submission.selected_files as the source of truth
        //   - Use submission.code_snapshot if available (for hashes and commit SHA)
        //   - Contact GitHub for metadata (size, etc.)
        //   - Upsert rows into submission_files
        await trackSubmissionFiles({
            supabase,
            submission,
            userId
        })

        console.log('[post-process] ===== SUCCESS =====');
        // 5) Tell the client it worked.
        return json(
            {
                ok: true,
                message: 'Post-processing completed (submission_files updated)'
            },
            { status: 200 }
        )
    } catch (e: any) {
        console.error('[post-process] ===== ERROR =====');
        console.error('[post-process] Error details:', {
            message: e?.message ?? String(e),
            stack: e?.stack
        });

        // If anything throws inside trackSubmissionFiles,
        // we return a 500 error so the client knows it failed.
        return json(
            {
                error: 'Failed to post-process submission',
                details: e?.message ?? String(e)
            },
            { status: 500 }
        )
    }
}