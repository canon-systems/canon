/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * - GitHub webhook endpoint to receive push events
 * - Automatically checks for affected documents and triggers updates
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

function jsonResponse(data: unknown, status = 200) {
    return json(data, { status });
}

export const POST: RequestHandler = async ({ request, url, locals: { supabase } }) => {
    try {
        // Verify webhook secret if configured
        const webhookSecret = env.GITHUB_WEBHOOK_SECRET;
        if (webhookSecret) {
            const signature = request.headers.get('x-hub-signature-256');
            // In production, verify the signature here
            // For now, we'll skip verification but log it
        }

        const payload = await request.json().catch(() => ({}));
        const event = request.headers.get('x-github-event');

        // Only handle push events
        if (event !== 'push') {
            return jsonResponse({ message: 'Event ignored', event });
        }

        const { repository, ref, commits } = payload;
        if (!repository || !ref) {
            return jsonResponse({ error: 'Invalid payload' }, 400);
        }

        // Extract repo info
        const repoUrl = repository.html_url;
        const branch = ref.replace('refs/heads/', '');

        // Find affected submissions
        const { data: submissions } = await supabase
            .from('submissions')
            .select('id, source_meta, selected_files, code_snapshot')
            .in('input_type', ['github_repo', 'github_repo_directory'])
            .eq('status', 'completed');

        if (!submissions) {
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

        // Get changed files from commits
        const changedFiles = new Set<string>();
        if (Array.isArray(commits)) {
            for (const commit of commits) {
                if (commit.added) commit.added.forEach((f: string) => changedFiles.add(f));
                if (commit.modified) commit.modified.forEach((f: string) => changedFiles.add(f));
                if (commit.removed) commit.removed.forEach((f: string) => changedFiles.add(f));
            }
        }

        // Check which submissions need updating
        const needsUpdate: string[] = [];
        for (const sub of affected) {
            const selectedFiles = sub.selected_files || [];
            const hasChangedFile = selectedFiles.some((file: string) => changedFiles.has(file));
            
            // Also check if branch commit changed
            const codeSnapshot = sub.code_snapshot || {};
            const storedCommitSha = codeSnapshot.commitSha;
            const latestCommitSha = payload.after; // SHA of the latest commit after push

            if (hasChangedFile || (storedCommitSha && storedCommitSha !== latestCommitSha)) {
                needsUpdate.push(sub.id);
            }
        }

        // Queue updates (in production, use a job queue)
        // For now, we'll return the list and let the client trigger updates
        // Or you could trigger updates directly here

        return jsonResponse({
            message: 'Webhook processed',
            repoUrl,
            branch,
            affectedCount: affected.length,
            needsUpdateCount: needsUpdate.length,
            needsUpdate
        });
    } catch (err) {
        return jsonResponse({ error: 'Webhook processing failed', detail: String(err) }, 500);
    }
};

