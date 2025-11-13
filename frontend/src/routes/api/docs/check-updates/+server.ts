/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * - Check for code changes in GitHub repositories
 * - Find documents that depend on changed code
 * - Returns list of submissions that need updating
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getLatestCommitSha, checkForChanges } from '$lib/server/githubTracking';

function jsonResponse(data: unknown, status = 200) {
    return json(data, { status });
}

export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
    try {
        const body = await request.json().catch(() => ({}));
        const { repoUrl, branch } = body;

        if (!repoUrl || !branch) {
            return jsonResponse({ error: 'repoUrl and branch are required' }, 400);
        }

        // Find all submissions that use this repo/branch
        const { data: submissions, error } = await supabase
            .from('submissions')
            .select('id, source_meta, selected_files, code_snapshot')
            .in('input_type', ['github_repo', 'github_repo_directory'])
            .eq('status', 'completed');

        if (error) {
            return jsonResponse({ error: error.message }, 500);
        }

        if (!submissions || submissions.length === 0) {
            return jsonResponse({ needsUpdate: [], message: 'No submissions found for this repo' });
        }

        // Filter submissions that match this repo/branch
        const relevantSubmissions = submissions.filter((sub: any) => {
            const meta = sub.source_meta;
            if (!meta) return false;
            return meta.repoUrl === repoUrl && meta.branch === branch;
        });

        if (relevantSubmissions.length === 0) {
            return jsonResponse({ needsUpdate: [], message: 'No submissions match this repo/branch' });
        }

        // Check each submission for changes
        const needsUpdate: Array<{ id: string; changedFiles: string[] }> = [];
        const latestCommitSha = await getLatestCommitSha(repoUrl, branch);

        for (const sub of relevantSubmissions) {
            const codeSnapshot = sub.code_snapshot || {};
            const storedCommitSha = codeSnapshot.commitSha;
            const storedFileShas = codeSnapshot.fileShas || {};
            const selectedFiles = sub.selected_files || [];

            // Check if branch commit changed
            if (storedCommitSha && latestCommitSha && storedCommitSha !== latestCommitSha) {
                // Branch moved, check which files changed
                const changeResult = await checkForChanges(
                    repoUrl,
                    branch,
                    selectedFiles,
                    storedFileShas
                );

                if (changeResult.changed) {
                    needsUpdate.push({
                        id: sub.id,
                        changedFiles: changeResult.changedFiles
                    });
                }
            } else if (!storedCommitSha) {
                // No stored snapshot, mark for update
                needsUpdate.push({
                    id: sub.id,
                    changedFiles: selectedFiles
                });
            }
        }

        return jsonResponse({
            needsUpdate,
            latestCommitSha,
            message: `${needsUpdate.length} document(s) need updating`
        });
    } catch (err) {
        return jsonResponse({ error: 'Check failed', detail: String(err) }, 500);
    }
};

