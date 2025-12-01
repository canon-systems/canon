import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSystemPrompt, PromptConfig as PromptConfigType } from '../prompts/buildSystemPrompt';
import { analyzeRepository } from './analyzeRepository';
import { LLMGateway } from './llmGateway';
import { parseRepoUrl } from '../github/github';
import { prepareFileSummaries, generateAndSaveFileSummaries } from './prepareSummaries';

/**
 * Normalize repo URL to repo_id format: "github.com/owner/repo" (lowercase)
 * GitHub URLs are case-insensitive, so we normalize to lowercase for consistent matching
 */
function normalizeRepoId(repoUrl: string): string {
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		throw new Error(`Invalid repo URL: ${repoUrl}`);
	}
	return `github.com/${parsed.owner}/${parsed.repo}`.toLowerCase();
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
		const trackedFiles = submission.selected_files || [];

		if (trackedFiles.length === 0) {
			throw new Error('No tracked files found in submission');
		}

		// Get branch from submission
		const submissionBranch = submission.source_meta?.branch || branch || 'main';

		// Load summaries for tracked files
		// Use ilike for case-insensitive repo_id matching since GitHub URLs are case-insensitive
		const { data: summaries, error: summariesError } = await supabase
			.from('repo_file_summaries')
			.select('file_path, summary_text, summary_json')
			.ilike('repo_id', repoId)
			.eq('branch', submissionBranch)
			.in('file_path', trackedFiles);

		if (summariesError) {
			throw new Error(`Failed to load summaries: ${summariesError.message}`);
		}

		// Check for any missing summaries and generate them
		const filesWithSummaries = new Set((summaries || []).map((s) => s.file_path));
		const missingFiles = trackedFiles.filter((path) => !filesWithSummaries.has(path));

		if (missingFiles.length > 0) {
			// Generate summaries for missing files
			console.log(`Generating summaries for ${missingFiles.length} missing file(s): ${missingFiles.join(', ')}`);

			// Re-run prepare to generate missing summaries
			await prepareFileSummaries(supabase, submissionId, false, userId || null);

			// Reload summaries after generation
			// Use ilike for case-insensitive repo_id matching
			const { data: updatedSummaries, error: reloadError } = await supabase
				.from('repo_file_summaries')
				.select('file_path, summary_text, summary_json')
				.ilike('repo_id', repoId)
				.eq('branch', submissionBranch)
				.in('file_path', trackedFiles);

			if (reloadError) {
				throw new Error(`Failed to reload summaries: ${reloadError.message}`);
			}

			// Verify all files now have summaries
			const finalFilesWithSummaries = new Set((updatedSummaries || []).map((s) => s.file_path));
			const stillMissing = trackedFiles.filter((path) => !finalFilesWithSummaries.has(path));

			if (stillMissing.length > 0) {
				throw new Error(
					`Unable to generate summaries for ${stillMissing.length} file(s) after retry: ${stillMissing.join(', ')}`
				);
			}

			// Build map from updated summaries
			(updatedSummaries || []).forEach((summary) => {
				summariesMap.set(summary.file_path, summary);
			});
		} else {
			// All files have summaries - build map
			(summaries || []).forEach((summary) => {
				summariesMap.set(summary.file_path, summary);
			});
		}
	} else if (useSummaries) {
		// useSummaries was requested but we don't have the required params
		// This can happen if prepareFirst was used but submissionId/repoUrl aren't available yet
		// Just log a warning and continue without summaries
		console.warn('useSummaries was true but missing submissionId or repoUrl, falling back to full content');
	}

	const systemPrompt = buildSystemPrompt(promptConfig ?? null, false);

	// Build file content - MUST use summaries if useSummaries is true
	const fileContentParts: string[] = [];

	for (const file of fileEntries) {
		if (useSummaries && submissionId) {
			// Get summary - if missing, generate it
			let summary = summariesMap.get(file.path);
			if (!summary) {
				// Summary is missing - generate it now
				console.log(`Summary missing for ${file.path}, generating now...`);

				// Re-run prepare to generate the missing summary
				await prepareFileSummaries(supabase, submissionId, false, userId || null);

				// Reload summaries
				const { data: submission } = await supabase
					.from('submissions')
					.select('selected_files, source_meta')
					.eq('id', submissionId)
					.single();

				if (submission) {
					const repoId = normalizeRepoId(repoUrl!);
					const submissionBranch = submission.source_meta?.branch || branch || 'main';
					// Use ilike for case-insensitive repo_id matching
					const { data: reloadedSummaries } = await supabase
						.from('repo_file_summaries')
						.select('file_path, summary_text, summary_json')
						.ilike('repo_id', repoId)
						.eq('branch', submissionBranch)
						.eq('file_path', file.path)
						.single();

					if (reloadedSummaries) {
						summary = reloadedSummaries;
						summariesMap.set(file.path, summary);
					}
				}

				// If still missing after retry, use file content as last resort (shouldn't happen)
				if (!summary) {
					console.warn(`Unable to generate summary for ${file.path} after retry, using file content`);
					fileContentParts.push(`--- FILE: ${file.path} ---\n${file.content}`);
					continue;
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

	const gateway = new LLMGateway();

	// Generate documentation (this is the main blocking operation)
	const markdown = await gateway.call(
		[
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt },
		],
		model,
		promptConfig?.temperature
	);

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
		model,
		promptConfig,
	};
}

