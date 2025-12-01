import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSystemPrompt, PromptConfig as PromptConfigType } from '../prompts/buildSystemPrompt';
import { analyzeRepository } from './analyzeRepository';
import { LLMGateway, estimateTokenCount, selectModelForTokenCount } from './llmGateway';
import { parseRepoUrl } from '../github/github';
import { prepareFileSummaries, generateAndSaveFileSummaries } from './prepareSummaries';

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
		files,
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

	let fileEntries = files || [];

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

	// If useSummaries is enabled and we have a submissionId, ENSURE all files have summaries
	let summariesMap = new Map<string, any>();

	if (useSummaries && submissionId && repoUrl) {
		// First, prepare summaries for all files - this will generate any missing ones
		await prepareFileSummaries(supabase, submissionId, false, userId || null);

		// Load submission to get tracked files
		const { data: submission } = await supabase
			.from('submissions')
			.select('selected_files, source_meta')
			.eq('id', submissionId)
			.single();

		if (!submission) {
			throw new Error(`Submission ${submissionId} not found`);
		}

		const repoId = normalizeRepoId(repoUrl);
		const trackedFiles: string[] = ((submission.selected_files || []) as unknown[]).filter(
			(f: unknown): f is string => typeof f === 'string'
		);

		if (trackedFiles.length === 0) {
			throw new Error('No tracked files found in submission');
		}

		// Get branch from submission
		const submissionBranch = submission.source_meta?.branch || branch || 'main';

		// Load ALL summaries for this repo (don't filter by exact file paths)
		// This allows fuzzy path matching (e.g., "frontend/src/..." vs "src/...")
		const { data: allSummaries, error: summariesError } = await supabase
			.from('repo_file_summaries')
			.select('file_path, summary_text, summary_json')
			.ilike('repo_id', repoId)
			.eq('branch', submissionBranch);

		if (summariesError) {
			throw new Error(`Failed to load summaries: ${summariesError.message}`);
		}

		// Build map using fuzzy path matching to handle path prefix differences
		// (e.g., "frontend/src/..." vs "src/...")
		const matchedTrackedFiles = new Set<string>();

		for (const summary of allSummaries || []) {
			// Find which tracked file this summary matches
			for (const trackedPath of trackedFiles) {
				if (pathsMatch(summary.file_path, trackedPath)) {
					// Store with the tracked file path as key (for lookup during generation)
					summariesMap.set(trackedPath, summary);
					matchedTrackedFiles.add(trackedPath);
					break;
				}
			}
		}

		// Check for any missing summaries
		const missingFiles = trackedFiles.filter((path) => !matchedTrackedFiles.has(path));

		if (missingFiles.length > 0) {
			// Generate summaries for missing files
			console.log(`Generating summaries for ${missingFiles.length} missing file(s): ${missingFiles.join(', ')}`);

			// Re-run prepare to generate missing summaries
			await prepareFileSummaries(supabase, submissionId, false, userId || null);

			// Reload ALL summaries after generation
			const { data: updatedSummaries, error: reloadError } = await supabase
				.from('repo_file_summaries')
				.select('file_path, summary_text, summary_json')
				.ilike('repo_id', repoId)
				.eq('branch', submissionBranch);

			if (reloadError) {
				throw new Error(`Failed to reload summaries: ${reloadError.message}`);
			}

			// Re-match with fuzzy path matching
			for (const summary of updatedSummaries || []) {
				for (const trackedPath of trackedFiles) {
					if (pathsMatch(summary.file_path, trackedPath)) {
						summariesMap.set(trackedPath, summary);
						matchedTrackedFiles.add(trackedPath);
						break;
					}
				}
			}

			// Verify all files now have summaries
			const stillMissing = trackedFiles.filter((path) => !matchedTrackedFiles.has(path));

			if (stillMissing.length > 0) {
				throw new Error(
					`Unable to generate summaries for ${stillMissing.length} file(s) after retry: ${stillMissing.join(', ')}. ` +
					`Available summaries: ${(updatedSummaries || []).map(s => s.file_path).join(', ')}`
				);
			}
		}
	} else if (useSummaries) {
		// useSummaries was requested but we don't have the required params
		// This is an error - summaries are required to avoid token limits
		throw new Error(
			'useSummaries was true but missing submissionId or repoUrl. ' +
			'Cannot proceed without summaries to avoid token limits.'
		);
	}

	const systemPrompt = buildSystemPrompt(promptConfig ?? null, false);

	// Build file content - MUST use summaries if useSummaries is true
	const fileContentParts: string[] = [];

	for (const file of fileEntries) {
		if (useSummaries && submissionId) {
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
				await prepareFileSummaries(supabase, submissionId, false, userId || null);

				// Reload ALL summaries and use fuzzy matching
				const { data: submission } = await supabase
					.from('submissions')
					.select('selected_files, source_meta')
					.eq('id', submissionId)
					.single();

				if (submission) {
					const repoId = normalizeRepoId(repoUrl!);
					const submissionBranch = submission.source_meta?.branch || branch || 'main';
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

	console.log(`\n[docGenerator] ========== TOKEN ANALYSIS ==========`);
	console.log(`[docGenerator] Project: ${projectName}`);
	console.log(`[docGenerator] Files: ${fileEntries.length}`);
	console.log(`[docGenerator] System prompt tokens: ~${systemTokens.toLocaleString()}`);
	console.log(`[docGenerator] User prompt tokens: ~${userTokens.toLocaleString()}`);
	console.log(`[docGenerator] Total estimated tokens: ~${estimatedTokens.toLocaleString()}`);
	console.log(`[docGenerator] Requested model: ${model}`);

	const selectedModel = selectModelForTokenCount(estimatedTokens, model);

	if (selectedModel !== model) {
		console.log(`[docGenerator] ⚠️  MODEL SWITCH: ${model} → ${selectedModel} (context limit exceeded)`);
	} else {
		console.log(`[docGenerator] ✓ Using model: ${selectedModel}`);
	}
	console.log(`[docGenerator] ==========================================\n`);

	const gateway = new LLMGateway();

	// Generate documentation (this is the main blocking operation)
	console.log(`[docGenerator] 🚀 Starting LLM call to ${selectedModel}...`);
	const startTime = Date.now();

	const markdown = await gateway.call(
		[
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt },
		],
		selectedModel,
		promptConfig?.temperature
	);

	const duration = ((Date.now() - startTime) / 1000).toFixed(1);
	console.log(`[docGenerator] ✓ LLM call completed in ${duration}s`);
	console.log(`[docGenerator] Generated ${markdown.length.toLocaleString()} characters of documentation`);

	// Generate and save file summaries asynchronously (don't block the response)
	// This ensures all files used in documentation have summaries in repo_file_summaries
	if (repoUrl && fileEntries.length > 0) {
		// Get file hashes from submission if available
		let fileHashes: Record<string, string | null> = {};
		if (submissionId) {
			try {
				const { data: submission } = await supabase
					.from('submissions')
					.select('code_snapshot')
					.eq('id', submissionId)
					.single();

				if (submission?.code_snapshot?.fileShas) {
					fileHashes = submission.code_snapshot.fileShas;
				}
			} catch (error) {
				console.warn('Failed to load code_snapshot for file hashes:', error);
			}
		}

		// Prepare files with hashes for summary generation
		const filesWithHashes = fileEntries.map((file) => ({
			path: file.path,
			content: file.content,
			hash: fileHashes[file.path] || null,
		}));

		// Generate summaries asynchronously (fire and forget - don't await)
		// This ensures summaries are saved without blocking documentation generation
		const branchForSummaries = branch || 'main';
		generateAndSaveFileSummaries(supabase, repoUrl, filesWithHashes, userId, 'gpt-4o-mini', submissionId || null, branchForSummaries).catch(
			(error) => {
				// Log errors but don't fail the documentation generation
				console.error('Failed to generate file summaries asynchronously:', error);
			}
		);
	}

	return {
		markdown,
		model: selectedModel, // Return the model that was actually used
		promptConfig,
	};
}

