import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserOctokit } from '../github/getUserOctokit';
import { parseRepoUrl } from '../github/github';
import { getCachedBranch } from '../github/cachedOctokit';
import { getCachedFileContent } from '../github/cachedOctokit';
import { LLMGateway } from './llmGateway';
import { createHash } from 'crypto';
import { getDocument, getDocumentFiles } from './documentService';
import { updateKnowledgeBase } from './knowledgeBaseService';
import { generateSimpleFileSummary } from './fileSummarizerSimple';
import { createServiceRoleClient } from '../../supabase/server';

/**
 * Normalize repo URL to repo_id format: "github.com/owner/repo"
 */
function normalizeRepoId(repoUrl: string): string {
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		throw new Error(`Invalid repo URL: ${repoUrl}`);
	}
	return `github.com/${parsed.owner}/${parsed.repo}`;
}

/**
 * Calculate file hash
 */
function calculateFileHash(content: string): string {
	return createHash('sha256').update(content).digest('hex');
}

/**
 * Normalize file paths for consistent matching
 */
function normalizeFilePath(filePath: string): string {
	return filePath.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.?\//, '');
}

/**
 * Get file hash from GitHub
 */
async function getFileHash(
	supabase: SupabaseClient,
	userId: string,
	repoUrl: string,
	branch: string,
	filePath: string
): Promise<string | null> {
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) return null;

	const { owner, repo } = parsed;
	const octokit = await getUserOctokit(supabase, userId);
	const branchData = await getCachedBranch(octokit, owner, repo, branch);
	const commitSha = branchData.commit.sha;

	const fileData = await getCachedFileContent(octokit, owner, repo, filePath, commitSha);
	return fileData?.sha || null;
}

/**
 * Get file content from GitHub
 */
async function getFileContent(
	supabase: SupabaseClient,
	userId: string,
	repoUrl: string,
	branch: string,
	filePath: string
): Promise<string | null> {
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) return null;

	const { owner, repo } = parsed;
	const octokit = await getUserOctokit(supabase, userId);
	const branchData = await getCachedBranch(octokit, owner, repo, branch);
	const commitSha = branchData.commit.sha;

	const fileData = await getCachedFileContent(octokit, owner, repo, filePath, commitSha);
	return fileData?.content || null;
}

/**
 * Run automation for a rule
 * Simple: check changes → update summaries → regenerate doc → update KB
 */
