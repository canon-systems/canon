// ============================================================================
// /api/docs/check-updates  (POST)
//
// PURPOSE:
//   Given a submissionId, this endpoint checks the repository to see whether any of the
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
//       - Fast path: Compare stored commit SHA with latest branch commit SHA
//       - If commit SHA unchanged, no files changed (fast return)
//       - If commit SHA changed, batch fetch latest file SHAs using provider's Tree API
//       - Compare with stored file_hash
//       - Any mismatch = outdated
// ============================================================================

import type { RequestHandler } from '@sveltejs/kit'
import { json } from '@sveltejs/kit'
import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'
import { getRepoProvider } from '$lib/server/repos/providerFactory'
import type { ChangedFile } from '$lib/server/repos/types'

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
                { error: 'Submission has no repoUrl (not a repository-based submission)' },
                { status: 400 }
            )
        }

        // ------------------------------------------------------------
        // 4) Get repository provider
        // ------------------------------------------------------------
        const repoUrl = submission.source_meta.repoUrl
        const branch = submission.source_meta.branch || 'master'

        const provider = getRepoProvider(repoUrl)
        if (!provider) {
            return json(
                { error: `Unsupported repository provider for URL: ${repoUrl}` },
                { status: 400 }
            )
        }

        const repoInfo = provider.parseRepoUrl(repoUrl)
        if (!repoInfo) {
            return json(
                { error: `Failed to parse repository URL: ${repoUrl}` },
                { status: 400 }
            )
        }

        // ------------------------------------------------------------
        // 5) Fast path: Check commit SHA first
        // ------------------------------------------------------------
        const codeSnapshot = submission.code_snapshot || {}
        const storedCommitSha = codeSnapshot.commitSha

        if (storedCommitSha) {
            const latestCommitSha = await provider.getBranchCommitSha(repoInfo, branch)
            if (latestCommitSha && latestCommitSha === storedCommitSha) {
                // Fast path: commit SHA unchanged, so no files changed
                return json(
                    {
                        outdated: false,
                        changedFiles: [],
                        message: 'No changes detected (commit SHA unchanged)'
                    },
                    { status: 200 }
                )
            }
        }

        // ------------------------------------------------------------
        // 6) Load all submission_files rows for this submission
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
        // 7) Batch fetch file SHAs using provider's efficient method
        // ------------------------------------------------------------
        const filePaths = files.map((f) => f.file_path)
        const currentShas = await provider.fetchFileShas(repoInfo, branch, filePaths)

        // ------------------------------------------------------------
        // 8) Compare stored hashes with current hashes
        // ------------------------------------------------------------
        const changedFiles: ChangedFile[] = []

        for (const row of files) {
            const filePath = row.file_path
            const oldHash = row.file_hash
            const newHash = currentShas[filePath]

            // File changed if:
            // - SHA is different
            // - File was deleted (newHash is null but oldHash exists)
            if (oldHash && newHash !== oldHash) {
                changedFiles.push({
                    file_path: filePath,
                    old_hash: oldHash,
                    new_hash: newHash || '(missing or unreachable)'
                })
            }
        }

        // ------------------------------------------------------------
        // 9) Update the database with the check results
        // ------------------------------------------------------------
        const outdated = changedFiles.length > 0

        // Update the submission's is_outdated flag and last_checked_at timestamp
        const { error: updateError } = await supabase
            .from('submissions')
            .update({
                is_outdated: outdated,
                last_checked_at: new Date().toISOString()
            })
            .eq('id', submissionId)

        if (updateError) {
            console.error('Failed to update is_outdated flag:', updateError)
            // Continue anyway - we still return the check results
        }

        // ------------------------------------------------------------
        // 10) Return results
        // ------------------------------------------------------------
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
