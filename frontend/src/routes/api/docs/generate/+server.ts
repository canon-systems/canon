// Purpose: take { projectName, files: [{path, content}] } and return { markdown } using your Vercel AI Gateway.

import type { RequestHandler } from '@sveltejs/kit';
import {
    VERCEL_AI_GATEWAY_URL,
    VERCEL_AI_GATEWAY_API_KEY,
    LLM_MODEL
} from '$env/static/private';
import { buildSystemPrompt } from '$lib/server/prompts/buildSystemPrompt';

// --- utilities ---
function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

// Very small OpenAI-compatible caller that targets your Gateway.
// Returns assistant text (or throws on HTTP error).
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
            // Extra header is safe; some gateways prefer Bearer only.
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

// --- the API handler ---
export const POST: RequestHandler = async ({ request }) => {
    try {
        // Expect: { projectName, files: [{ path, content }], model?: string, promptConfig?: PromptConfig }
        const body = await request.json().catch(() => ({}));
        const projectName = String(body.projectName || 'Project');
        const files = Array.isArray(body.files) ? body.files : [];
        const model = body.model ? String(body.model) : undefined;
        const promptConfig = body.promptConfig || null;

        if (!files.length) {
            return json({ error: 'No files provided' }, 400);
        }

        // Build a compact, LLM-friendly prompt (kept simple and robust).
        // We avoid sending massive blobs by trimming very long files.
        const MAX_PER_FILE = 200_000; // safety cap
        const clipped = files.map((f: any) => {
            const path = String(f?.path || 'unknown');
            const raw = String(f?.content || '');
            const content = raw.length > MAX_PER_FILE ? raw.slice(0, MAX_PER_FILE) : raw;
            return { path, content };
        });

        // Build system prompt from config
        const system = buildSystemPrompt(promptConfig, false);

        // Concise, explicit user content with file separators
        const user =
            `Project: ${projectName}\n\n` +
            `Files (${clipped.length}):\n` +
            clipped
                .map((f: { path: string; content: string }) => `--- FILE: ${f.path} ---\n${f.content}`)
                .join('\n\n');

        // Call the Gateway with custom temperature if provided
        const temperature = promptConfig?.temperature;
        const markdown = (await callGateway(
            [
                { role: 'system', content: system },
                { role: 'user', content: user }
            ],
            model,
            temperature
        )).trim();

        return json({ markdown }, 200);
    } catch (err) {
        return json({ error: 'Generator failed', detail: String(err) }, 500);
    }
};
