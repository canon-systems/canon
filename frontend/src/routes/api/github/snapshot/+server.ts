/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * - Get code snapshot (commit SHA and file SHAs) for a GitHub repo/branch
 * - Used when creating documents to track the state of code
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getLatestCommitSha, getFileShas } from '$lib/server/githubTracking';

function jsonResponse(data: unknown, status = 200) {
    return json(data, { status });
}

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json().catch(() => ({}));
        const { repoUrl, branch, selectedFiles } = body;

        if (!repoUrl || !branch) {
            return jsonResponse({ error: 'repoUrl and branch are required' }, 400);
        }

        if (!Array.isArray(selectedFiles) || selectedFiles.length === 0) {
            return jsonResponse({ error: 'selectedFiles array is required' }, 400);
        }

        // Get commit SHA
        const commitSha = await getLatestCommitSha(repoUrl, branch);
        if (!commitSha) {
            return jsonResponse({ error: 'Could not get commit SHA' }, 500);
        }

        // Get file SHAs
        const fileShas = await getFileShas(repoUrl, branch, selectedFiles);

        return jsonResponse({
            commitSha,
            fileShas
        });
    } catch (err) {
        return jsonResponse({ error: 'Snapshot failed', detail: String(err) }, 500);
    }
};

