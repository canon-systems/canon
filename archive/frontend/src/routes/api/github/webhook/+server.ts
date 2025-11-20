/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * - GitHub webhook endpoint to receive push events
 * - Automatically marks affected submissions as outdated when code changes
 * - Uses provider abstraction for future multi-provider support
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getRepoProvider } from '$lib/server/repos/providerFactory';
import crypto from 'crypto';

function jsonResponse(data: unknown, status = 200) {
    return json(data, { status });
}

/**
 * Verify GitHub webhook signature
 */
function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;

    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export const POST: RequestHandler = async ({ request, url, locals: { supabase } }) => {
    try {
        // Get raw body for signature verification
        const rawBody = await request.text();
        const payload = JSON.parse(rawBody);
        const event = request.headers.get('x-github-event');

        // Verify webhook signature if secret is configured
        const webhookSecret = env.GITHUB_WEBHOOK_SECRET;
        if (webhookSecret) {
            const signature = request.headers.get('x-hub-signature-256');
            if (!signature || !verifyGitHubSignature(rawBody, signature, webhookSecret)) {
                return jsonResponse({ error: 'Invalid signature' }, 401);
            }
        }

        // Only handle push events
        if (event !== 'push') {
            return jsonResponse({ message: 'Event ignored', event });
        }

        // Use provider abstraction to handle webhook
        const provider = getRepoProvider(payload.repository?.html_url || '');
        if (!provider) {
            return jsonResponse({ error: 'Unsupported repository provider' }, 400);
        }

        const webhookResult = provider.handleWebhook(payload);
        if (!webhookResult) {
            return jsonResponse({ error: 'Failed to process webhook payload' }, 400);
        }

        const { repoUrl, branch, changedFiles: webhookChangedFiles, latestCommitSha } = webhookResult;

        // Find affected submissions for this repo/branch
        const { data: submissions } = await supabase
            .from('submissions')
            .select('id, source_meta, selected_files, code_snapshot')
            .in('input_type', ['github_repo', 'github_repo_directory'])
            .eq('status', 'completed');

        if (!submissions || submissions.length === 0) {
            return jsonResponse({ message: 'No submissions to check' });
        }

        // Filter submissions for this repo/branch
        const affected = submissions.filter((sub: any) => {
            const meta = sub.source_meta;
            return meta?.repoUrl === repoUrl && meta?.branch === branch;
        });

        if (affected.length === 0) {
            return jsonResponse({ message: 'No affected documents found' });
        }

        // Mark submissions as outdated if their tracked files changed
        const changedFilesSet = new Set(webhookChangedFiles);
        const markedOutdated: string[] = [];

        for (const sub of affected) {
            const selectedFiles = sub.selected_files || [];
            const hasChangedFile = selectedFiles.some((file: string) => changedFilesSet.has(file));
            
            // Also check if branch commit changed
            const codeSnapshot = sub.code_snapshot || {};
            const storedCommitSha = codeSnapshot.commitSha;

            // Mark as outdated if:
            // 1. Any tracked file was changed, OR
            // 2. Commit SHA changed (even if we don't know which files)
            if (hasChangedFile || (storedCommitSha && storedCommitSha !== latestCommitSha)) {
                await supabase
                    .from('submissions')
                    .update({
                        is_outdated: true,
                        last_checked_at: new Date().toISOString()
                    })
                    .eq('id', sub.id);

                markedOutdated.push(sub.id);
            }
        }

        return jsonResponse({
            message: 'Webhook processed',
            repoUrl,
            branch,
            affectedCount: affected.length,
            markedOutdatedCount: markedOutdated.length,
            markedOutdated
        });
    } catch (err) {
        console.error('Webhook processing error:', err);
        return jsonResponse({ error: 'Webhook processing failed', detail: String(err) }, 500);
    }
};

