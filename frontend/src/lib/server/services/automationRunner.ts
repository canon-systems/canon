import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeRepository } from './analyzeRepository';
import { generateDocumentation } from './docGenerator';
import { LLMGateway } from './llmGateway';
import { FileSummaryManager } from './fileSummaryManager';
import { parseRepoUrl } from '../github/github';

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

type AutomationRuleContext = {
	supabase: SupabaseClient;
	repo: any;
	rule: any;
	userId: string;
};

export async function executeAutomationRule({
	supabase,
	repo,
	rule,
	userId,
}: AutomationRuleContext): Promise<{
	success: boolean;
	actions: string[];
	errors: string[];
	docId?: string | null;
	diagramId?: string | null;
	skipped?: boolean;
	skipReason?: string;
	publishStatus?: string;
	publishProvider?: string;
	publishResourceId?: string;
}> {
	const ruleName = rule.id || rule.name || 'unnamed-rule';
	const startTime = Date.now();

	console.log(`🤖 [AUTOMATION] Starting: ${repo.name} (${ruleName})`);
	console.log(`📋 [AUTOMATION] Rule: ${ruleName} | Repo: ${repo.name} | Branch: ${repo.default_branch}`);

	const result = {
		success: false,
		actions: [] as string[],
		errors: [] as string[],
		docId: null as string | null,
		diagramId: null as string | null,
		skipped: false,
		skipReason: undefined as string | undefined,
		publishStatus: undefined as string | undefined,
		publishProvider: undefined as string | undefined,
		publishResourceId: undefined as string | undefined,
	};

	try {
		// 🔍 Pre-flight checks
		try {
			new LLMGateway();
			console.log(`✅ [CHECK] AI service available`);
		} catch (error: any) {
			console.error(`❌ [ERROR] AI service unavailable: ${error.message}`);
			result.errors.push(`AI service configuration error: ${error.message}`);
			return result;
		}

		// 🔍 Repository validation
		const { data: repoSetup, error: setupError } = await supabase
			.from('repository_setup')
			.select('setup_status, last_analyzed')
			.eq('repo_id', repo.id)
			.single();

		if (setupError || !repoSetup || repoSetup.setup_status !== 'ready') {
			console.log(`⚠️ [SKIP] Repository not set up for automation`);
			result.skipped = true;
			result.skipReason = 'Repository not set up for automation. Please run repository setup first.';
			result.success = true;
			return result;
		}

		console.log(`✅ [CHECK] Repository ready for automation`);

		const settings = repo.settings || {};
		const subdir = settings.subdir || null;
		const filters = settings.filters || null;
		const promptConfig = settings.prompt_config || null;

		// Always proceed with file processing - let FileSummaryManager handle efficiency
		result.actions.push('scan_repository');

		// STEP 4: Process all repository files - let FileSummaryManager handle efficiency
		console.log(`📝 STEP 4: Processing all repository files...`);

		const summaryStartTime = Date.now();

		// Get all files from the repository analysis
		const analysis = await analyzeRepository({
			supabase,
			userId,
			repoUrl: repo.repo_url,
			branch: repo.default_branch,
			subdir: null,
			filters: null,
		});

		if (!analysis.success || !analysis.rawFiles) {
			console.error(`❌ [ERROR] Failed to analyze repository:`, analysis.message);
			result.errors.push('Failed to analyze repository for file processing');
			return result;
		}

		const filesToProcess = analysis.rawFiles.map(file => ({
			path: file.path,
			content: file.content,
			hash: analysis.snapshot?.fileShas[file.path] || undefined,
		}));

		console.log(`📊 Found ${filesToProcess.length} files to process`);

		// Use FileSummaryManager for efficient processing - it will only process changed files
		let summaryResult: any = null;
		if (filesToProcess.length > 0) {
			const summaryManager = new FileSummaryManager(
				supabase,
				normalizeRepoId(repo.repo_url),
				repo.default_branch
			);

			console.log(`📊 Processing ${filesToProcess.length} files with FileSummaryManager...`);

			summaryResult = await summaryManager.updateSummariesIfNeeded(
				filesToProcess,
				{
					force: false,
					batchSize: 5,
					onProgress: (progress) => {
						console.log(`📊 Summary generation progress: ${progress.processed}/${progress.total} files processed`);
						if (progress.currentFile) {
							console.log(`   Currently processing: ${progress.currentFile}`);
						}
					},
					model: rule.model || 'gpt-4o-mini',
				}
			);

			console.log(`✅ File summary processing complete:`);
			console.log(`   - Processed: ${summaryResult.processed} files`);
			console.log(`   - Skipped: ${summaryResult.skipped} files (already up-to-date)`);
			console.log(`   - Failed: ${summaryResult.failed} files`);
			console.log(`   - Total: ${summaryResult.total} files`);

			if (summaryResult.updatedFiles.length > 0) {
				console.log(`📁 Updated files: ${summaryResult.updatedFiles.slice(0, 5).join(', ')}${summaryResult.updatedFiles.length > 5 ? ` ... and ${summaryResult.updatedFiles.length - 5} more` : ''}`);
			}
		} else {
			console.log(`ℹ️ No files found for processing`);
		}

		const summaryTime = ((Date.now() - summaryStartTime) / 1000).toFixed(1);
		console.log(`⏱️ STEP 4 completed in ${summaryTime}s`);

		// STEP 5: Regenerate affected documents based on files that were actually updated
		const updatedFiles = (summaryResult && filesToProcess.length > 0) ? summaryResult.updatedFiles : [];
		console.log(`🔄 STEP 5: Regenerating documents based on ${updatedFiles.length} updated files...`);

		// Get all documents for this repo
		const { data: repoDocs, error: docsError } = await supabase
			.from('documents')
			.select('id, title, repo_id')
			.eq('repo_id', repo.id);

		if (docsError) {
			console.error(`❌ [ERROR] Failed to get documents:`, docsError);
			result.errors.push('Failed to identify affected documents');
			return result;
		}

		// Get document files for all documents that track updated files
		const docIds = (repoDocs || []).map(d => d.id);
		const { data: allDocFiles, error: filesError } = docIds.length > 0 && updatedFiles.length > 0
			? await supabase
				.from('document_files')
				.select('document_id, file_path')
				.in('document_id', docIds)
				.in('file_path', updatedFiles)
			: { data: null, error: null };

		if (filesError) {
			console.error(`❌ [ERROR] Failed to get document files:`, filesError);
			result.errors.push('Failed to identify affected documents');
			return result;
		}

		// Group affected documents
		const affectedDocs = new Map();
		(repoDocs || []).forEach(doc => {
			const affectedFiles = (allDocFiles || [])
				.filter(df => df.document_id === doc.id)
				.map(df => ({ path: df.file_path, relationship: 'primary' }));

			if (affectedFiles.length > 0) {
				affectedDocs.set(doc.id, {
					docId: doc.id,
					title: doc.title,
					status: 'completed',
					sourceMeta: { repoId: doc.repo_id },
					affectedFiles,
				});
			}
		});

		console.log(`📄 [DOCS] Found ${affectedDocs.size} affected documents from ${repoDocs?.length || 0} total docs`);

		if (affectedDocs.size === 0) {
			console.log(`⏭️ [SKIP] No documents affected by file updates`);
			result.skipped = true;
			result.skipReason = 'No documents affected by file updates';
			result.success = true;
			return result;
		}

		let docsUpdated = 0;
		let docsFailed = 0;

		for (const [docId, docInfo] of affectedDocs) {
			try {
				const timestamp = new Date().toISOString();
				const affectedFilePaths = docInfo.affectedFiles.map((f: { path: string; relationship: string }) => f.path).join(', ');
				const reason = `${docInfo.affectedFiles.length} tracked file(s) changed: ${affectedFilePaths}`;
				console.log(`[${timestamp}]  ↳ Regenerating: ${docInfo.title}`);
				console.log(`[${timestamp}]    Reason: ${reason}`);

				// Get all files related to this document
				const { data: allDocFiles, error: allFilesError } = await supabase
					.from('document_files')
					.select('file_path')
					.eq('document_id', docId);

				if (allFilesError || !allDocFiles) {
					console.error(`[${timestamp}] Failed to get files for doc ${docId}:`, allFilesError);
					docsFailed++;
					continue;
				}

				const relatedFiles = allDocFiles.map(f => f.file_path);
				console.log(`[${timestamp}]    Files to regenerate: ${relatedFiles.length} file(s) - ${relatedFiles.slice(0, 5).join(', ')}${relatedFiles.length > 5 ? ` ... and ${relatedFiles.length - 5} more` : ''}`);

				// Get current content for all related files (use summaries where available)
				const analysis = await analyzeRepository({
					supabase,
					userId,
					repoUrl: repo.repo_url,
					branch: repo.default_branch,
					subdir,
					filters,
				});

				const filesToUse = analysis.rawFiles?.filter(file =>
					relatedFiles.includes(file.path)
				) || [];

				if (filesToUse.length === 0) {
					console.log(`  ⚠️ No files found for document ${docInfo.title}`);
					docsFailed++;
					continue;
				}

				// Generate updated documentation
				const docResult = await generateDocumentation({
					supabase,
					userId,
					projectName: repo.name,
					model: rule.model || 'gpt-4o',
					files: filesToUse,
					repoUrl: repo.repo_url,
					branch: repo.default_branch,
					subdir,
					promptConfig,
					useSummaries: true,
				});

				// Update the existing document
				const { data: versionData } = await supabase.rpc('get_next_document_version', {
					doc_id: docId
				});

				const versionNumber = versionData || 1;

				const { error: updateError } = await supabase
					.from('documents')
					.update({
						content: docResult.markdown,
						updated_at: new Date().toISOString(),
					})
					.eq('id', docId);

				if (updateError) {
					console.error(`Failed to update document ${docId}:`, updateError);
					docsFailed++;
				} else {
					// Create new version
					await supabase.from('document_versions').insert({
						document_id: docId,
						version_number: versionNumber,
						content: docResult.markdown,
						change_summary: `Automated update: ${docInfo.affectedFiles.length} file(s) changed`
					});

					// Update document_files table with the files that were actually used in regeneration
					// This ensures the tracked files stay in sync with what was used to generate the document
					const actualFilePaths = filesToUse.map(f => f.path);
					const currentTrackedPaths = allDocFiles.map(f => f.file_path);

					// Find files to remove (in tracked but not in actual)
					const filesToRemove = currentTrackedPaths.filter(path => !actualFilePaths.includes(path));

					// Find files to add (in actual but not in tracked)
					const filesToAdd = actualFilePaths.filter(path => !currentTrackedPaths.includes(path));

					if (filesToRemove.length > 0) {
						const { error: deleteError } = await supabase
							.from('document_files')
							.delete()
							.eq('document_id', docId)
							.in('file_path', filesToRemove);

						if (deleteError) {
							console.warn(`Failed to remove outdated files from document_files for doc ${docId}:`, deleteError);
						} else {
							console.log(`[${timestamp}]    Removed ${filesToRemove.length} outdated file(s) from tracking`);
						}
					}

					if (filesToAdd.length > 0) {
						const fileMappings = filesToAdd.map(filePath => ({
							document_id: docId,
							file_path: filePath
						}));

						const { error: insertError } = await supabase
							.from('document_files')
							.insert(fileMappings);

						if (insertError) {
							console.warn(`Failed to add new files to document_files for doc ${docId}:`, insertError);
						} else {
							console.log(`[${timestamp}]    Added ${filesToAdd.length} new file(s) to tracking`);
						}
					}

					docsUpdated++;
					const completionTimestamp = new Date().toISOString();
					console.log(`[${completionTimestamp}]  ✅ Updated: ${docInfo.title}`);
				}

			} catch (error) {
				console.error(`Failed to regenerate document ${docInfo.title}:`, error);
				docsFailed++;
			}
		}

		console.log(`📊 [RESULTS] Updated: ${docsUpdated} docs | Failed: ${docsFailed} docs`);

		result.success = docsFailed === 0;
		const duration = ((Date.now() - startTime) / 1000).toFixed(1);
		console.log(`✅ [COMPLETE] Automation finished in ${duration}s`);
		return result;
	} catch (error: any) {
		result.errors.push(error.message || String(error));

		// Provide more helpful error messages for common issues
		let errorMessage = error.message || String(error);
		if (errorMessage.includes('LLM gateway configuration is missing')) {
			errorMessage += '\n💡 SOLUTION: Configure VERCEL_AI_GATEWAY_URL and VERCEL_AI_GATEWAY_API_KEY in your environment variables.';
		} else if (errorMessage.includes('LLM API call failed')) {
			errorMessage += '\n💡 SOLUTION: Check your AI gateway configuration and API key validity.';
		}

		console.error(`❌ [ERROR] Automation failed: ${errorMessage}`);
	}

	// Log completion summary
	const duration = ((Date.now() - startTime) / 1000).toFixed(1);
	const status = result.success ? '✅ [SUCCESS]' : '❌ [FAILED]';
	console.log(`${status} ${repo.name} (${duration}s)`);

	if (result.errors.length > 0) {
		console.log(`❌ [ISSUES] ${result.errors.join(' | ')}`);
	}
	if (result.skipped) {
		console.log(`⏭️ [SKIPPED] ${result.skipReason}`);
	}

	return result;
}
