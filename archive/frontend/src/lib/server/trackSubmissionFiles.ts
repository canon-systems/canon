// ============================================================================
// trackSubmissionFiles.ts
//
// PURPOSE:
//   This helper takes a submission row that *already* has a code_snapshot
//   (commit SHA + blob SHAs for each file) and stores metadata for each
//   selected file in the submission_files table.
//
//   Metadata includes:
//     • file_path  (where the file lives in the repo)
//     • file_hash  (blob SHA of the file at that commit)
//     • size_bytes (how big the file actually is)
//     • file_type  (simple extension like ts, py, json, etc)
//
//   WHY THIS EXISTS:
//     Because documentation updates depend on detecting *what* files were used
//     to generate the docs, and checking later if those files changed.
//
//   HOW IT WORKS:
//     1. Confirm submission came from GitHub
//     2. Extract repo owner + repo name
//     3. For each file:
//           Try #1: GitHub getContent() API to get size
//           Try #2: GitHub blob API fallback using the SHA
//     4. UPSERT into submission_files
//        (so re running this will not duplicate rows)
//
// NOTE:
//   This file is insanely commented on purpose per your instructions.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { Octokit } from '@octokit/rest'
import { getUserOctokit } from './github/getUserOctokit'

// -----------------------------------------------------------------------------
// TYPE: SubmissionRow
// -----------------------------------------------------------------------------
// This describes the exact shape of a "submission" row that we need.
// We don't model every column in the submissions table, only the ones we use.
type SubmissionRow = {
    id: string                     // the UUID of the submission
    input_type: string | null      // "github_repo" or "github_repo_directory"
    selected_files: string[] | null
    source_meta: any               // contains repoUrl, branch, subdir, etc
    code_snapshot?: {
        commitSha?: string           // commit SHA for the snapshot
        fileShas?: Record<string, string | null> // mapping: file_path -> blob SHA
        createdAt?: string           // when snapshot was taken
    } | null
}

// -----------------------------------------------------------------------------
// HELPER: Parse GitHub Repo URL
// -----------------------------------------------------------------------------
// Example:
//   "https://github.com/John-Sellers/documentation-generator"
// → owner: "John-Sellers"
// → repo: "documentation-generator"
//
// We use RegExp to extract the owner and repo names.
function parseGitHubRepoUrl(repoUrl: string): { owner: string; repo: string } {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\.git|$|\/)/)

    // If the regex does not match, the URL isn't valid
    if (!match) {
        throw new Error(`Could not parse GitHub repo URL: ${repoUrl}`)
    }

    // match[1] is owner, match[2] is repo name
    const owner = match[1]
    const repo = match[2].replace(/\.git$/, '') // strip ".git" if present

    return { owner, repo }
}

// -----------------------------------------------------------------------------
// HELPER: Infer file type from file path
// -----------------------------------------------------------------------------
// This is NOT a full MIME-type detection.
// We just grab the extension after the last dot.
// Example: "src/app/main.py" → "py"
//
// If there's no dot, we return "unknown".
function guessFileTypeFromPath(path: string): string {
    const lastDot = path.lastIndexOf('.')

    // No dot = unknown type
    if (lastDot === -1) return 'unknown'

    // Everything after the last dot = extension
    const ext = path.slice(lastDot + 1).toLowerCase()

    return ext || 'unknown'
}

