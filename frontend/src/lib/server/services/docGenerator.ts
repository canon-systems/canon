import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSystemPrompt, PromptConfig as PromptConfigType } from '../prompts/buildSystemPrompt';
import { analyzeRepository } from './analyzeRepository';
import { LLMGateway, estimateTokenCount, selectModelForTokenCount } from './llmGateway';
import { parseRepoUrl } from '../github/github';
import { prepareFileSummaries } from './prepareSummaries';
import { FileSummaryManager } from './fileSummaryManager';

/**
 * Normalize repo URL to repo_id format: "github.com/owner/repo"
 * Preserves original case to match existing records in the database.
 * Queries use ilike for case-insensitive matching.
 */
function normalizeRepoId(repoUrl: string): string {
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		throw new Error(`Invalid repo URL: ${repoUrl}`);
	}
	return `github.com/${parsed.owner}/${parsed.repo}`;
}

/**
 * Normalize file paths so "./foo.ts" and "foo.ts" are treated the same.
 */
function normalizeFilePath(filePath?: string | null): string {
	if (!filePath) return '';
	let normalized = filePath.trim().replace(/\\/g, '/');

	// Remove duplicated slashes
	normalized = normalized.replace(/\/+/g, '/');

	// Remove leading ./ or /
	while (normalized.startsWith('./')) {
		normalized = normalized.slice(2);
	}
	while (normalized.startsWith('/')) {
		normalized = normalized.slice(1);
	}

	return normalized;
}

/**
 * Check if two file paths match, handling cases where one path
 * has additional directory prefixes (e.g., "frontend/src/..." vs "src/...")
 */
function pathsMatch(path1: string, path2: string): boolean {
	const normalized1 = normalizeFilePath(path1);
	const normalized2 = normalizeFilePath(path2);

	if (!normalized1 || !normalized2) return false;

	return (
		normalized1 === normalized2 ||
		normalized1.endsWith('/' + normalized2) ||
		normalized2.endsWith('/' + normalized1)
	);
}

export type GenerateDocParams = {
	supabase: SupabaseClient;
	userId?: string | null;
	projectName?: string;
	model: string;
	files?: Array<{ path: string; content: string }>;
	repoUrl?: string | null;
	sourceId?: string;
	sourceUrl?: string | null;
	branch?: string | null;
	subdir?: string | null;
	promptConfig?: PromptConfigType | null;
	useSummaries?: boolean;
	submissionId?: string;
	existingMarkdown?: string | null;
	isUpdate?: boolean;
};

export type GenerateDocResult = {
	markdown: string;
	model: string;
	promptConfig?: PromptConfigType | null;
};

