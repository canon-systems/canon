/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * - Update a document when its source code has changed
 * - Fetches latest code, regenerates documentation with LLM
 * - Updates the submission record with new content and snapshot
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import {
    VERCEL_AI_GATEWAY_URL,
    VERCEL_AI_GATEWAY_API_KEY,
    LLM_MODEL,
    GITHUB_TOKEN
} from '$env/static/private';
import { getFileShas, getLatestCommitSha } from '$lib/server/github/githubTracking';
import { parseRepoUrl } from '$lib/server/github/github';

function jsonResponse(data: unknown, status = 200) {
    return json(data, { status });
}

// Helper to call LLM
async function callGateway(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    model?: string
) {
    if (!VERCEL_AI_GATEWAY_URL || !VERCEL_AI_GATEWAY_API_KEY) {
        throw new Error('Gateway env vars missing');
    }

    // Use provided model or fall back to env default
    const modelToUse = model || LLM_MODEL;

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
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
        throw new Error(j?.error?.message || j?.message || `LLM HTTP ${r.status}`);
    }
    return String(j?.choices?.[0]?.message?.content ?? '');
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
        );

        if (!res.ok) return null;
        const data = (await res.json()) as { content: string; encoding: string };

        if (data.encoding === 'base64') {
            return Buffer.from(data.content, 'base64').toString('utf-8');
        }
        return data.content;
    } catch {
        return null;
    }
}

export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
    let submissionId: string | undefined;
    try {
        const body = await request.json().catch(() => ({}));
        submissionId = body.submissionId;

        if (!submissionId) {
            return jsonResponse({ error: 'submissionId is required' }, 400);
        }

        // Get the submission
        const { data: submission, error: subError } = await supabase
            .from('submissions')
            .select('*')
            .eq('id', submissionId)
            .single();

        if (subError || !submission) {
            return jsonResponse({ error: 'Submission not found' }, 404);
        }

        const sourceMeta = submission.source_meta || {};
        const inputType = submission.input_type;

        // Only handle GitHub repos for now
        if (inputType !== 'github_repo' && inputType !== 'github_repo_directory') {
            return jsonResponse({ error: 'Auto-update only supported for GitHub repos' }, 400);
        }

        const { repoUrl, branch, subdir, model } = sourceMeta;
        if (!repoUrl || !branch) {
            return jsonResponse({ error: 'Missing repoUrl or branch in source_meta' }, 400);
        }

        const parsed = parseRepoUrl(repoUrl);
        if (!parsed) {
            return jsonResponse({ error: 'Invalid repo URL' }, 400);
        }

        // Get selected files
        const selectedFiles = submission.selected_files || [];
        if (selectedFiles.length === 0) {
            return jsonResponse({ error: 'No files selected for this submission' }, 400);
        }

        // Fetch latest file contents
        const filesForDoc: Array<{ path: string; content: string }> = [];
        const MAX_PER_FILE = 200_000;

        for (const filePath of selectedFiles) {
            const content = await fetchFileContent(parsed.owner, parsed.repo, branch, filePath);
            if (content) {
                const clipped = content.length > MAX_PER_FILE ? content.slice(0, MAX_PER_FILE) : content;
                filesForDoc.push({ path: filePath, content: clipped });
            }
        }

        if (filesForDoc.length === 0) {
            return jsonResponse({ error: 'Could not fetch any file contents' }, 500);
        }

        // Get current commit SHA and file SHAs for snapshot
        const latestCommitSha = await getLatestCommitSha(repoUrl, branch);
        const fileShas = await getFileShas(repoUrl, branch, selectedFiles);

        // Update submission status
        await supabase
            .from('submissions')
            .update({ status: 'processing' })
            .eq('id', submissionId);

        // Generate updated documentation
        const system = [
            'You are a senior technical writer.',
            'You are updating existing documentation. The source code has changed, and you need to update the documentation accordingly.',
            'Maintain the same structure and style as much as possible, but reflect all code changes accurately.',
            'Include: overview, key components, data flow, API/CLI usage (if any), setup/run, and limitations.',
            'When helpful, include short code snippets or pseudo-diagrams.',
            'Use headings, subheadings, and bullet points. No HTML.'
        ].join(' ');

        const user =
            `Project: ${submission.title || 'Documentation'}\n\n` +
            `The following files have been updated:\n` +
            filesForDoc
                .map((f: { path: string; content: string }) => `--- FILE: ${f.path} ---\n${f.content}`)
                .join('\n\n') +
            `\n\nPlease update the documentation to reflect these changes.`;

        const markdown = (await callGateway(
            [
                { role: 'system', content: system },
                { role: 'user', content: user }
            ],
            model
        )).trim();

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
                }
            })
            .eq('id', submissionId);

        if (updateError) {
            throw new Error(updateError.message);
        }

        return jsonResponse({
            success: true,
            submissionId,
            message: 'Documentation updated successfully'
        });
    } catch (err) {
        // Mark as failed if we have a submission ID
        if (submissionId) {
            try {
                await supabase
                    .from('submissions')
                    .update({
                        status: 'failed',
                        error_message: String(err).slice(0, 500)
                    })
                    .eq('id', submissionId);
            } catch {
                // Ignore errors in error handler
            }
        }

        return jsonResponse({ error: 'Update failed', detail: String(err) }, 500);
    }
};

