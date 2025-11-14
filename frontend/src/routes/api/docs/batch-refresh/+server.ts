// ============================================================================
// /api/docs/batch-refresh  (POST)
//
// PURPOSE:
//   Automatically refresh all outdated GitHub-based submissions.
//   This endpoint:
//     1. Finds all submissions where is_outdated = true
//     2. Calls the update endpoint for each one
//     3. Returns summary of results
//
// RETURNS:
//   {
//      refreshed: number,     // number of submissions refreshed
//      failed: number,        // number of submissions that failed to refresh
//      results: [
//         { submissionId: "...", success: true/false, error?: "..." }
//      ]
//   }
//
// NOTE: This endpoint should be called by a cron job or scheduler
// ============================================================================

import type { RequestHandler } from '@sveltejs/kit'
import { json } from '@sveltejs/kit'
import { getFileShas, getLatestCommitSha } from '$lib/server/github/githubTracking'
import { parseRepoUrl } from '$lib/server/github/github'
import {
    VERCEL_AI_GATEWAY_URL,
    VERCEL_AI_GATEWAY_API_KEY,
    LLM_MODEL,
    GITHUB_TOKEN
} from '$env/static/private'

function jsonResponse(data: unknown, status = 200) {
    return json(data, { status })
}

// Helper to call LLM
async function callGateway(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    model?: string
) {
    if (!VERCEL_AI_GATEWAY_URL || !VERCEL_AI_GATEWAY_API_KEY) {
        throw new Error('Gateway env vars missing')
    }

    // Use provided model or fall back to env default
    const modelToUse = model || LLM_MODEL

    const r = await fetch(`${VERCEL_AI_GATEWAY_URL.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${VERCEL_AI_GATEWAY_API_KEY}`,
            'x-vercel-ai-key': VERCEL_AI_GATEWAY_API_KEY
        },
        body: JSON.stringify({
            model: modelToUse,
            temperature: 0.3,
            messages
        })
    })

    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
        throw new Error(j?.error?.message || j?.message || `LLM HTTP ${r.status}`)
    }
    return String(j?.choices?.[0]?.message?.content ?? '')
}

// Fetch file content from GitHub
async function fetchFileContent(owner: string, repo: string, branch: string, path: string): Promise<string | null> {
    try {
        const res = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
            {
                headers: {
                    accept: "application/vnd.github+json",
                    ...(GITHUB_TOKEN ? { authorization: `Bearer ${GITHUB_TOKEN}` } : {})
                }
            }
        )

        if (!res.ok) return null
        const data = (await res.json()) as { content: string; encoding: string }

        if (data.encoding === 'base64') {
            return Buffer.from(data.content, 'base64').toString('utf-8')
        }
        return data.content
    } catch {
        return null
    }
}

