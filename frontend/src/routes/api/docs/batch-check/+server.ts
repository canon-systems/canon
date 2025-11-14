// ============================================================================
// /api/docs/batch-check  (POST)
//
// PURPOSE:
//   Check all GitHub-based submissions for outdated files.
//   Updates the submissions table with:
//     - last_checked_at: timestamp of when check was performed
//     - is_outdated: boolean indicating if files have changed
//
// RETURNS:
//   {
//      checked: number,        // number of submissions checked
//      outdated: number,       // number of submissions that are outdated
//      results: [
//         { submissionId: "...", outdated: true/false, changedFiles: [...] }
//      ]
//   }
//
// NOTE: This endpoint should be called by a cron job or scheduler
// ============================================================================

import type { RequestHandler } from '@sveltejs/kit'
import { json } from '@sveltejs/kit'
import { Octokit } from '@octokit/rest'
import { GITHUB_TOKEN } from '$env/static/private'

const octokit = new Octokit({
    auth: GITHUB_TOKEN || undefined
})

// Helper: parse GitHub repo URL
function parseRepoUrl(url: string) {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\.git|$|\/)/)
    if (!match) throw new Error(`Invalid GitHub URL: ${url}`)
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

export const POST: RequestHandler = async ({ locals: { supabase } }) => {
    try {
        // Get all completed GitHub submissions
        const { data: submissions, error: subError } = await supabase
            .from('submissions')
            .select('id, source_meta, selected_files, code_snapshot, input_type')
            .in('input_type', ['github_repo', 'github_repo_directory'])
            .eq('status', 'completed')

        if (subError) {
            return json({ error: 'Failed to fetch submissions', details: subError.message }, { status: 500 })
        }

        if (!submissions || submissions.length === 0) {
            return json({
                checked: 0,
                outdated: 0,
                results: [],
                message: 'No GitHub submissions found'
            })
        }

        const results: Array<{
            submissionId: string
            outdated: boolean
            changedFiles: Array<{ file_path: string; old_hash: string; new_hash: string }>
        }> = []

        let outdatedCount = 0

        // Check each submission
        for (const sub of submissions) {
            const submissionId = sub.id
            const sourceMeta = sub.source_meta || {}
            const repoUrl = sourceMeta.repoUrl
            const branch = sourceMeta.branch || 'master'

            if (!repoUrl) {
                continue // Skip submissions without repoUrl
            }

            // Get submission_files for this submission
            const { data: files, error: fileErr } = await supabase
                .from('submission_files')
                .select('*')
                .eq('submission_id', submissionId)

            if (fileErr || !files || files.length === 0) {
                // No tracked files, mark as not outdated
                results.push({
                    submissionId,
                    outdated: false,
                    changedFiles: []
                })
                continue
            }

            try {
                const { owner, repo } = parseRepoUrl(repoUrl)
                const changedFiles: Array<{ file_path: string; old_hash: string; new_hash: string }> = []

                // Check each file
                for (const row of files) {
                    const filePath = row.file_path
                    const oldHash = row.file_hash

                    try {
                        const { data } = await octokit.repos.getContent({
                            owner,
                            repo,
                            path: filePath,
                            ref: branch
                        })

                        if (!Array.isArray(data) && data.type === 'file' && data.sha) {
                            const newHash = data.sha
                            if (newHash !== oldHash) {
                                changedFiles.push({
                                    file_path: filePath,
                                    old_hash: oldHash,
                                    new_hash: newHash
                                })
                            }
                        }
                    } catch (e: any) {
                        // File might be deleted or moved - count as changed
                        changedFiles.push({
                            file_path: filePath,
                            old_hash: oldHash,
                            new_hash: '(missing or unreachable)'
                        })
                    }
                }

                const isOutdated = changedFiles.length > 0
                if (isOutdated) outdatedCount++

                results.push({
                    submissionId,
                    outdated: isOutdated,
                    changedFiles
                })

                // Update submission with check results
                await supabase
                    .from('submissions')
                    .update({
                        last_checked_at: new Date().toISOString(),
                        is_outdated: isOutdated
                    })
                    .eq('id', submissionId)
            } catch (e: any) {
                console.error(`Error checking submission ${submissionId}:`, e)
                // Mark as checked but don't mark as outdated if we can't check
                await supabase
                    .from('submissions')
                    .update({
                        last_checked_at: new Date().toISOString(),
                        is_outdated: false
                    })
                    .eq('id', submissionId)

                results.push({
                    submissionId,
                    outdated: false,
                    changedFiles: []
                })
            }
        }

        return json({
            checked: submissions.length,
            outdated: outdatedCount,
            results,
            message: `Checked ${submissions.length} submissions, ${outdatedCount} are outdated`
        })
    } catch (err: unknown) {
        console.error('Error in /api/docs/batch-check', err)
        const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
        return json({ error: 'Batch check failed', details: message }, { status: 500 })
    }
}

