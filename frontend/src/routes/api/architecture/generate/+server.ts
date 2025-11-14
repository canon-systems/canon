import type { RequestHandler } from '@sveltejs/kit';
import { GITHUB_TOKEN } from '$env/static/private';
import JSZip from 'jszip';
import { detectTools } from '$lib/server/architecture/detectTools';
import { generateMarkdownDoc } from '$lib/server/architecture/generateDiagram';

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

/**
 * Fetch file content from GitHub
 */
async function fetchFileContent(
	owner: string,
	repo: string,
	branch: string,
	path: string
): Promise<string | null> {
	const headers: Record<string, string> = {
		accept: 'application/vnd.github+json',
		'x-github-api-version': '2022-11-28'
	};
	if (GITHUB_TOKEN) headers.authorization = `Bearer ${GITHUB_TOKEN}`;

	const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
	const encodedRef = encodeURIComponent(branch);
	const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodedRef}`;

	try {
		const response = await fetch(url, { headers });
		if (!response.ok) return null;

		const data = await response.json();
		if (data.type === 'file' && data.content) {
			// GitHub returns base64 encoded content
			return Buffer.from(data.content, 'base64').toString('utf-8');
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * List all files in a GitHub repo (recursively)
 */
async function listAllFiles(
	owner: string,
	repo: string,
	branch: string,
	rootPath: string
): Promise<Array<{ path: string; size: number }>> {
	const stack: string[] = [rootPath || ''];
	const files: Array<{ path: string; size: number }> = [];

	const headers: Record<string, string> = {
		accept: 'application/vnd.github+json',
		'x-github-api-version': '2022-11-28'
	};
	if (GITHUB_TOKEN) headers.authorization = `Bearer ${GITHUB_TOKEN}`;

	while (stack.length) {
		const current = stack.pop()!;
		try {
			const encodedPath = encodeURIComponent(current || '').replace(/%2F/g, '/');
			const encodedRef = encodeURIComponent(branch);
			const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodedRef}`;

			const response = await fetch(url, { headers });
			if (!response.ok) continue;

			const node = await response.json();

			if (Array.isArray(node)) {
				for (const item of node) {
					const itemPath = item.path as string;
					if (item.type === 'file') {
						files.push({ path: itemPath, size: Number(item.size || 0) });
					} else if (item.type === 'dir') {
						stack.push(itemPath);
					}
				}
			} else if (node && node.type === 'file') {
				files.push({ path: node.path as string, size: Number(node.size || 0) });
			}
		} catch {
			// Skip errors and continue
		}
	}

	return files;
}

/**
 * Fetch files from GitHub repo
 */
async function fetchFilesFromGitHub(
	repoUrl: string,
	branch: string,
	subdir?: string
): Promise<Array<{ path: string; content: string }>> {
	// Parse owner/repo from URL
	const noProto = repoUrl.replace(/^https?:\/\//, '');
	const parts = noProto.split('/').filter(Boolean);
	const owner = parts[1];
	const repo = parts[2]?.replace(/\.git$/, '');

	if (!owner || !repo) {
		throw new Error('Invalid GitHub URL');
	}

	// Clean subdir (trim leading/trailing slashes)
	const rootPath = subdir ? subdir.replace(/^\/+|\/+$/g, '') : '';

	// List all files (limit to reasonable files for analysis)
	const allFiles = await listAllFiles(owner, repo, branch, rootPath);
	
	// Filter to important files for tool detection
	const importantPatterns = [
		/package\.json$/i,
		/package-lock\.json$/i,
		/yarn\.lock$/i,
		/pnpm-lock\.yaml$/i,
		/requirements\.txt$/i,
		/Pipfile$/i,
		/poetry\.lock$/i,
		/docker-compose\.yml$/i,
		/Dockerfile$/i,
		/vercel\.json$/i,
		/\.env$/i,
		/\.env\.example$/i,
		/\.(ts|js|tsx|jsx|py|java|go|rs|svelte)$/i
	];

	const relevantFiles = allFiles.filter((file) =>
		importantPatterns.some((pattern) => pattern.test(file.path))
	);

	// Limit to first 100 files to avoid rate limits
	const filesToFetch = relevantFiles.slice(0, 100);

	// Fetch content for each file
	const filesWithContent: Array<{ path: string; content: string }> = [];
	for (const file of filesToFetch) {
		const content = await fetchFileContent(owner, repo, branch, file.path);
		if (content) {
			filesWithContent.push({ path: file.path, content });
		}
	}

	return filesWithContent;
}

/**
 * Extract files from ZIP
 */
async function extractFilesFromZip(zipFile: File): Promise<Array<{ path: string; content: string }>> {
	const buffer = Buffer.from(await zipFile.arrayBuffer());
	const zip = await JSZip.loadAsync(buffer);

	const files: Array<{ path: string; content: string }> = [];

	// Only include code/config files
	const ALLOWED_PATTERNS = [
		/package\.json$/i,
		/package-lock\.json$/i,
		/yarn\.lock$/i,
		/requirements\.txt$/i,
		/docker-compose\.yml$/i,
		/Dockerfile$/i,
		/vercel\.json$/i,
		/\.env$/i,
		/\.(ts|js|tsx|jsx|py|java|go|rs|svelte|json|yaml|yml)$/i
	];

	for (const entry of Object.values(zip.files)) {
		if (entry.dir) continue;
		if (entry.name.startsWith('__MACOSX/') || entry.name.endsWith('.DS_Store')) continue;

		if (ALLOWED_PATTERNS.some((pattern) => pattern.test(entry.name))) {
			try {
				const content = await entry.async('string');
				files.push({ path: entry.name, content });
			} catch {
				// Skip files that can't be read as text
			}
		}
	}

	return files;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();
		const method = formData.get('method');

		let files: Array<{ path: string; content: string }> = [];

		if (method === 'github') {
			const repoUrl = formData.get('repoUrl')?.toString();
			const branch = formData.get('branch')?.toString() || 'main';
			const subdir = formData.get('subdir')?.toString();

			if (!repoUrl) {
				return jsonResponse({ error: 'Missing repoUrl' }, 400);
			}

			files = await fetchFilesFromGitHub(repoUrl, branch, subdir);
		} else if (method === 'zip') {
			const zipFile = formData.get('zipFile');
			if (!(zipFile instanceof File)) {
				return jsonResponse({ error: 'Missing zipFile' }, 400);
			}

			files = await extractFilesFromZip(zipFile);
		} else {
			return jsonResponse({ error: 'Invalid method. Use "github" or "zip"' }, 400);
		}

		if (files.length === 0) {
			return jsonResponse({ error: 'No relevant files found in codebase' }, 400);
		}

		// Run tool detection
		const detectionResult = detectTools(files);

		// Generate diagram
		const diagramMarkdown = generateMarkdownDoc(detectionResult);

		return jsonResponse({
			diagram: diagramMarkdown,
			tools: detectionResult,
			fileCount: files.length
		});
	} catch (err: any) {
		console.error('Architecture generation error:', err);
		return jsonResponse(
			{
				error: 'Failed to generate architecture diagram',
				detail: err.message || String(err)
			},
			500
		);
	}
};