export const POST: RequestHandler = async ({ locals: { supabase } }) => {
    try {
        // Get all outdated GitHub submissions
        const { data: submissions, error: subError } = await supabase
            .from('submissions')
            .select('*')
            .in('input_type', ['github_repo', 'github_repo_directory'])
            .eq('status', 'completed')
            .eq('is_outdated', true)

        if (subError) {
            return jsonResponse({ error: 'Failed to fetch outdated submissions', details: subError.message }, 500)
        }

        if (!submissions || submissions.length === 0) {
            return jsonResponse({
                refreshed: 0,
                failed: 0,
                results: [],
                message: 'No outdated submissions found'
            })
        }

        const results: Array<{
            submissionId: string
            success: boolean
            error?: string
        }> = []

        let refreshedCount = 0
        let failedCount = 0

        // Refresh each submission
        for (const submission of submissions) {
            const submissionId = submission.id

            try {
                const sourceMeta = submission.source_meta || {}
                const { repoUrl, branch, model } = sourceMeta

                if (!repoUrl || !branch) {
                    results.push({
                        submissionId,
                        success: false,
                        error: 'Missing repoUrl or branch'
                    })
                    failedCount++
                    continue
                }

                const parsed = parseRepoUrl(repoUrl)
                if (!parsed) {
                    results.push({
                        submissionId,
                        success: false,
                        error: 'Invalid repo URL'
                    })
                    failedCount++
                    continue
                }

                const selectedFiles = submission.selected_files || []
                if (selectedFiles.length === 0) {
                    results.push({
                        submissionId,
                        success: false,
                        error: 'No files selected'
                    })
                    failedCount++
                    continue
                }

                // Fetch latest file contents
                const filesForDoc: Array<{ path: string; content: string }> = []
                const MAX_PER_FILE = 200_000

                for (const filePath of selectedFiles) {
                    const content = await fetchFileContent(parsed.owner, parsed.repo, branch, filePath)
                    if (content) {
                        const clipped = content.length > MAX_PER_FILE ? content.slice(0, MAX_PER_FILE) : content
                        filesForDoc.push({ path: filePath, content: clipped })
                    }
                }

                if (filesForDoc.length === 0) {
                    results.push({
                        submissionId,
                        success: false,
                        error: 'Could not fetch any file contents'
                    })
                    failedCount++
                    continue
                }

                // Get current commit SHA and file SHAs for snapshot
                const latestCommitSha = await getLatestCommitSha(repoUrl, branch)
                const fileShas = await getFileShas(repoUrl, branch, selectedFiles)

                // Update submission status to processing
                await supabase
                    .from('submissions')
                    .update({ status: 'processing' })
                    .eq('id', submissionId)

                // Generate updated documentation
                const system = [
                    'You are a senior technical writer.',
                    'You are updating existing documentation. The source code has changed, and you need to update the documentation accordingly.',
                    'Maintain the same structure and style as much as possible, but reflect all code changes accurately.',
                    'Include: overview, key components, data flow, API/CLI usage (if any), setup/run, and limitations.',
                    'When helpful, include short code snippets or pseudo-diagrams.',
                    'Use headings, subheadings, and bullet points. No HTML.'
                ].join(' ')

                const user =
                    `Project: ${submission.title || 'Documentation'}\n\n` +
                    `The following files have been updated:\n` +
                    filesForDoc
                        .map((f: { path: string; content: string }) => `--- FILE: ${f.path} ---\n${f.content}`)
                        .join('\n\n') +
                    `\n\nPlease update the documentation to reflect these changes.`

                const markdown = (await callGateway(
                    [
                        { role: 'system', content: system },
                        { role: 'user', content: user }
                    ],
                    model
                )).trim()

                // Save updated documentation and snapshot
                const { error: updateError } = await supabase
                    .from('submissions')
                    .update({
                        markdown,
                        status: 'completed',
                        summary: markdown.replace(/\s+/g, ' ').slice(0, 200),
                        code_snapshot: {
                            commitSha: latestCommitSha,
                            fileShas,
                            updatedAt: new Date().toISOString()
                        },
                        is_outdated: false, // Mark as fresh after refresh
                        last_checked_at: new Date().toISOString()
                    })
                    .eq('id', submissionId)

                if (updateError) {
                    throw new Error(updateError.message)
                }

                results.push({
                    submissionId,
                    success: true
                })
                refreshedCount++
            } catch (err: unknown) {
                const errorMsg = err instanceof Error ? err.message : String(err)
                console.error(`Error refreshing submission ${submissionId}:`, err)

                // Mark as failed
                try {
                    await supabase
                        .from('submissions')
                        .update({
                            status: 'failed',
                            error_message: errorMsg.slice(0, 500)
                        })
                        .eq('id', submissionId)
                } catch {
                    // Ignore errors in error handler
                }

                results.push({
                    submissionId,
                    success: false,
                    error: errorMsg
                })
                failedCount++
            }
        }

        return jsonResponse({
            refreshed: refreshedCount,
            failed: failedCount,
            results,
            message: `Refreshed ${refreshedCount} submissions, ${failedCount} failed`
        })
    } catch (err: unknown) {
        console.error('Error in /api/docs/batch-refresh', err)
        const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'
        return jsonResponse({ error: 'Batch refresh failed', details: message }, 500)
    }
}

