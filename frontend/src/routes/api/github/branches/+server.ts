import type { RequestHandler } from '@sveltejs/kit';
import { GITHUB_TOKEN } from '$env/static/private';

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

/**
 * Fetch all branches for a GitHub repository
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({} as Record<string, unknown>));
		const repoUrl = String(body.repoUrl || '');

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

		// Fetch branches from GitHub API
		const headers: Record<string, string> = {
			accept: 'application/vnd.github+json',
			'x-github-api-version': '2022-11-28'
		};
		if (GITHUB_TOKEN) headers.authorization = `Bearer ${GITHUB_TOKEN}`;

		const url = `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`;
		const response = await fetch(url, { headers });

		if (!response.ok) {
			const text = await response.text().catch(() => '');
			throw new Error(`GitHub ${response.status}: ${text.slice(0, 200)}`);
		}

		const branches = await response.json();
		const branchNames = branches.map((b: { name: string }) => b.name).sort();

		return jsonResponse({ branches: branchNames }, 200);
	} catch (err: any) {
		return jsonResponse(
			{
				error: 'Failed to fetch branches',
				detail: err.message || String(err)
			},
			500
		);
	}
};

