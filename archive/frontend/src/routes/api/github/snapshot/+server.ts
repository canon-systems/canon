/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 * - Get code snapshot (commit SHA and file SHAs) for a GitHub repo/branch
 * - Used when creating documents to track the state of code
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getUserOctokit } from '$lib/server/github/getUserOctokit';
import { parseRepoUrl } from '$lib/server/github/github';

function jsonResponse(data: unknown, status = 200) {
    return json(data, { status });
}

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        console.log('[snapshot endpoint] ===== REQUEST RECEIVED =====');
        
        const body = await request.json().catch((parseError) => {
            console.error('[snapshot endpoint] Failed to parse request body:', parseError);
            return {};
        });
        
        const { repoUrl, branch, selectedFiles } = body;

        console.log('[snapshot endpoint] Request received:', {
            repoUrl,
            branch,
            selectedFilesCount: Array.isArray(selectedFiles) ? selectedFiles.length : 'not an array',
            selectedFilesType: typeof selectedFiles,
            hasBody: !!body
        });

        if (!repoUrl || !branch) {
            const errorMsg = 'Missing required params';
            console.error(`[snapshot endpoint] ${errorMsg}:`, { repoUrl: !!repoUrl, branch: !!branch });
            return jsonResponse({ error: 'repoUrl and branch are required' }, 400);
        }

        if (!Array.isArray(selectedFiles) || selectedFiles.length === 0) {
            const errorMsg = 'Invalid selectedFiles';
            console.error(`[snapshot endpoint] ${errorMsg}:`, {
                isArray: Array.isArray(selectedFiles),
                length: Array.isArray(selectedFiles) ? selectedFiles.length : 'N/A',
                type: typeof selectedFiles
            });
            return jsonResponse({ error: 'selectedFiles array is required' }, 400);
        }

        // Get user's GitHub connection (or anonymous if not connected)
        const { user } = await locals.safeGetSession();
        const octokit = await getUserOctokit(locals.supabase, user?.id || null);
        console.log('[snapshot endpoint] Got Octokit instance (authenticated:', !!user?.id, ')');

        // Parse owner/repo from URL
        const parsed = parseRepoUrl(repoUrl);
        if (!parsed || !parsed.owner || !parsed.repo) {
            console.error('[snapshot endpoint] Failed to parse repo URL:', repoUrl);
            return jsonResponse({ error: 'Invalid GitHub URL' }, 400);
        }

        // Get commit SHA using Octokit
        console.log('[snapshot endpoint] Fetching commit SHA for', repoUrl, 'branch', branch);
        let commitSha: string | null;
        try {
            const { data: branchData } = await octokit.repos.getBranch({
                owner: parsed.owner,
                repo: parsed.repo,
                branch
            });
            commitSha = branchData.commit.sha;
        } catch (e) {
            console.error('[snapshot endpoint] Failed to get branch:', e);
            console.error('[snapshot endpoint] Error details:', {
                message: e instanceof Error ? e.message : String(e),
                stack: e instanceof Error ? e.stack : undefined
            });
            return jsonResponse({ error: 'Failed to get commit SHA', detail: String(e) }, 500);
        }
        
        if (!commitSha) {
            console.error('[snapshot endpoint] Failed to get commit SHA (returned null)');
            return jsonResponse({ error: 'Could not get commit SHA' }, 500);
        }
        console.log('[snapshot endpoint] Got commit SHA:', commitSha);

        // Get file SHAs using Octokit
        console.log('[snapshot endpoint] Fetching file SHAs for', selectedFiles.length, 'files');
        const fileShas: Record<string, string | null> = {};
        
        for (const filePath of selectedFiles) {
            try {
                const { data: fileData } = await octokit.repos.getContent({
                    owner: parsed.owner,
                    repo: parsed.repo,
                    path: filePath,
                    ref: commitSha
                });
                
                if (fileData && !Array.isArray(fileData) && fileData.type === 'file' && 'sha' in fileData) {
                    fileShas[filePath] = fileData.sha;
                } else {
                    console.warn(`[snapshot endpoint] File ${filePath} is not a file or missing SHA`);
                    fileShas[filePath] = null;
                }
            } catch (e) {
                console.error(`[snapshot endpoint] Failed to get SHA for ${filePath}:`, e);
                fileShas[filePath] = null;
            }
        }
        
        console.log('[snapshot endpoint] Got file SHAs:', {
            totalRequested: selectedFiles.length,
            totalReceived: Object.keys(fileShas).length,
            filesWithShas: Object.values(fileShas).filter(s => s !== null).length,
            isEmpty: Object.keys(fileShas).length === 0
        });

        // Check if fileShas is empty - this would cause the client to reject it
        if (Object.keys(fileShas).length === 0) {
            console.warn('[snapshot endpoint] WARNING: fileShas is empty - this will cause client to reject snapshot');
        }

        console.log('[snapshot endpoint] ===== SUCCESS - RETURNING RESPONSE =====');
        return jsonResponse({
            commitSha,
            fileShas
        });
    } catch (err) {
        console.error('[snapshot endpoint] ===== UNEXPECTED ERROR =====');
        console.error('[snapshot endpoint] Error type:', err instanceof Error ? err.constructor.name : typeof err);
        console.error('[snapshot endpoint] Error message:', err instanceof Error ? err.message : String(err));
        console.error('[snapshot endpoint] Error stack:', err instanceof Error ? err.stack : 'No stack trace');
        console.error('[snapshot endpoint] Full error object:', err);
        return jsonResponse({ error: 'Snapshot failed', detail: String(err) }, 500);
    }
};

