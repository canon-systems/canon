import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { analyzeRepository } from './analyzeRepository';
import { generateDocumentation } from './docGenerator';
import { generateArchitectureDiagram } from './diagramGenerator';
import { trackRepoScan, trackDocGenerated, trackDiagramGenerated } from './usageTracking';
import { detectRepositoryChanges } from './changeDetector';
import { analyzeChangeSignificance } from './changeSignificanceAnalyzer';
import { updateTrackedFilesForRenames } from './fileRenameHandler';
import { prepareFileSummaries, generateAndSaveFileSummaries } from './prepareSummaries';
import { prepareRepoSummaries } from './prepareRepoSummaries';
import { LLMGateway } from './llmGateway';
import { FileSummaryManager } from './fileSummaryManager';
import { getUserOctokit } from '../github/getUserOctokit';
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
	console.log(`\n🚀 STARTING AUTOMATION: ${repo.name} (${ruleName})`);
	console.log(`═══════════════════════════════════════════════════════════════`);

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
		// STEP 0: Pre-flight check - validate AI service
		try {
			new LLMGateway();
			console.log(`✅ STEP 0: AI service available`);
		} catch (error: any) {
			console.error(`❌ AI service unavailable: ${error.message}`);
			result.errors.push(`AI service configuration error: ${error.message}`);
			return result;
		}

		// STEP 1: Check if repository is set up for efficient automation
		const { data: repoSetup, error: setupError } = await supabase
			.from('repository_setup')
			.select('setup_status, last_analyzed')
			.eq('repo_id', repo.id)
			.single();

		if (setupError || !repoSetup || repoSetup.setup_status !== 'ready') {
			console.log(`⚠️ Repository not set up for efficient automation - skipping`);
			result.skipped = true;
			result.skipReason = 'Repository not set up for automation. Please run repository setup first.';
			result.success = true;
			return result;
		}

		console.log(`✅ Repository ready for automation`);

		const settings = repo.settings || {};
		const subdir = settings.subdir || null;
		const filters = settings.filters || null;
		const promptConfig = settings.prompt_config || null;

		// STEP 2: Detect changes since last analysis
		console.log(`📊 STEP 2: Detecting changes...`);

		const changeDetectionStart = Date.now();
		const changes = await detectRepositoryChanges({
			supabase,
			userId,
			repoUrl: repo.repo_url,
			branch: repo.default_branch,
		});

		const changedFiles = [
			...changes.files_changed.map(f => f.path),
			...changes.files_added,
		];

		const changeDetectionTime = ((Date.now() - changeDetectionStart) / 1000).toFixed(1);
		console.log(`✅ Found ${changedFiles.length} changed files (${changeDetectionTime}s)`);

		if (changedFiles.length === 0) {
			console.log(`⏭️ No changes detected - skipping regeneration`);
			result.skipped = true;
			result.skipReason = 'No file changes detected';
			result.success = true;
			return result;
		}

		result.actions.push('detect_changes');

		// STEP 3: Identify affected documents
		console.log(`🔍 STEP 3: Identifying affected documents...`);

		// Get all documents for this repo
		const { data: repoDocs, error: docsError } = await supabase
			.from('documents')
			.select('id, title, repo_id')
			.eq('repo_id', repo.id);

		if (docsError) {
			console.error('Failed to get documents:', docsError);
			result.errors.push('Failed to identify affected documents');
			return result;
		}

		// Get document files for all documents
		const docIds = (repoDocs || []).map(d => d.id);
		const { data: allDocFiles, error: filesError } = docIds.length > 0
			? await supabase
				.from('document_files')
				.select('document_id, file_path')
				.in('document_id', docIds)
				.in('file_path', changedFiles)
			: { data: null, error: null };

		if (filesError) {
			console.error('Failed to get document files:', filesError);
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

		console.log(`📄 Found ${affectedDocs.size} documents affected by ${changedFiles.length} file changes`);

		if (affectedDocs.size === 0) {
			console.log(`⏭️ No documents affected by changes - skipping regeneration`);
			result.skipped = true;
			result.skipReason = 'No documents affected by file changes';
			result.success = true;
			return result;
		}

		// STEP 4: Regenerate summaries for changed and new files using FileSummaryManager
		const totalFilesToProcess = changes.files_changed.length + changes.files_added.length;
		if (rule.update_mode !== 'incremental_update' && totalFilesToProcess > 0) {
			console.log(`📝 STEP 4: Processing ${totalFilesToProcess} files (${changes.files_changed.length} changed, ${changes.files_added.length} new)...`);

			const summaryStartTime = Date.now();

			// Get current file contents for changed and new files
			const octokit = await getUserOctokit(supabase, userId);
			const parsed = parseRepoUrl(repo.repo_url);
			if (!parsed) {
				throw new Error(`Invalid repo URL: ${repo.repo_url}`);
			}

			const { owner, repo: repoName } = parsed;
			const currentCommitSha = changes.current_commit_sha;

			// Collect all files that need processing with their content
			const filesToProcess: Array<{ path: string; content: string; hash?: string }> = [];

			// Process changed files
			if (changes.files_changed.length > 0) {
				console.log(`🔄 Collecting ${changes.files_changed.length} changed files...`);
				for (const changedFile of changes.files_changed) {
					try {
						const { data: fileData } = await octokit.repos.getContent({
							owner,
							repo: repoName,
							path: changedFile.path,
							ref: currentCommitSha,
						});

						let fileContent = '';
						if (!Array.isArray(fileData) && fileData.type === 'file' && fileData.content) {
							fileContent = fileData.encoding === 'base64'
								? Buffer.from(fileData.content, 'base64').toString('utf-8')
								: fileData.content;
						}

						if (fileContent) {
							filesToProcess.push({
								path: changedFile.path,
								content: fileContent,
								hash: changedFile.new_hash || undefined,
							});
						}
					} catch (error) {
						console.error(`Failed to get content for changed file ${changedFile.path}:`, error);
					}
				}
			}

			// Process new files
			if (changes.files_added.length > 0) {
				console.log(`🆕 Collecting ${changes.files_added.length} new files...`);
				for (const newFilePath of changes.files_added) {
					try {
						const { data: fileData } = await octokit.repos.getContent({
							owner,
							repo: repoName,
							path: newFilePath,
							ref: currentCommitSha,
						});

						let fileContent = '';
						if (!Array.isArray(fileData) && fileData.type === 'file' && fileData.content) {
							fileContent = fileData.encoding === 'base64'
								? Buffer.from(fileData.content, 'base64').toString('utf-8')
								: fileData.content;
						}

						if (fileContent) {
							// Calculate hash for the new file
							const fileHash = createHash('sha256').update(fileContent).digest('hex');
							filesToProcess.push({
								path: newFilePath,
								content: fileContent,
								hash: fileHash,
							});
						}
					} catch (error) {
						console.error(`Failed to get content for new file ${newFilePath}:`, error);
					}
				}
			}

			// Use FileSummaryManager for proper deduplication and batch processing
			if (filesToProcess.length > 0) {
				const summaryManager = new FileSummaryManager(
					supabase,
					normalizeRepoId(repo.repo_url),
					repo.default_branch
				);

				console.log(`📊 Processing ${filesToProcess.length} files with FileSummaryManager...`);

				const result = await summaryManager.updateSummariesIfNeeded(
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
				console.log(`   - Processed: ${result.processed} files`);
				console.log(`   - Skipped: ${result.skipped} files (already up-to-date)`);
				console.log(`   - Failed: ${result.failed} files`);
				console.log(`   - Total: ${result.total} files`);

				if (result.updatedFiles.length > 0) {
					console.log(`📁 Updated files: ${result.updatedFiles.slice(0, 5).join(', ')}${result.updatedFiles.length > 5 ? ` ... and ${result.updatedFiles.length - 5} more` : ''}`);
				}
			} else {
				console.log(`ℹ️ No files collected for processing`);
			}

			const summaryTime = ((Date.now() - summaryStartTime) / 1000).toFixed(1);
			console.log(`⏱️ STEP 4 completed in ${summaryTime}s`);
		} else {
			console.log(`⏭️ STEP 4: Skipping summary regeneration (${rule.update_mode})`);
		}

		// STEP 5: Regenerate affected documents
		console.log(`🔄 STEP 5: Regenerating ${affectedDocs.size} affected documents...`);

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

					docsUpdated++;
					const timestamp = new Date().toISOString();
					console.log(`[${timestamp}]  ✅ Updated: ${docInfo.title}`);
				}

			} catch (error) {
				console.error(`Failed to regenerate document ${docInfo.title}:`, error);
				docsFailed++;
			}
		}

		console.log(`📊 Results: ${docsUpdated} docs updated, ${docsFailed} docs failed`);

		result.success = docsFailed === 0;
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

		console.error(`[automationRunner] ❌ Automation failed: ${errorMessage}`);
	}

	// Log completion summary
	const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
	const actions = result.actions.length > 0 ? ` (${result.actions.join(', ')})` : '';
	console.log(`\n${status}: ${repo.name}${actions}`);

	if (result.errors.length > 0) {
		console.log(`❌ Issues: ${result.errors.join(' | ')}`);
	}
	if (result.skipped) {
		console.log(`⏭️ Skipped: ${result.skipReason}`);
	}
	console.log(`═══════════════════════════════════════════════════════════════\n`);

	return result;
}
