// ============================================================================
// /api/docs/batch-check  (POST)
//
// PURPOSE:
//   Check all repository-based submissions for outdated files.
//   Uses provider abstraction to support GitHub, GitLab, Bitbucket, etc.
//   Groups submissions by provider+repo+branch for efficient batch checking.
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
import { getRepoProvider, detectProvider } from '$lib/server/repos/providerFactory'
import type { ChangedFile } from '$lib/server/repos/types'

// Helper: Group submissions by provider+repo+branch for efficient batch checking
function groupSubmissionsByRepo(
    submissions: Array<{
        id: string
        source_meta: any
        code_snapshot: any
    }>
): Map<string, typeof submissions> {
    const groups = new Map<string, typeof submissions>()

    for (const sub of submissions) {
        const repoUrl = sub.source_meta?.repoUrl
        const branch = sub.source_meta?.branch || 'master'

        if (!repoUrl) continue

        const providerName = detectProvider(repoUrl) || 'unknown'
        const groupKey = `${providerName}|${repoUrl}|${branch}`

        if (!groups.has(groupKey)) {
            groups.set(groupKey, [])
        }
        groups.get(groupKey)!.push(sub)
    }

    return groups
}

// Process a single group of submissions (same provider+repo+branch)
async function processSubmissionGroup(
    groupKey: string,
    submissions: Array<{
        id: string
        source_meta: any
        code_snapshot: any
    }>,
    supabase: any
): Promise<Array<{ submissionId: string; outdated: boolean; changedFiles: ChangedFile[] }>> {
    const results: Array<{ submissionId: string; outdated: boolean; changedFiles: ChangedFile[] }> = []

    if (submissions.length === 0) return results

    const firstSub = submissions[0]
    const repoUrl = firstSub.source_meta?.repoUrl
    const branch = firstSub.source_meta?.branch || 'master'

    if (!repoUrl) return results

    const provider = getRepoProvider(repoUrl)
    if (!provider) {
        console.warn(`No provider found for ${repoUrl}, skipping group`)
        // Mark all as checked but not outdated
        for (const sub of submissions) {
            await supabase
            .from('submissions')
                .update({
                    last_checked_at: new Date().toISOString(),
                    is_outdated: false
                })
                .eq('id', sub.id)
            results.push({
                submissionId: sub.id,
                outdated: false,
                changedFiles: []
            })
        }
        return results
    }

    const repoInfo = provider.parseRepoUrl(repoUrl)
    if (!repoInfo) {
        console.warn(`Failed to parse repo URL ${repoUrl}, skipping group`)
        return results
    }

    try {
        // Get all files for all submissions in this group
        const submissionFilesMap = new Map<string, Array<{ file_path: string; file_hash: string }>>()

        for (const sub of submissions) {
            const { data: files } = await supabase
                .from('submission_files')
                .select('file_path, file_hash')
                .eq('submission_id', sub.id)

            if (files && files.length > 0) {
                submissionFilesMap.set(sub.id, files)
        }
        }

        // Collect all unique file paths across all submissions in this group
        const allFilePaths = new Set<string>()
        for (const files of submissionFilesMap.values()) {
            for (const file of files) {
                allFilePaths.add(file.file_path)
            }
        }

        if (allFilePaths.size === 0) {
            // No files to check, mark all as not outdated
            for (const sub of submissions) {
                await supabase
                    .from('submissions')
                    .update({
                        last_checked_at: new Date().toISOString(),
                        is_outdated: false
                    })
                    .eq('id', sub.id)
                results.push({
                    submissionId: sub.id,
                    outdated: false,
                    changedFiles: []
                })
            }
            return results
        }

        // Fast path: Check commit SHA first for submissions that have it
        const commitShaChecks = new Map<string, string | null>()
        for (const sub of submissions) {
            const storedCommitSha = sub.code_snapshot?.commitSha
            if (storedCommitSha) {
                commitShaChecks.set(sub.id, storedCommitSha)
            }
        }

        // Get latest commit SHA once for the branch
        let latestCommitSha: string | null = null
        if (commitShaChecks.size > 0) {
            latestCommitSha = await provider.getBranchCommitSha(repoInfo, branch)
        }

        // Batch fetch all file SHAs once for this repo/branch
        const currentShas = await provider.fetchFileShas(repoInfo, branch, Array.from(allFilePaths))

        // Process each submission
        for (const sub of submissions) {
            const submissionId = sub.id
            const files = submissionFilesMap.get(submissionId) || []

            // Fast path: If commit SHA unchanged, no files changed
            const storedCommitSha = commitShaChecks.get(submissionId)
            if (storedCommitSha && latestCommitSha && storedCommitSha === latestCommitSha) {
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
                continue
            }

            // Check files for this submission
            const changedFiles: ChangedFile[] = []
            for (const file of files) {
                const oldHash = file.file_hash
                const newHash = currentShas[file.file_path]

                if (oldHash && newHash !== oldHash) {
                                changedFiles.push({
                        file_path: file.file_path,
                                    old_hash: oldHash,
                        new_hash: newHash || '(missing or unreachable)'
                        })
                    }
                }

                const isOutdated = changedFiles.length > 0

                await supabase
                    .from('submissions')
                    .update({
                        last_checked_at: new Date().toISOString(),
                        is_outdated: isOutdated
                    })
                    .eq('id', submissionId)

            results.push({
                submissionId,
                outdated: isOutdated,
                changedFiles
            })
        }
            } catch (e: any) {
        console.error(`Error processing group ${groupKey}:`, e)
        // Mark all as checked but not outdated on error
        for (const sub of submissions) {
                await supabase
                    .from('submissions')
                    .update({
                        last_checked_at: new Date().toISOString(),
                        is_outdated: false
                    })
                .eq('id', sub.id)
                results.push({
                submissionId: sub.id,
                    outdated: false,
                    changedFiles: []
                })
            }
        }

    return results
}

