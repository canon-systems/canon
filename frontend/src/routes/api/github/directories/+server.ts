import type { RequestHandler } from '@sveltejs/kit';
import { getUserOctokit } from '$lib/server/github/getUserOctokit';

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = await request.json().catch(() => ({} as Record<string, unknown>));
		const repoUrl = String(body.repoUrl || '');
		const branch = String(body.branch || 'main');

		if (!repoUrl.includes('github.com')) {
			return jsonResponse({ error: 'repoUrl must be a GitHub URL' }, 400);
		}

		// Parse owner/repo from URL
		const noProto = repoUrl.replace(/^https?:\/\//, '');
		const parts = noProto.split('/').filter(Boolean);
		const owner = parts[1];
		const repo = parts[2]?.replace(/\.git$/, '');

		if (!owner || !repo) {
			return jsonResponse({ error: 'repoUrl missing owner or repo' }, 400);
		}

		// Get user's GitHub connection (or anonymous if not connected)
		const { user } = await locals.safeGetSession();
		const octokit = await getUserOctokit(locals.supabase, user?.id || null);

		// Fetch root directory contents
		const { data: contents } = await octokit.repos.getContent({
			owner,
			repo,
			path: '',
			ref: branch
		});

		if (!Array.isArray(contents)) {
			return jsonResponse({ directories: [] }, 200);
		}

		// Filter to only directories and extract names
		const directories = contents
			.filter((item) => item.type === 'dir')
			.map((item) => item.name)
			.sort();

		return jsonResponse({ directories }, 200);
	} catch (err: any) {
		return jsonResponse(
			{
				error: 'Failed to fetch directories',
				detail: err.message || String(err)
			},
			500
		);
	}
};