export async function runAutomation(
	supabase: SupabaseClient,
	rule: any
): Promise<{ success: boolean; changedFiles: number; error?: string }> {
	const repo = rule.repos;
	const document = rule.documents;

	if (!repo || !document) {
		return { success: false, changedFiles: 0, error: 'Missing repo or document' };
	}

	try {
		// 1. Get files used in document
		const filePaths = await getDocumentFiles(supabase, document.id);

		if (filePaths.length === 0) {
			return { success: true, changedFiles: 0 };
		}

		// 2. Check which files changed
		const changedFiles: string[] = [];
		const repoId = normalizeRepoId(repo.repo_url || repo.repoUrl);
		const branch = repo.branch || repo.default_branch || 'main';

		for (const filePath of filePaths) {
			const currentHash = await getFileHash(supabase, repo.workspace_id || repo.user_id, repo.repo_url || repo.repoUrl, branch, filePath);

			if (!currentHash) continue; // File might have been deleted

			const normalizedPath = normalizeFilePath(filePath);
			const { data: summary } = await supabase
				.from('repo_file_summaries')
				.select('file_hash')
				.ilike('repo_id', repoId)
				.eq('branch', branch)
				.eq('file_path', normalizedPath)
				.single();

			if (!summary || summary.file_hash !== currentHash) {
				changedFiles.push(filePath);
			}
		}

		if (changedFiles.length === 0) {
			return { success: true, changedFiles: 0 };
		}

		// 3. Update summaries for changed files
		const serviceClient = createServiceRoleClient();
		for (const filePath of changedFiles) {
			const content = await getFileContent(supabase, repo.workspace_id || repo.user_id, repo.repo_url || repo.repoUrl, branch, filePath);

			if (!content) continue; // File might have been deleted

			const summary = await generateSimpleFileSummary(content, filePath, 'gpt-4o-mini');
			const hash = await getFileHash(supabase, repo.workspace_id || repo.user_id, repo.repo_url || repo.repoUrl, branch, filePath);

			if (hash) {
				const normalizedPath = normalizeFilePath(filePath);
				const summaryText = `${summary.summary}\n\nPurpose: ${summary.purpose}\n\nMain exports: ${summary.mainExports.join(', ') || 'None'}\n\nKey dependencies: ${summary.keyDependencies.join(', ') || 'None'}`;
				const summaryJson = {
					problem_solved: summary.purpose,
					functions: summary.mainExports.map(name => ({
						name,
						signature: '',
						description: '',
						exported: true,
						parameters: [],
						returnType: '',
					})),
					apis: [],
					imports: summary.keyDependencies.map(module => ({
						module,
						type: 'external' as const,
						items: [],
						purpose: '',
					})),
					logic: {
						main_flow: summary.summary,
						algorithms: [],
						business_rules: [],
						entry_points: summary.mainExports,
						data_structures: [],
						error_handling: '',
						edge_cases: [],
						state_management: '',
					},
					downstream_usage: [],
					upstream_dependencies: [],
					code_uses: [],
					design_patterns: [],
					key_decisions: [],
				};

				await serviceClient.rpc('upsert_repo_file_summary', {
					p_repo_id: repoId,
					p_file_path: normalizedPath,
					p_file_hash: hash,
					p_summary_text: summaryText,
					p_summary_json: summaryJson,
					p_summary_model: 'gpt-4o-mini',
					p_user_id: repo.workspace_id || repo.user_id || null,
					// p_submission_id omitted - submissions table no longer exists
					p_branch: branch,
				});
			}
		}

		// 4. Regenerate document
		const normalizedFilePaths = filePaths.map(normalizeFilePath);
		const { data: allSummaries } = await supabase
			.from('repo_file_summaries')
			.select('file_path, summary_text')
			.ilike('repo_id', repoId)
			.eq('branch', branch)
			.in('file_path', normalizedFilePaths);

		if (!allSummaries || allSummaries.length === 0) {
			return { success: false, changedFiles: changedFiles.length, error: 'No summaries found' };
		}

		const combinedSummaries = allSummaries
			.map(s => `File: ${s.file_path}\n${s.summary_text}`)
			.join('\n\n');

		const gateway = new LLMGateway();
		const prompt = `Generate comprehensive documentation from these file summaries. Create well-structured documentation that explains the codebase, its architecture, key components, and how they work together.

File Summaries:
${combinedSummaries}

Generate professional documentation in markdown format with:
- Overview/Introduction
- Architecture/Structure
- Key Components
- How components interact
- Important patterns or conventions

Be thorough and clear.`;

		const newContent = await gateway.call(
			[{ role: 'user', content: prompt }],
			'gpt-4o',
			0.3
		);

		// 5. Update document
		const { data: versionData } = await supabase.rpc('get_next_document_version', {
			doc_id: document.id
		});

		const versionNumber = versionData || 1;

		await supabase.from('documents').update({
			content: newContent,
			updated_at: new Date().toISOString()
		}).eq('id', document.id);

		// 6. Create version
		await supabase.from('document_versions').insert({
			document_id: document.id,
			version_number: versionNumber,
			content: newContent,
			change_summary: `Updated ${changedFiles.length} file(s): ${changedFiles.join(', ')}`
		});

		// 7. Update knowledge base if published
		if (document.kb_id && document.kb_provider) {
			try {
				await updateKnowledgeBase(
					document.kb_provider as 'notion' | 'confluence' | 'coda',
					document.kb_id,
					document.title,
					newContent
				);
			} catch (error: any) {
				console.error('Failed to update knowledge base:', error);
				// Don't fail the whole automation if KB update fails
			}
		}

		return { success: true, changedFiles: changedFiles.length };
	} catch (error: any) {
		console.error('Automation failed:', error);
		return { success: false, changedFiles: 0, error: error.message };
	}
}

