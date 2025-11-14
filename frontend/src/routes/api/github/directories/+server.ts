import type { RequestHandler } from '@sveltejs/kit';
import { GITHUB_TOKEN } from '$env/static/private';

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

/**
 * Fetch all top-level directories for a GitHub repository
 */
async function fetchContents(owner: string, repo: string, branch: string, path: string) {
	const headers: Record<string, string> = {
		accept: 'application/vnd.github+json',
		'x-github-api-version': '2022-11-28'
	};
	if (GITHUB_TOKEN) headers.authorization = `Bearer ${GITHUB_TOKEN}`;

	const encodedPath = encodeURIComponent(path || '').replace(/%2F/g, '/');
	const encodedRef = encodeURIComponent(branch);
	const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodedRef}`;

	const response = await fetch(url, { headers });

	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw new Error(`GitHub ${response.status}: ${text.slice(0, 200)}`);
	}

	return response.json();
}

export const POST: RequestHandler = async ({ request }) => {
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

		// Fetch root directory contents
		const contents = await fetchContents(owner, repo, branch, '');

		if (!Array.isArray(contents)) {
			return jsonResponse({ directories: [] }, 200);
		}

		// Filter to only directories and extract names
		const directories = contents
			.filter((item: { type: string }) => item.type === 'dir')
			.map((item: { name: string }) => item.name)
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

