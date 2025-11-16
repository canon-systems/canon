/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * - Generate a preview of updated documentation without saving
 * - Allows user to review changes before applying
 * - Supports custom model and prompt configuration
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
    VERCEL_AI_GATEWAY_URL,
    VERCEL_AI_GATEWAY_API_KEY,
    LLM_MODEL
} from '$env/static/private';
import { getRepoProvider } from '$lib/server/repos/providerFactory';
import { buildSystemPrompt } from '$lib/server/prompts/buildSystemPrompt';
import { getWorkspaceProvider } from '$lib/server/workspaces/workspaceFactory';
import type { WorkspaceInfo } from '$lib/server/workspaces/types';

function jsonResponse(data: unknown, status = 200) {
    return json(data, { status });
}

// Helper to call LLM
async function callGateway(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    model?: string,
    temperature?: number
) {
    if (!VERCEL_AI_GATEWAY_URL || !VERCEL_AI_GATEWAY_API_KEY) {
        throw new Error('Gateway env vars missing');
    }

    // Use provided model or fall back to env default
    const modelToUse = model || LLM_MODEL;
    // Use provided temperature or fall back to default 0.3
    const temperatureToUse = temperature !== undefined ? temperature : 0.3;

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
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
        throw new Error(j?.error?.message || j?.message || `LLM HTTP ${r.status}`);
    }
    return String(j?.choices?.[0]?.message?.content ?? '');
}

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
    try {
        const body = await request.json().catch(() => ({}));
        const { submissionId, model, promptConfig } = body as {
            submissionId: string;
            model?: string;
            promptConfig?: {
                personality?: string;
                style?: string;
                customInstructions?: string;
                temperature?: number;
            };
        };

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

        // Only handle repository-based submissions
        if (inputType !== 'github_repo' && inputType !== 'github_repo_directory') {
            return jsonResponse({ error: 'Preview generation only supported for repository-based submissions' }, 400);
        }

        const { repoUrl, branch, subdir } = sourceMeta;
        if (!repoUrl || !branch) {
            return jsonResponse({ error: 'Missing repoUrl or branch in source_meta' }, 400);
        }

        // Get repository provider
        const provider = getRepoProvider(repoUrl);
        if (!provider) {
            return jsonResponse({ error: `Unsupported repository provider for URL: ${repoUrl}` }, 400);
        }

        const repoInfo = provider.parseRepoUrl(repoUrl);
        if (!repoInfo) {
            return jsonResponse({ error: `Failed to parse repository URL: ${repoUrl}` }, 400);
        }

        // Get selected files
        const selectedFiles = submission.selected_files || [];
        if (selectedFiles.length === 0) {
            return jsonResponse({ error: 'No files selected for this submission' }, 400);
        }

        // Fetch latest file contents using provider
        const filesForDoc: Array<{ path: string; content: string }> = [];
        const MAX_PER_FILE = 200_000;

        for (const filePath of selectedFiles) {
            const content = await provider.fetchFileContent(repoInfo, branch, filePath);
            if (content) {
                const clipped = content.length > MAX_PER_FILE ? content.slice(0, MAX_PER_FILE) : content;
                filesForDoc.push({ path: filePath, content: clipped });
            }
        }

        if (filesForDoc.length === 0) {
            return jsonResponse({ error: 'Could not fetch any file contents' }, 500);
        }

        // Use provided prompt config or fall back to saved config
        const effectivePromptConfig = promptConfig || sourceMeta.llm_prompt_config || null;
        // Use provided model or fall back to saved model or default
        const effectiveModel = model || sourceMeta.model || LLM_MODEL;

        // Pull existing documentation from workspace if linked
        let existingWorkspaceContent = '';
        const workspaceInfo: WorkspaceInfo | null = sourceMeta.workspace || null;
        
        if (workspaceInfo && workspaceInfo.provider && workspaceInfo.resourceId) {
            try {
                const { data: { user } } = await safeGetSession();
                if (user) {
                    // Find workspace connection
                    const { data: connection } = await supabase
                        .from('oauth_connections')
                        .select('connection_id')
                        .eq('user_id', user.id)
                        .eq('provider', workspaceInfo.provider)
                        .eq('status', 'active')
                        .single();

                    if (connection) {
                        // Get workspace provider
                        const workspaceProvider = getWorkspaceProvider(workspaceInfo.provider);
                        if (workspaceProvider) {
                            // Pull content from workspace
                            const pulledContent = await workspaceProvider.pullContent(
                                workspaceInfo,
                                connection.connection_id
                            );
                            
                            if (pulledContent) {
                                existingWorkspaceContent = pulledContent.markdown || '';
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn(`Failed to pull from ${workspaceInfo.provider}, continuing without existing content:`, err);
            }
        }

        // Generate preview documentation
        const system = buildSystemPrompt(effectivePromptConfig, true);

        // Build user prompt with existing workspace content if available
        let userPrompt = `Project: ${submission.title || 'Documentation'}\n\n`;
        
        if (existingWorkspaceContent && workspaceInfo) {
            userPrompt += `EXISTING DOCUMENTATION (from ${workspaceInfo.provider}):\n${existingWorkspaceContent}\n\n`;
        }
        
        userPrompt += `The following files have been updated:\n` +
            filesForDoc
                .map((f: { path: string; content: string }) => `--- FILE: ${f.path} ---\n${f.content}`)
                .join('\n\n') +
            `\n\nPlease update the documentation to reflect these changes.`;
        
        if (existingWorkspaceContent) {
            userPrompt += ` Maintain the same structure and style as the existing documentation when possible.`;
        }

        // Use custom temperature if provided in prompt config
        const temperature = effectivePromptConfig?.temperature;
        const markdown = (await callGateway(
            [
                { role: 'system', content: system },
                { role: 'user', content: userPrompt }
            ],
            effectiveModel,
            temperature
        )).trim();

        // Return preview (NOT saved to database)
        return jsonResponse({
            success: true,
            markdown,
            model: effectiveModel,
            promptConfig: effectivePromptConfig
        });
    } catch (err) {
        return jsonResponse({ error: 'Preview generation failed', detail: String(err) }, 500);
    }
};