// -----------------------------------------------------------------------------
// MAIN FUNCTION: trackSubmissionFiles
// -----------------------------------------------------------------------------
// This function does ALL the magic.
//
// It takes:
//   - supabase client
//   - a submission row (which MUST include a valid code_snapshot)
//
// It produces:
//   - rows inside the submission_files table
//
// If called twice for the same submission → no duplicates (UPSERT).
//
export async function trackSubmissionFiles(params: {
    supabase: SupabaseClient
    submission: SubmissionRow
    userId?: string | null
}) {
    const { supabase, submission, userId } = params

    // Get user's GitHub connection (or anonymous if not connected)
    const octokit = await getUserOctokit(supabase, userId || null)

    // ============================================================================
    // STEP 1: Ensure this submission *should* have trackable GitHub files
    // ============================================================================
    //
    // Only GitHub-based submissions have file SHAs.
    // Zip uploads + pasted code do NOT have file hashes (yet).
    //
    const isGitSubmission =
        submission.input_type === 'github_repo' ||
        submission.input_type === 'github_repo_directory'

    if (!isGitSubmission) {
        console.log(
            `trackSubmissionFiles: skipping submission ${submission.id} because input_type is not a Git type`
        )
        return
    }

    // ============================================================================
    // STEP 2: Extract code_snapshot (optional but helpful)
    // ============================================================================
    //
    // code_snapshot looks like:
    //   {
    //     commitSha: "...",
    //     fileShas: { "path/to/file.ts": "abc123sha", ... }
    //   }
    //
    // We use this for:
    //   - commitSha: to fetch file metadata at the correct commit
    //   - fileShas: to get file hashes for blob API fallback
    //
    // But we can still work without it by using selected_files directly.
    //
    const snapshot = submission.code_snapshot || null
    const commitSha = snapshot?.commitSha || null
    const fileShas = snapshot?.fileShas || {}

    // Log if we don't have a snapshot (for debugging)
    if (!snapshot) {
        console.warn(
            `trackSubmissionFiles: submission ${submission.id} has no code_snapshot, will use selected_files only`
        )
    }

    // We need either a commitSha OR we can try to get it from the branch
    // For now, if we don't have commitSha, we'll try to fetch files at the branch tip
    // (This might not work perfectly, but it's better than nothing)

    // ============================================================================
    // STEP 3: Extract repoUrl so we know what GitHub repo to query
    // ============================================================================
    const meta = submission.source_meta || {}
    const repoUrl: string | undefined = meta.repoUrl

    if (!repoUrl) {
        console.warn(
            `trackSubmissionFiles: submission ${submission.id} missing repoUrl. Cannot query GitHub.`
        )
        return
    }

    // Parse owner + repo name
    let owner: string
    let repo: string
    let branch: string

    try {
        const parsed = parseGitHubRepoUrl(repoUrl)
        owner = parsed.owner
        repo = parsed.repo
        // Get branch from source_meta (fallback to 'main' if not available)
        branch = meta.branch || 'main'
    } catch (e) {
        console.error(
            `trackSubmissionFiles: failed to parse repoUrl for submission ${submission.id}`,
            e
        )
        return
    }

    // If we don't have a commitSha from snapshot, we'll use the branch name
    // This means we'll fetch files at the current branch tip
    const refToUse = commitSha || branch

    // ============================================================================
    // STEP 4: Use selected_files as the source of truth
    // ============================================================================
    //
    // We use the selected_files array directly (not fileShas keys).
    // This ensures we only track files that were actually selected by the user.
    //
    const selectedFiles = submission.selected_files || []

    if (selectedFiles.length === 0) {
        console.warn(
            `trackSubmissionFiles: submission ${submission.id} has no selected_files, nothing to track`
        )
        return
    }

    // ============================================================================
    // STEP 5: Build rows that will be UPSERT-ed into submission_files
    // ============================================================================
    //
    // Each row looks like:
    //   {
    //     submission_id: "...",
    //     file_path: "...",
    //     file_hash: "...",
    //     size_bytes: 1234,
    //     file_type: "ts"
    //   }
    //
    const rowsToUpsert: {
        submission_id: string
        file_path: string
        file_hash: string | null
        size_bytes: number | null
        file_type: string | null
    }[] = []

    // ============================================================================
    // LOOP OVER EACH FILE IN selected_files
    // ============================================================================
    for (const file_path of selectedFiles) {
        // Get file hash from code_snapshot.fileShas if available
        const file_hash = fileShas[file_path] ?? null

        // Note: We still track files even if file_hash is null.
        // We can still try to get size via getContent API using the path.
        if (!file_hash) {
            console.warn(
                `trackSubmissionFiles: no file_hash for ${file_path} (submission ${submission.id}), will try to get size via path only`
            )
        }

        // Initialize our metadata with null so we always return *something*.
        let size_bytes: number | null = null
        let file_type: string | null = null

        // -------------------------------------------------------------------------
        // ATTEMPT #1:
        //   Use GitHub "repos.getContent" API
        //
        // This is great when:
        //    - The file exists at that path in that commit
        //    - The path is EXACT
        //
        // But it can fail if:
        //    - File moved
        //    - File is in a weird subdir
        //    - Path resolution is off
        //    - GitHub returns an array (meaning it's a directory)
        //
        // So we wrap this in try/catch.
        // -------------------------------------------------------------------------
        try {
            const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path: file_path,
                ref: refToUse
            })

            // If this is a real file (not a directory), GitHub gives size here.
            if (!Array.isArray(data) && data.type === 'file') {
                // GitHub API returns size as a number
                if (typeof data.size === 'number' && data.size >= 0) {
                    size_bytes = data.size
                }
                file_type = guessFileTypeFromPath(file_path)
            } else {
                // Directory or weird shape → fallback later
                file_type = guessFileTypeFromPath(file_path)
            }
        } catch (e: any) {
            // If this fails (404, wrong path, etc), we log and fallback below.
            const errorMsg = e?.message || String(e)
            const errorStatus = e?.status || e?.response?.status
            console.warn(
                `trackSubmissionFiles: getContent FAILED for ${file_path} in submission ${submission.id}`,
                { error: errorMsg, status: errorStatus }
            )

            // We still set file_type here because we DO know the extension.
            file_type = guessFileTypeFromPath(file_path)
        }

        // -------------------------------------------------------------------------
        // ATTEMPT #2 (FALLBACK):
        //   Use GitHub "git.getBlob" API
        //
        // WHY THIS IS AWESOME:
        //   You can fetch a blob **by SHA** even if the path is wrong or unknown.
        //
        //   This ALWAYS returns:
        //     • size of the blob (file)
        //     • base64 content (which we ignore)
        //
        // We only run this fallback if:
        //   - size_bytes is STILL null
        //   - AND we have a file_hash (can't use blob API without a hash)
        // -------------------------------------------------------------------------
        if (size_bytes === null && file_hash) {
            try {
                const { data: blobData } = await octokit.git.getBlob({
                    owner,
                    repo,
                    file_sha: file_hash // ← using the SHA directly!
                })

                // GitHub blob API returns size as a number
                // Response structure: { sha: string, size: number, content: string, encoding: string }
                if (blobData && typeof blobData.size === 'number' && blobData.size >= 0) {
                    size_bytes = blobData.size
                    console.log(
                        `trackSubmissionFiles: got size ${size_bytes} bytes for ${file_path} via blob API`
                    )
                } else {
                    console.warn(
                        `trackSubmissionFiles: blob API returned invalid size for ${file_path}`,
                        { size: blobData?.size, type: typeof blobData?.size }
                    )
                }
            } catch (e: any) {
                const errorMsg = e?.message || String(e)
                const errorStatus = e?.status || e?.response?.status
                console.warn(
                    `trackSubmissionFiles: blob fallback FAILED for ${file_path} in submission ${submission.id}`,
                    { error: errorMsg, status: errorStatus, file_hash }
                )
            }
        }

        // -------------------------------------------------------------------------
        // Log if we couldn't get size (for debugging)
        // -------------------------------------------------------------------------
        if (size_bytes === null) {
            console.warn(
                `trackSubmissionFiles: WARNING - could not determine size for ${file_path} in submission ${submission.id}. Both getContent and blob API failed or returned no size.`
            )
        }

        // -------------------------------------------------------------------------
        // Finally push this row into our upsert array
        // -------------------------------------------------------------------------
        rowsToUpsert.push({
            submission_id: submission.id,
            file_path,
            file_hash,
            size_bytes,
            file_type
        })
    }

    // If there's somehow no rows to insert, we bail.
    if (rowsToUpsert.length === 0) {
        console.warn(
            `trackSubmissionFiles: no rows to insert for submission ${submission.id} (selected_files was empty or all files were skipped)`
        )
        return
    }

    // ============================================================================
    // STEP 6: INSERT into submission_files
    // ============================================================================
    //
    // Simple INSERT with ignoreDuplicates - if a row with the same
    // (submission_id, file_path) already exists, we skip it (no error).
    // This allows the same file_path to exist for different submission_ids.
    //
    const { error: insertError } = await supabase
        .from('submission_files')
        .insert(rowsToUpsert, {
            onConflict: 'submission_id,file_path',
            ignoreDuplicates: true
        })

    if (insertError) {
        console.error(
            `trackSubmissionFiles: INSERT FAILED for submission ${submission.id}`,
            insertError
        )
        throw insertError
    }

    // ============================================================================
    // SUCCESS!!!
    // ============================================================================
    console.log(
        `trackSubmissionFiles: Successfully inserted ${rowsToUpsert.length} rows for submission ${submission.id}`
    )
}
