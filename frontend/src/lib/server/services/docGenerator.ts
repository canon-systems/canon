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
	branch?: string | null;
	subdir?: string | null;
	promptConfig?: PromptConfigType | null;
	useSummaries?: boolean;
	submissionId?: string;
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
		branch,
		subdir,
		promptConfig,
		useSummaries = false,
		submissionId,
	} = params;

	if (!model) {
		throw new Error('model is required for documentation generation');
	}

	let files = initialFiles || [];
	let fileEntries = files;

	if (!fileEntries.length) {
		if (!repoUrl) {
			throw new Error('Either files or repoUrl must be provided');
		}

		const analysis = await analyzeRepository({
			supabase,
			userId: userId ?? '',
			repoUrl,
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
	let summariesMap = new Map<string, any>();

	if (useSummaries && repoUrl) {
		// Use centralized FileSummaryManager to load existing summaries
		const repoId = normalizeRepoId(repoUrl);
		const summaryBranch = branch || 'main';
		const summaryManager = new FileSummaryManager(supabase, repoId, summaryBranch);

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

	const systemPrompt = buildSystemPrompt(promptConfig ?? null, false);

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
					.select('id, repo_id')
					.eq('id', submissionId)
					.single();

				if (document) {
					// Get repo details for branch
					const { data: repo } = await supabase
						.from('workspace_repos')
						.select('default_branch')
						.eq('id', document.repo_id)
						.single();

					const repoId = normalizeRepoId(repoUrl!);
					const submissionBranch = repo?.default_branch || branch || 'main';
					// Load all summaries and find matching one with fuzzy path matching
					const { data: reloadedSummaries } = await supabase
						.from('repo_file_summaries')
						.select('file_path, summary_text, summary_json')
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

			// Format summary for LLM
			const summaryJson = summary.summary_json || {};
			const problemSolved = summaryJson.problem_solved;
			const functions = summaryJson.functions || [];
			const apis = summaryJson.apis || [];
			const imports = summaryJson.imports || [];
			const dependencies = summaryJson.upstream_dependencies || [];
			const codeUses = summaryJson.code_uses || [];
			const logic = summaryJson.logic || {};
			const designPatterns = summaryJson.design_patterns || [];
			const keyDecisions = summaryJson.key_decisions || [];

			let formattedSummary = `--- FILE: ${file.path} ---\n${summary.summary_text || ''}`;

			if (problemSolved) {
				formattedSummary += `\n\nProblem Solved:\n${problemSolved}`;
			}

			if (imports.length > 0) {
				formattedSummary += `\n\nImports:\n${imports
					.map(
						(imp: any) =>
							`  - ${imp.module} (${imp.type || 'unknown'}): ${imp.purpose}\n    Used: ${imp.items?.map((item: any) => `${item.name}${item.alias ? ` as ${item.alias}` : ''} (${item.usage})`).join(', ') || 'N/A'}`
					)
					.join('\n')}`;
			}

			if (functions.length > 0) {
				formattedSummary += `\n\nFunctions:\n${functions
					.map(
						(f: any) => {
							let funcDesc = `  - ${f.name}(${f.parameters?.map((p: any) => `${p.name}: ${p.type}`).join(', ') || ''}): ${f.returnType || 'void'} - ${f.description || ''}`;
							if (f.logic) {
								funcDesc += `\n    Logic: ${f.logic}`;
							}
							if (f.calls && f.calls.length > 0) {
								funcDesc += `\n    Calls: ${f.calls.join(', ')}`;
							}
							if (f.called_by && f.called_by.length > 0) {
								funcDesc += `\n    Called by: ${f.called_by.join(', ')}`;
							}
							return funcDesc;
						}
					)
					.join('\n')}`;
			}

			if (apis.length > 0) {
				formattedSummary += `\n\nAPIs:\n${apis
					.map(
						(api: any) => {
							let apiDesc = `  - ${api.type.toUpperCase()}${api.method ? ` ${api.method}` : ''}: ${api.endpoint} - ${api.description || ''}`;
							if (api.request_body) {
								apiDesc += `\n    Request: ${api.request_body}`;
							}
							if (api.response) {
								apiDesc += `\n    Response: ${api.response}`;
							}
							return apiDesc;
						}
					)
					.join('\n')}`;
			}

			if (logic.main_flow) {
				formattedSummary += `\n\nMain Logic Flow:\n${logic.main_flow}`;
			}

			if (logic.algorithms && logic.algorithms.length > 0) {
				formattedSummary += `\n\nAlgorithms:\n${logic.algorithms.map((alg: string) => `  - ${alg}`).join('\n')}`;
			}

			if (logic.business_rules && logic.business_rules.length > 0) {
				formattedSummary += `\n\nBusiness Rules:\n${logic.business_rules.map((rule: string) => `  - ${rule}`).join('\n')}`;
			}

			if (logic.error_handling) {
				formattedSummary += `\n\nError Handling:\n${logic.error_handling}`;
			}

			if (codeUses.length > 0) {
				formattedSummary += `\n\nCode Used:\n${codeUses
					.map(
						(use: any) =>
							`  - ${use.type} ${use.name} from ${use.from}: ${use.usage}${use.location ? ` (${use.location})` : ''}`
					)
					.join('\n')}`;
			}

			if (dependencies.length > 0) {
				formattedSummary += `\n\nDependencies:\n${dependencies
					.map(
						(dep: any) =>
							`  - ${dep.file}: ${dep.functions?.join(', ') || ''} - ${dep.purpose || ''}${dep.usage_context ? ` (${dep.usage_context})` : ''}`
					)
					.join('\n')}`;
			}

			if (designPatterns.length > 0) {
				formattedSummary += `\n\nDesign Patterns:\n${designPatterns.map((pattern: string) => `  - ${pattern}`).join('\n')}`;
			}

			if (keyDecisions.length > 0) {
				formattedSummary += `\n\nKey Decisions:\n${keyDecisions.map((decision: string) => `  - ${decision}`).join('\n')}`;
			}

			fileContentParts.push(formattedSummary);
		} else {
			// Only use full content if useSummaries is false (non-repo submissions)
			fileContentParts.push(`--- FILE: ${file.path} ---\n${file.content}`);
		}
	}

	const fileContent = fileContentParts.join('\n\n');
	const userPrompt = `Project: ${projectName}\n\nFiles (${fileEntries.length}):\n${fileContent}`;

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
	const startTime = Date.now();

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

