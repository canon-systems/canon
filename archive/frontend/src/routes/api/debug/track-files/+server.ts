// src/routes/api/debug/track-files/+server.ts

// This endpoint lives on the server side only
// It will let us manually test the trackSubmissionFiles helper

import type { RequestHandler } from '@sveltejs/kit'
import { trackSubmissionFiles } from '$lib/server/trackSubmissionFiles'

// In SvelteKit, GET is the handler for HTTP GET requests
export const GET: RequestHandler = async (event) => {
    // We read the URL from the request
    const url = new URL(event.request.url)

    // We read the submissionId from the query string
    // Example call: /api/debug/track-files?submissionId=some_uuid_here
    const submissionId = url.searchParams.get('submissionId')

    // If there is no submission id, we return a bad request response
    if (!submissionId) {
        return new Response(
            JSON.stringify({ error: 'submissionId query parameter is required' }),
            {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    }

    // We use the Supabase client attached to locals
    // This is set up in your hooks.server file
    const supabase = event.locals.supabase

    // We load the submission row from the database
    // We select all columns and filter by id
    const { data: submission, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('id', submissionId)
        .single()

    // If there was an error or no submission, we return a 404
    if (error || !submission) {
        return new Response(
            JSON.stringify({
                error: 'Submission not found',
                details: error?.message
            }),
            {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    }

    try {
        // Now we call our helper and give it the supabase client and the submission row
        await trackSubmissionFiles({
            supabase,
            submission
        })

        // If everything worked, we return success
        return new Response(
            JSON.stringify({
                ok: true,
                message: 'Tracked submission files successfully'
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    } catch (e: any) {
        // If something went wrong, we return a 500 with the error message
        return new Response(
            JSON.stringify({
                error: 'Failed to track submission files',
                details: e?.message ?? String(e)
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        )
    }
}
