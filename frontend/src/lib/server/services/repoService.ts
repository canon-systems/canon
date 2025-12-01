import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserOctokit } from '../github/getUserOctokit';
import { parseRepoUrl } from '../github/github';
import { getCachedBranch, getCachedTree } from '../github/cachedOctokit';
import { fetchFilesViaZip } from '../github/batchFetch';
import { LLMGateway } from './llmGateway';
import { createHash } from 'crypto';

const RELEVANT_EXTENSIONS = new Set([
	'.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go', '.rs', '.rb', '.php',
	'.cpp', '.c', '.h', '.hpp', '.cs', '.swift', '.kt', '.scala', '.clj',
	'.sh', '.bash', '.zsh', '.fish', '.json', '.yaml', '.yml', '.toml', '.ini',
	'.xml', '.html', '.css', '.scss', '.sass', '.less', '.md', '.txt', '.rst',
	'.dockerfile', '.makefile', '.cmake', '.gradle', '.maven',
	'package.json', 'requirements.txt', 'Pipfile', 'Cargo.toml', 'go.mod',
	'pom.xml', 'build.gradle', 'composer.json'
]);

const EXCLUDED_PATTERNS = [
	/node_modules\//i,
	/vendor\//i,
	/\.min\.(js|css)$/i,
	/\.bundle\.(js|css)$/i,
	/dist\/.*\.(js|css)$/i,
	/build\/.*\.(js|css)$/i,
];

const EXCLUDED_FILES = new Set([
	'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock',
	'Gemfile.lock', 'Cargo.lock', 'poetry.lock', 'Pipfile.lock',
	'shrinkwrap.json', 'npm-shrinkwrap.json', 'bun.lockb'
]);

/**
 * Extract repo name from URL
 */
function extractRepoName(repoUrl: string): string {
	const parsed = parseRepoUrl(repoUrl);
	return parsed ? `${parsed.owner}/${parsed.repo}` : 'Repository';
}

/**
 * Calculate file hash
 */
function calculateFileHash(content: string): string {
	return createHash('sha256').update(content).digest('hex');
}

/**
 * Summarize a single file
 * Simple: call LLM → return summary text
 */
async function summarizeFile(content: string, path: string): Promise<string> {
	// Skip excluded files
	if (EXCLUDED_FILES.has(path.split('/').pop() || '')) {
		return 'Auto-generated file (lock file). Skipped from analysis.';
	}

	if (EXCLUDED_PATTERNS.some(pattern => pattern.test(path))) {
		return 'Auto-generated file. Skipped from analysis.';
	}

	// Truncate very large files
	const maxChars = 50000;
	const contentToAnalyze = content.length > maxChars
		? content.slice(0, maxChars) + '\n\n// ... [FILE TRUNCATED] ...'
		: content;

	const gateway = new LLMGateway();
	const prompt = `Summarize this file in 2-3 sentences. Focus on what it does and its main purpose.

File: ${path}

\`\`\`
${contentToAnalyze}
\`\`\`

Provide a concise 2-3 sentence summary.`;

	try {
		const summary = await gateway.call(
			[{ role: 'user', content: prompt }],
			'gpt-4o-mini',
			0.2
		);
		return summary.trim();
	} catch (error: any) {
		console.error(`Failed to summarize ${path}:`, error);
		return `File: ${path}. Unable to generate summary.`;
	}
}

/**
 * Fetch all files from repository
 */
async function fetchRepoFiles(
	supabase: SupabaseClient,
	userId: string,
	repoUrl: string,
	branch: string
): Promise<Array<{ path: string; content: string; hash: string }>> {
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		throw new Error(`Invalid GitHub URL: ${repoUrl}`);
	}

	const { owner, repo } = parsed;
	const octokit = await getUserOctokit(supabase, userId);

	// Get branch and commit SHA
	const branchData = await getCachedBranch(octokit, owner, repo, branch);
	const commitSha = branchData.commit.sha;

	// Get tree to find all files
	const treeData = await getCachedTree(octokit, owner, repo, commitSha);
	const treeItems = (treeData.tree || []).filter((item) => item.type === 'blob');

	// Filter to relevant files
	const relevantFiles = treeItems.filter((item) => {
		if (!item.path) return false;
		const fileName = item.path.split('/').pop() || '';
		
		if (EXCLUDED_FILES.has(fileName)) return false;
		if (EXCLUDED_PATTERNS.some(pattern => pattern.test(item.path))) return false;
		
		const lowerPath = item.path.toLowerCase();
		return Array.from(RELEVANT_EXTENSIONS).some((ext) =>
			lowerPath.endsWith(ext) || lowerPath === ext
		);
	});

	const filePaths = relevantFiles.map(f => f.path).slice(0, 500); // Limit to 500 files

	// Fetch files via ZIP (most efficient)
	const zipFiles = await fetchFilesViaZip(
		octokit,
		owner,
		repo,
		commitSha,
		filePaths,
		{ maxFileSize: 1024 * 1024, maxFiles: 500 }
	);

	// Convert to our format with hashes
	return zipFiles.map(file => ({
		path: file.path,
		content: file.content,
		hash: calculateFileHash(file.content)
	}));
}

