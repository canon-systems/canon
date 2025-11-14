// ============================================================================
// /api/docs/check-updates  (POST)
//
// PURPOSE:
//   Given a submissionId, this endpoint checks GitHub to see whether any of the
//   files used to create the documentation have changed since the last snapshot.
//
// RETURNS:
//   {
//      outdated: boolean,
//      changedFiles: [
//         { file_path: "...", old_hash: "...", new_hash: "..." }
//      ]
//   }
//
// BACKGROUND:
//   Each submission stores: code_snapshot.commitSha + fileShas (at time of run)
//   submission_files stores a row per file, each with file_hash (blob SHA)
//   To detect changes:
//       - Fetch latest blob SHAs from GitHub for those file paths
//       - Compare with stored file_hash
//       - Any mismatch = outdated
// ============================================================================

import type { RequestHandler } from '@sveltejs/kit'
import { json } from '@sveltejs/kit'
import { Octokit } from '@octokit/rest'

// NEW: import createClient so we can build a Supabase client for this request
import { createClient } from '@supabase/supabase-js'

// NEW: import your Supabase URL and anon key from public env
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'
import { GITHUB_TOKEN } from '$env/static/private'

// GitHub client (must have GITHUB_TOKEN env var)
const octokit = new Octokit({
    auth: GITHUB_TOKEN || undefined
})

// Helper: parse GitHub repo URL ("https://github.com/user/repo")
function parseRepoUrl(url: string) {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\.git|$|\/)/)
    if (!match) throw new Error(`Invalid GitHub URL: ${url}`)
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

export const POST: RequestHandler = async (event) => {
    // Wrap everything in try/catch so we can see the real error
    try {
        // ------------------------------------------------------------
        // 1) Read JSON body
        // ------------------------------------------------------------
        const body = await event.request.json().catch(() => ({}))
        const submissionId = body.submissionId

        if (!submissionId) {
            return json({ error: 'submissionId required' }, { status: 400 })
        }

        // ------------------------------------------------------------
        // 2) Create Supabase client that uses the incoming Authorization header
        //    so RLS sees auth.uid() correctly when you call from Postman
        // ------------------------------------------------------------

        // Read the Authorization header from the incoming request
        // In Postman you will send: Authorization: Bearer <your Supabase JWT>
        const authHeader = event.request.headers.get('authorization') ?? ''

        // Create a Supabase client that forwards that Authorization header
        // This means Supabase will validate the JWT and RLS will run as that user
        const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
            global: {
                headers: {
                    Authorization: authHeader
                }
            }
        })

        // OLD LINE REMOVED:
        // const supabase = event.locals.supabase

        // ------------------------------------------------------------
        // 3) Load the submission
        // ------------------------------------------------------------
        const { data: submission, error: subErr } = await supabase
            .from('submissions')
            .select('*')
            .eq('id', submissionId)
            .single()

        if (subErr || !submission) {
            return json(
                {
                    error: 'Submission not found',
                    details: subErr?.message
                },
                { status: 404 }
            )
        }

        // Guard: ensure repo
        if (!submission.source_meta?.repoUrl) {
            return json(
                { error: 'Submission has no repoUrl (not a GitHub submission)' },
                { status: 400 }
            )
        }

        // ------------------------------------------------------------
        // 4) Load all submission_files rows for this submission
        // ------------------------------------------------------------
        const { data: files, error: fileErr } = await supabase
            .from('submission_files')
            .select('*')
            .eq('submission_id', submissionId)

        if (fileErr) {
            return json(
                {
                    error: 'Failed to load submission_files',
                    details: fileErr.message
                },
                { status: 500 }
            )
        }

        // If there are no rows, there is nothing to compare
        if (!files || files.length === 0) {
            return json(
                {
                    outdated: false,
                    changedFiles: [],
                    message: 'No tracked files for this submission'
                },
                { status: 200 }
            )
        }

        // ------------------------------------------------------------
        // 5) Parse repo info from the submission
        // ------------------------------------------------------------
        const repoUrl = submission.source_meta.repoUrl
        const branch = submission.source_meta.branch || 'master'

        const { owner, repo } = parseRepoUrl(repoUrl)

        // ------------------------------------------------------------
        // 6) For each tracked file, fetch the new SHA from GitHub
        // ------------------------------------------------------------
        const changedFiles: {
            file_path: string
            old_hash: string
            new_hash: string
        }[] = []

        for (const row of files) {
            const filePath = row.file_path
            const oldHash = row.file_hash

            try {
                // GitHub returns metadata for this file path
                // Note: filePath should be relative to repo root (e.g., "frontend/src/..." if subdir was "frontend")
                const { data } = await octokit.repos.getContent({
                    owner,
                    repo,
                    path: filePath,
                    ref: branch
                })

                // If file was found and is single file:
                if (!Array.isArray(data) && data.type === 'file' && data.sha) {
                    const newHash = data.sha

                    // Compare → if mismatch, file changed
                    if (newHash !== oldHash) {
                        changedFiles.push({
                            file_path: filePath,
                            old_hash: oldHash,
                            new_hash: newHash
                        })
                    }
                }
            } catch (e: any) {
                // 🔍 NEW: log all context + raw error
                const errorMessage = e?.message || String(e)
                const errorStatus = e?.status || e?.response?.status
                console.error('GitHub getContent error', {
                    owner,
                    repo,
                    branch,
                    filePath,
                    error: errorMessage,
                    status: errorStatus,
                    hasToken: !!GITHUB_TOKEN
                })
                // If getContent fails (path deleted, moved, 404), we count this as changed.
                changedFiles.push({
                    file_path: filePath,
                    old_hash: oldHash,
                    new_hash: `(missing or unreachable: ${errorStatus || errorMessage})`
                })
            }
        }

        // ------------------------------------------------------------
        // 7) Return results
        // ------------------------------------------------------------
        const outdated = changedFiles.length > 0

        return json(
            {
                outdated,
                changedFiles
            },
            { status: 200 }
        )
    } catch (err: unknown) {
        // If anything unexpected blows up, we log it and return details in JSON
        console.error('Error in /api/docs/check-updates', err)

        const message =
            err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'

        return json(
            {
                error: 'Internal server error',
                details: message
            },
            { status: 500 }
        )
    }
}
