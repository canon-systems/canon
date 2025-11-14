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
import { GITHUB_TOKEN } from '$env/static/private'

// -----------------------------------------------------------------------------
// CREATE A GITHUB CLIENT
// -----------------------------------------------------------------------------
// We create one Octokit client using your GitHub token.
// This token MUST be set in your environment as GITHUB_TOKEN.
// Without this, all GitHub API calls will fail (403).
const octokit = new Octokit({
    auth: GITHUB_TOKEN || undefined
})

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
}) {
    const { supabase, submission } = params

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
    // STEP 2: Check that a code_snapshot exists
    // ============================================================================
    //
    // code_snapshot looks like:
    //   {
    //     commitSha: "...",
    //     fileShas: { "path/to/file.ts": "abc123sha", ... }
    //   }
    //
    const snapshot = submission.code_snapshot

    if (!snapshot) {
        console.warn(
            `trackSubmissionFiles: submission ${submission.id} has no code_snapshot, nothing to track`
        )
        return
    }

    // Extract commit SHA
    const commitSha = snapshot.commitSha

    // Extract mapping of file paths → file blob SHAs
    const fileShas = snapshot.fileShas

    // If anything is missing, we cannot proceed
    if (!commitSha || !fileShas || Object.keys(fileShas).length === 0) {
        console.warn(
            `trackSubmissionFiles: submission ${submission.id} has incomplete fileShas or no files.`
        )
        return
    }

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

    try {
        const parsed = parseGitHubRepoUrl(repoUrl)
        owner = parsed.owner
        repo = parsed.repo
    } catch (e) {
        console.error(
            `trackSubmissionFiles: failed to parse repoUrl for submission ${submission.id}`,
            e
        )
        return
    }

    // ============================================================================
    // STEP 4: Build rows that will be UPSERT-ed into submission_files
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
        file_hash: string
        size_bytes: number | null
        file_type: string | null
    }[] = []

    // ============================================================================
    // LOOP OVER EACH FILE IN THE SNAPSHOT
    // ============================================================================
    for (const [file_path, file_hash_raw] of Object.entries(fileShas)) {
        // -------------------------------------------------------------------------
        // SAFETY CHECK:
        // If file_hash is null or undefined, there's no blob to fetch.
        // So we skip it entirely.
        // -------------------------------------------------------------------------
        const file_hash = file_hash_raw ?? null
        if (!file_hash) {
            console.warn(
                `trackSubmissionFiles: skipping ${file_path} because file_hash was null`
            )
            continue
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
                ref: commitSha
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
        // We only run this fallback if size_bytes is STILL null.
        // -------------------------------------------------------------------------
        if (size_bytes === null) {
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
            `trackSubmissionFiles: no usable fileShas entries for submission ${submission.id}`
        )
        return
    }

    // ============================================================================
    // STEP 5: UPSERT into submission_files
    // ============================================================================
    //
    // onConflict: 'submission_id,file_path'
    // means:
    //   - If this pair exists → UPDATE existing row
    //   - If it does not exist → INSERT a new one
    //
    // This protects us from duplicate primary key errors.
    //
    const { error: upsertError } = await supabase
        .from('submission_files')
        .upsert(rowsToUpsert, {
            onConflict: 'submission_id,file_path'
        })

    if (upsertError) {
        console.error(
            `trackSubmissionFiles: UPSERT FAILED for submission ${submission.id}`,
            upsertError
        )
        throw upsertError
    }

    // ============================================================================
    // SUCCESS!!!
    // ============================================================================
    console.log(
        `trackSubmissionFiles: successfully upserted ${rowsToUpsert.length} rows for submission ${submission.id}`
    )
}