/**
 * Connect a repository and summarize all files
 * Simple: fetch files → summarize each → save
 */
export async function connectRepo(
	supabase: SupabaseClient,
	userId: string,
	repoUrl: string,
	branch: string = 'main'
): Promise<{ repoId: string; fileCount: number }> {
	// Normalize repo URL to repo_id format
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		throw new Error(`Invalid repo URL: ${repoUrl}`);
	}
	const normalizedRepoId = `github.com/${parsed.owner}/${parsed.repo}`;

	// 1. Create or get workspace_repos record
	let repoId: string;
	const { data: repo, error: repoError } = await supabase
		.from('workspace_repos')
		.insert({
			workspace_id: userId,
			name: extractRepoName(repoUrl),
			repo_url: repoUrl,
			default_branch: branch,
			provider: 'github',
			auth_type: 'github_pat'
		})
		.select()
		.single();

	if (repoError) {
		// If repo already exists, try to get it
		const { data: existingRepo } = await supabase
			.from('workspace_repos')
			.select('id')
			.eq('workspace_id', userId)
			.eq('repo_url', repoUrl)
			.single();
		
		if (!existingRepo) {
			throw repoError;
		}
		
		repoId = existingRepo.id;
	} else {
		repoId = repo.id;
	}
	
	// Create or get repository_setup record
	const { data: setup, error: setupError } = await supabase
		.from('repository_setup')
		.insert({
			repo_id: repoId,
			setup_status: 'analyzing',
			branch: branch,
			total_files: 0,
			summarized_files: 0
		})
		.select()
		.single();

	if (setupError && !setupError.message.includes('duplicate')) {
		// If setup already exists, just continue
		if (!setupError.message.includes('already exists')) {
			throw setupError;
		}
	}

	try {
		// 2. Fetch all files from GitHub
		const files = await fetchRepoFiles(supabase, userId, repoUrl, branch);

		// Update total files
		await supabase
			.from('repository_setup')
			.update({
				total_files: files.length,
				setup_status: 'analyzing'
			})
			.eq('repo_id', repoId);

		// 3. Summarize each file (simple, one at a time)
		let processed = 0;
		for (const file of files) {
			try {
				const summary = await summarizeFile(file.content, file.path);
				
				// Use RPC function to upsert into repo_file_summaries
				await supabase.rpc('upsert_repo_file_summary', {
					p_repo_id: normalizedRepoId,
					p_file_path: file.path,
					p_file_hash: file.hash,
					p_summary_text: summary,
					p_summary_json: { summary },
					p_summary_model: 'gpt-4o-mini',
					p_user_id: userId,
					p_branch: branch
				});

				processed++;
				
				// Update progress every 10 files
				if (processed % 10 === 0 || processed === files.length) {
					await supabase
						.from('repository_setup')
						.update({
							summarized_files: processed,
							current_file: file.path
						})
						.eq('repo_id', repoId);
				}
			} catch (error: any) {
				console.error(`Failed to process ${file.path}:`, error);
				// Continue with other files
			}
		}

		// 4. Mark as ready
		await supabase
			.from('repository_setup')
			.update({
				setup_status: 'ready',
				summarized_files: processed
			})
			.eq('repo_id', repoId);

		return { repoId, fileCount: files.length };
	} catch (error: any) {
		// Mark as failed
		await supabase
			.from('repository_setup')
			.update({
				setup_status: 'failed',
				error_message: error.message
			})
			.eq('repo_id', repoId);
		throw error;
	}
}