export async function generateDocumentation(params: GenerateDocParams): Promise<GenerateDocResult> {
	const {
		supabase,
		userId,
		projectName = 'Project',
		model,
		files: initialFiles,
		repoUrl,
		// Removed unused variable: sourceId
		sourceUrl,
		branch,
		subdir,
		promptConfig,
		useSummaries = false,
		submissionId,
		existingMarkdown,
		isUpdate = false,
	} = params;

	if (!model) {
		throw new Error('model is required for documentation generation');
	}

	const files = initialFiles || [];
	let fileEntries = files;

	if (!fileEntries.length) {
		const resolvedUrl = repoUrl || sourceUrl || '';
		if (!resolvedUrl) {
			throw new Error('Either files or a source URL must be provided');
		}

		const analysis = await analyzeRepository({
			supabase,
			userId: userId ?? '',
			repoUrl: resolvedUrl,
			branch: branch || undefined,
			subdir,
			filters: null,
		});

		fileEntries = analysis.rawFiles ?? [];
	}

	if (!fileEntries.length) {
		throw new Error('No files available to generate documentation');
	}

	// If useSummaries is enabled, load summaries using centralized manager
	let summariesMap = new Map<string, { file_path: string; summary_text: string }>();

	const resolvedRepoUrl = repoUrl || sourceUrl || null;

	if (useSummaries && resolvedRepoUrl) {
		// Use centralized FileSummaryManager to load existing summaries
		const repoKey = normalizeRepoId(resolvedRepoUrl);
		const summaryBranch = branch || 'main';
		const summaryManager = new FileSummaryManager(supabase, repoKey, summaryBranch);

		// Get file paths we're processing
		const filePaths = fileEntries.map(f => f.path);

		// Load existing summaries (without generating new ones)
		summariesMap = await summaryManager.getExistingSummaries(filePaths);

		// Check if we have summaries for all files
		const missingFiles = filePaths.filter(path => !summariesMap.has(path));
		if (missingFiles.length > 0) {
			console.log(`[docGenerator] ⚠️ Missing summaries for ${missingFiles.length} files, generating on-demand...`);

			// Generate missing summaries on-demand
			try {
				// Get file entries for missing files
				const missingFileEntries = fileEntries.filter(file => missingFiles.includes(file.path));

				// Generate summaries for missing files
				await summaryManager.updateSummariesIfNeeded(missingFileEntries, {
					force: true, // Generate even if recently checked
					batchSize: 10, // Increased batch size for better performance
					onProgress: (progress) => {
						console.log(`[docGenerator] 📊 Summary generation progress: ${progress.processed}/${progress.total}`);
					}
				});

				// Reload summaries to include newly generated ones
				summariesMap = await summaryManager.getExistingSummaries(filePaths);

				// Check if we now have all summaries
				const stillMissing = filePaths.filter(path => !summariesMap.has(path));
				if (stillMissing.length > 0) {
					console.log(`[docGenerator] ⚠️ Still missing summaries for ${stillMissing.length} files after generation attempt`);
					console.log(`[docGenerator] 📝 Proceeding with ${summariesMap.size} available summaries out of ${filePaths.length} total files`);

					// Filter to files with summaries (fallback)
					fileEntries = fileEntries.filter(file => summariesMap.has(file.path));
					console.log(`[docGenerator] ✅ Filtered to ${fileEntries.length} files with available summaries`);
				} else {
					console.log(`[docGenerator] ✅ Successfully generated summaries for all ${missingFiles.length} missing files`);
				}
			} catch (error) {
				console.error(`[docGenerator] ❌ Failed to generate missing summaries:`, error);
				console.log(`[docGenerator] 📝 Proceeding with ${summariesMap.size} available summaries out of ${filePaths.length} total files`);

				// Filter to files with summaries (fallback on error)
				fileEntries = fileEntries.filter(file => summariesMap.has(file.path));
				console.log(`[docGenerator] ✅ Filtered to ${fileEntries.length} files with available summaries`);
			}
		}
	} else if (useSummaries) {
		// useSummaries was requested but we don't have the required params
		// This is an error - summaries are required to avoid token limits
		throw new Error(
			'useSummaries was true but missing repoUrl. ' +
			'Cannot proceed without summaries to avoid token limits.'
		);
	}

	function truncateForPrompt(text: string, maxChars: number): string {
		if (text.length <= maxChars) return text;
		return `${text.slice(0, maxChars)}\n\n[...truncated...]`;
	}

	const systemPrompt = buildSystemPrompt(promptConfig ?? null, isUpdate);

	// Build file content - MUST use summaries if useSummaries is true
	const fileContentParts: string[] = [];

	for (const file of fileEntries) {
		if (useSummaries) {
			// Get summary - try exact match first, then fuzzy match
			let summary = summariesMap.get(file.path);

			// If not found by exact path, try finding via fuzzy matching in the map
			if (!summary) {
				for (const [key, value] of summariesMap.entries()) {
					if (pathsMatch(key, file.path)) {
						summary = value;
						break;
					}
				}
			}

			if (!summary) {
		// Summary is missing - generate it now
				console.log(`Summary missing for ${file.path}, generating now...`);

				// Re-run prepare to generate the missing summary
				if (!submissionId) {
					throw new Error(`Cannot generate missing summary for ${file.path} without submissionId`);
				}
				if (!userId) {
					throw new Error(`Cannot generate missing summary for ${file.path} without userId`);
				}
				await prepareFileSummaries(supabase, submissionId, false, userId);

				// Reload ALL summaries and use fuzzy matching
				const { data: document } = await supabase
					.from('documents')
					.select('id, source_id')
					.eq('id', submissionId)
					.single();

				if (document) {
					// Get repo details for branch
					const { data: repo } = await supabase
						.from('workspace_sources')
						.select('default_branch')
						.eq('id', document.source_id)
						.single();

					const repoId = normalizeRepoId(resolvedRepoUrl!);
					const submissionBranch = repo?.default_branch || branch || 'main';
					// Load all summaries and find matching one with fuzzy path matching
					const { data: reloadedSummaries } = await supabase
						.from('repo_file_summaries')
						.select('file_path, summary_text')
						.ilike('repo_id', repoId)
						.eq('branch', submissionBranch);

					// Find matching summary using fuzzy path matching
					for (const reloaded of reloadedSummaries || []) {
						if (pathsMatch(reloaded.file_path, file.path)) {
							summary = reloaded;
							summariesMap.set(file.path, summary);
							break;
						}
					}
				}

				// If still missing after retry, FAIL instead of using full content to avoid token limits
				if (!summary) {
					throw new Error(`Summary generation failed for ${file.path}. Cannot proceed without summaries to avoid token limits.`);
				}
			}

			// Use summary text directly since we removed summary_json
			const summaryText = summary.summary_text || 'No summary available';

			// Format summary for LLM - simplified since we only have text now
			const formattedSummary = `--- FILE: ${file.path} ---\n${summaryText}`;

			fileContentParts.push(formattedSummary);
		} else {
			// Only use full content if useSummaries is false (non-repo submissions)
			fileContentParts.push(`--- FILE: ${file.path} ---\n${file.content}`);
		}
	}

	const fileContent = fileContentParts.join('\n\n');
	const existingDocBlock =
		isUpdate && typeof existingMarkdown === 'string' && existingMarkdown.trim()
			? `Existing documentation (preserve structure and non-code context where possible):\n\n${truncateForPrompt(existingMarkdown.trim(), 12000)}\n\n---\n\n`
			: '';

	const updateTaskBlock = isUpdate
		? '\n\nTask: Update the existing documentation to reflect the files below. Preserve headings and section order where possible, and only change what is necessary.'
		: '';

	const userPrompt = `Project: ${projectName}\n\n${existingDocBlock}Files (${fileEntries.length}):\n${fileContent}${updateTaskBlock}`;

	// Estimate token count and select appropriate model
	const systemTokens = estimateTokenCount(systemPrompt);
	const userTokens = estimateTokenCount(userPrompt);
	const estimatedTokens = systemTokens + userTokens;

	const selectedModel = selectModelForTokenCount(estimatedTokens, model);

	if (selectedModel !== model) {
		console.log(`[docGenerator] ⚠️  MODEL SWITCH: ${model} → ${selectedModel} (context limit exceeded)`);
	}

	const gateway = new LLMGateway();

	// Generate documentation (this is the main blocking operation)
	// Removed unused variable: startTime

	const markdown = await gateway.call(
		[
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt },
		],
		selectedModel,
		promptConfig?.temperature
	);

	return {
		markdown,
		model: selectedModel, // Return the model that was actually used
		promptConfig,
	};
}
