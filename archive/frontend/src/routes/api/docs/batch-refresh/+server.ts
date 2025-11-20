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
    LLM_MODEL
} from '$env/static/private'
import { getUserOctokit } from '$lib/server/github/getUserOctokit'
import { buildSystemPrompt } from '$lib/server/prompts/buildSystemPrompt'

function jsonResponse(data: unknown, status = 200) {
    return json(data, { status })
}

// Helper to call LLM
async function callGateway(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    model?: string,
    temperature?: number
) {
    if (!VERCEL_AI_GATEWAY_URL || !VERCEL_AI_GATEWAY_API_KEY) {
        throw new Error('Gateway env vars missing')
    }

    // Use provided model or fall back to env default
    const modelToUse = model || LLM_MODEL
    // Use provided temperature or fall back to default 0.3
    const temperatureToUse = temperature !== undefined ? temperature : 0.3

    const r = await fetch(`${VERCEL_AI_GATEWAY_URL.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${VERCEL_AI_GATEWAY_API_KEY}`,
            'x-vercel-ai-key': VERCEL_AI_GATEWAY_API_KEY
        },
        body: JSON.stringify({
            model: modelToUse,
            temperature: temperatureToUse,
            messages
        })
    })

    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
        throw new Error(j?.error?.message || j?.message || `LLM HTTP ${r.status}`)
    }
    return String(j?.choices?.[0]?.message?.content ?? '')
}

// Fetch file content from GitHub using Octokit
async function fetchFileContent(
    octokit: Awaited<ReturnType<typeof getUserOctokit>>,
    owner: string,
    repo: string,
    branch: string,
    path: string
): Promise<string | null> {
    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path,
            ref: branch
        });

        if (!Array.isArray(data) && data.type === 'file' && 'content' in data && typeof data.content === 'string') {
            // GitHub returns base64 encoded content
            return Buffer.from(data.content, 'base64').toString('utf-8');
        }
        return null;
    } catch {
        return null;
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
                    // Get user's GitHub connection (or anonymous if not connected)
                    const octokit = await getUserOctokit(supabase, sub.created_by || null)
                    const content = await fetchFileContent(octokit, parsed.owner, parsed.repo, branch, filePath)
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
                // Get user's GitHub connection (or anonymous if not connected)
                const octokit = await getUserOctokit(supabase, sub.created_by || null)
                const latestCommitSha = await getLatestCommitSha(octokit, repoUrl, branch)
                const fileShas = await getFileShas(octokit, repoUrl, branch, selectedFiles)

                // Update submission status to processing
                await supabase
                    .from('submissions')
                    .update({ status: 'processing' })
                    .eq('id', submissionId)

                // Get prompt config from source_meta if available
                const promptConfig = sourceMeta.llm_prompt_config || null;

                // Generate updated documentation with custom prompt if configured
                const system = buildSystemPrompt(promptConfig, true)

                const user =
                    `Project: ${submission.title || 'Documentation'}\n\n` +
                    `The following files have been updated:\n` +
                    filesForDoc
                        .map((f: { path: string; content: string }) => `--- FILE: ${f.path} ---\n${f.content}`)
                        .join('\n\n') +
                    `\n\nPlease update the documentation to reflect these changes.`

                // Use custom temperature if provided in prompt config
                const temperature = promptConfig?.temperature;
                const markdown = (await callGateway(
                    [
                        { role: 'system', content: system },
                        { role: 'user', content: user }
                    ],
                    model,
                    temperature
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