export const POST: RequestHandler = async ({ locals: { supabase }, url }) => {
    try {
        // Get tiered checking parameters from query string (optional)
        const skipRecent = url.searchParams.get('skip_recent') !== 'false'; // Default: true
        const recentThresholdMinutes = parseInt(url.searchParams.get('recent_threshold') || '60', 10); // Default: 60 minutes

        // Build query for completed repository-based submissions
        let query = supabase
            .from('submissions')
            .select('id, source_meta, code_snapshot, input_type, last_checked_at')
            .in('input_type', ['github_repo', 'github_repo_directory'])
            .eq('status', 'completed')

        // Smart caching: Skip submissions checked recently (tiered checking)
        if (skipRecent) {
            const thresholdTime = new Date(Date.now() - recentThresholdMinutes * 60 * 1000).toISOString()
            // Only check submissions that haven't been checked recently OR don't have last_checked_at
            query = query.or(`last_checked_at.is.null,last_checked_at.lt.${thresholdTime}`)
        }

        const { data: submissions, error: subError } = await query

        if (subError) {
            return json({ error: 'Failed to fetch submissions', details: subError.message }, { status: 500 })
        }

        if (!submissions || submissions.length === 0) {
            return json({
                checked: 0,
                outdated: 0,
                results: [],
                message: 'No repository-based submissions found'
            })
        }

        // Group submissions by provider+repo+branch for efficient batch checking
        const groups = groupSubmissionsByRepo(submissions)

        // Process groups in parallel (with reasonable concurrency limit)
        const MAX_CONCURRENT = 5
        const groupEntries = Array.from(groups.entries())
        const allResults: Array<{ submissionId: string; outdated: boolean; changedFiles: ChangedFile[] }> = []

        // Process groups in batches to avoid overwhelming APIs
        for (let i = 0; i < groupEntries.length; i += MAX_CONCURRENT) {
            const batch = groupEntries.slice(i, i + MAX_CONCURRENT)
            const batchResults = await Promise.all(
                batch.map(([groupKey, groupSubs]) => processSubmissionGroup(groupKey, groupSubs, supabase))
            )
            allResults.push(...batchResults.flat())
        }

        const outdatedCount = allResults.filter((r) => r.outdated).length

        return json({
            checked: submissions.length,
            outdated: outdatedCount,
            results: allResults,
            message: `Checked ${submissions.length} submissions, ${outdatedCount} are outdated`
        })
    } catch (err: unknown) {
        console.error('Error in /api/docs/batch-check', err)
        const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
        return json({ error: 'Batch check failed', details: message }, { status: 500 })
    }
}

