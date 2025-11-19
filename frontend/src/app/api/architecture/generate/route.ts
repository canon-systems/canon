import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { detectTools } from '@/lib/server/architecture/detectTools';
import { generateMarkdownDoc } from '@/lib/server/architecture/generateDiagram';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import {
  saveArchitectureDiagram,
  getArchitectureDiagramsByRepo,
  trackDiagramFiles,
} from '@/lib/server/architecture/persistence';
import { createDiagramVersion } from '@/lib/server/architecture/versions';
import { detectRepoProvider } from '@/lib/utils/repoUrls';

/**
 * Fetch file content from GitHub using Octokit
 */
async function fetchFileContent(
	octokit: Awaited<ReturnType<typeof getUserOctokit>>,
	owner: string,
	repo: string,
	branch: string,
	path: string
): Promise<string | null> {
	try {
		const { data } = await octokit.repos.getContent({
			owner,
			repo,
			path,
			ref: branch
		});

		if (!Array.isArray(data) && data.type === 'file' && 'content' in data && typeof data.content === 'string') {
			// GitHub returns base64 encoded content
			return Buffer.from(data.content, 'base64').toString('utf-8');
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * List all files in a GitHub repo (recursively) using Octokit
 */
async function listAllFiles(
	octokit: Awaited<ReturnType<typeof getUserOctokit>>,
	owner: string,
	repo: string,
	branch: string,
	rootPath: string
): Promise<Array<{ path: string; size: number }>> {
	const stack: string[] = [rootPath || ''];
	const files: Array<{ path: string; size: number }> = [];

	while (stack.length) {
		const current = stack.pop()!;
		try {
			const { data } = await octokit.repos.getContent({
				owner,
				repo,
				path: current || '',
				ref: branch
			});

			if (Array.isArray(data)) {
				for (const item of data) {
					if (item.type === 'file') {
						files.push({ path: item.path, size: Number(item.size || 0) });
					} else if (item.type === 'dir') {
						stack.push(item.path);
					}
				}
			} else if (data && data.type === 'file') {
				files.push({ path: data.path, size: Number(data.size || 0) });
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
	octokit: Awaited<ReturnType<typeof getUserOctokit>>,
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
	const allFiles = await listAllFiles(octokit, owner, repo, branch, rootPath);
	
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
		const content = await fetchFileContent(octokit, owner, repo, branch, file.path);
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

/**
 * GET: Retrieve existing diagrams for a repo
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const repoUrl = searchParams.get('repoUrl');
		const branch = searchParams.get('branch') || 'main';
		const subdir = searchParams.get('subdir');

		if (!repoUrl) {
			return NextResponse.json({ error: 'Missing repoUrl parameter' }, { status: 400 });
		}

		const { user } = await getSession();
		if (!user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const supabase = await createClient();
		const diagrams = await getArchitectureDiagramsByRepo(
			supabase,
			user.id,
			repoUrl,
			branch,
			subdir || null
		);

		return NextResponse.json({ diagrams });
	} catch (err: any) {
		console.error('Error fetching diagrams:', err);
		return NextResponse.json(
			{
				error: 'Failed to fetch diagrams',
				detail: err.message || String(err)
			},
			{ status: 500 }
		);
	}
}

/**
 * POST: Generate and optionally save architecture diagram
 */
export async function POST(request: NextRequest) {
	try {
		const formData = await request.formData();
		const method = formData.get('method');
		const saveDiagram = formData.get('saveDiagram') === 'true';
		const title = formData.get('title')?.toString() || 'Untitled Diagram';
		const description = formData.get('description')?.toString() || null;

		let files: Array<{ path: string; content: string }> = [];
		let repoUrl: string | null = null;
		let branch: string = 'main';
		let subdir: string | null = null;
		let codeSnapshot: {
			commitSha?: string;
			fileShas?: Record<string, string | null>;
			createdAt?: string;
		} | null = null;
		let lastCommitSha: string | null = null;

		if (method === 'github') {
			repoUrl = formData.get('repoUrl')?.toString() || null;
			branch = formData.get('branch')?.toString() || 'main';
			subdir = formData.get('subdir')?.toString() || null;

			if (!repoUrl) {
				return NextResponse.json({ error: 'Missing repoUrl' }, { status: 400 });
			}

			const { user } = await getSession();
			if (!user && saveDiagram) {
				return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
			}

			const supabase = await createClient();
			const octokit = await getUserOctokit(supabase, user?.id || null);

			files = await fetchFilesFromGitHub(octokit, repoUrl, branch, subdir || undefined);

			// Get code snapshot for GitHub repos
			if (saveDiagram && repoUrl) {
				try {
					const parsed = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\.git|$|\/)/);
					if (parsed) {
						const owner = parsed[1];
						const repo = parsed[2].replace(/\.git$/, '');

						// Get commit SHA
						const { data: branchData } = await octokit.repos.getBranch({
							owner,
							repo,
							branch,
						});
						lastCommitSha = branchData.commit.sha;

						// Get file SHAs for relevant files
						const fileShas: Record<string, string | null> = {};
						for (const file of files) {
							try {
								const { data: fileData } = await octokit.repos.getContent({
									owner,
									repo,
									path: file.path,
									ref: lastCommitSha,
								});
								if (
									fileData &&
									!Array.isArray(fileData) &&
									fileData.type === 'file' &&
									'sha' in fileData
								) {
									fileShas[file.path] = fileData.sha;
								}
							} catch {
								fileShas[file.path] = null;
							}
						}

						codeSnapshot = {
							commitSha: lastCommitSha,
							fileShas,
							createdAt: new Date().toISOString(),
						};
					}
				} catch (snapshotError) {
					console.warn('Failed to get code snapshot:', snapshotError);
				}
			}
		} else if (method === 'zip') {
			const zipFile = formData.get('zipFile');
			if (!(zipFile instanceof File)) {
				return NextResponse.json({ error: 'Missing zipFile' }, { status: 400 });
			}

			files = await extractFilesFromZip(zipFile);
		} else {
			return NextResponse.json({ error: 'Invalid method. Use "github" or "zip"' }, { status: 400 });
		}

		if (files.length === 0) {
			return NextResponse.json({ error: 'No relevant files found in codebase' }, { status: 400 });
		}

		// Run tool detection
		const detectionResult = detectTools(files);

		// Generate diagram
		const diagramMarkdown = generateMarkdownDoc(detectionResult);

		let diagramId: string | null = null;
		let isNewDiagram = false;

		// Save diagram if requested
		if (saveDiagram && repoUrl) {
			const { user } = await getSession();
			if (!user) {
				return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
			}

			const supabase = await createClient();
			const repoProvider = detectRepoProvider(repoUrl);

			const diagram = await saveArchitectureDiagram(supabase, {
				user_id: user.id,
				repo_provider: repoProvider,
				repo_url: repoUrl,
				branch,
				subdir: subdir || null,
				detection_result: detectionResult,
				diagram_markdown: diagramMarkdown,
				code_snapshot: codeSnapshot,
				last_commit_sha: lastCommitSha,
				title,
				description,
			});

			if (diagram) {
				diagramId = diagram.id;
				isNewDiagram = true;

				// Track files for GitHub repos
				if (repoProvider === 'github' && codeSnapshot) {
					await trackDiagramFiles(supabase, diagram.id, repoUrl, branch, codeSnapshot, user.id);
				}

				// Create initial version
				await createDiagramVersion(
					supabase,
					diagram.id,
					detectionResult,
					diagramMarkdown,
					codeSnapshot,
					lastCommitSha,
					null
				);
			}
		}

		return NextResponse.json({
			diagram: diagramMarkdown,
			tools: detectionResult,
			fileCount: files.length,
			...(saveDiagram && diagramId
				? {
						saved: true,
						diagramId,
						isNewDiagram,
					}
				: { saved: false }),
		});
	} catch (err: any) {
		console.error('Architecture generation error:', err);
		return NextResponse.json(
			{
				error: 'Failed to generate architecture diagram',
				detail: err.message || String(err)
			},
			{ status: 500 }
		);
	}
}

