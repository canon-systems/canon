import type { SupabaseClient } from '@supabase/supabase-js';
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
import { generateFileSummary } from './fileSummarizer';
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

		// STEP 4: Regenerate summaries for changed files
		if (rule.update_mode !== 'incremental_update' && changes.files_changed.length > 0) {
			console.log(`📝 STEP 4: Regenerating summaries for ${changes.files_changed.length} changed files...`);

			const summaryStartTime = Date.now();

			// Get current file contents for changed files
			const octokit = await getUserOctokit(supabase, userId);
			const parsed = parseRepoUrl(repo.repo_url);
			if (!parsed) {
				throw new Error(`Invalid repo URL: ${repo.repo_url}`);
			}

			const { owner, repo: repoName } = parsed;
			const currentCommitSha = changes.current_commit_sha;

			// Regenerate summaries for changed files
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
						const summary = await generateFileSummary(fileContent, changedFile.path, 'gpt-4o-mini');

						// Update summary in database
						const { error: upsertError } = await supabase.rpc('upsert_repo_file_summary', {
							p_repo_id: normalizeRepoId(repo.repo_url),
							p_file_path: changedFile.path,
							p_file_hash: changedFile.new_hash,
							p_summary_text: summary.summary_text,
							p_summary_json: summary.summary_json,
							p_summary_model: 'gpt-4o-mini',
							p_user_id: userId,
							// p_submission_id omitted - submissions table no longer exists
							p_branch: repo.default_branch,
							// Note: p_last_regenerated and p_regeneration_reason are handled by the function automatically
						});

						if (upsertError) {
							console.error(`Failed to update summary for ${changedFile.path}:`, upsertError);
						}
					}
				} catch (error) {
					console.error(`Failed to regenerate summary for ${changedFile.path}:`, error);
				}
			}

			const summaryTime = ((Date.now() - summaryStartTime) / 1000).toFixed(1);
			console.log(`✅ Regenerated summaries in ${summaryTime}s`);
		} else {
			console.log(`⏭️ STEP 4: Skipping summary regeneration (${rule.update_mode})`);
		}

		// STEP 5: Regenerate affected documents
		console.log(`🔄 STEP 5: Regenerating ${affectedDocs.size} affected documents...`);

		let docsUpdated = 0;
		let docsFailed = 0;

		for (const [docId, docInfo] of affectedDocs) {
			try {
				console.log(`  ↳ Regenerating: ${docInfo.title}`);

				// Get all files related to this document
				const { data: allDocFiles, error: allFilesError } = await supabase
					.from('document_files')
					.select('file_path')
					.eq('document_id', docId);

				if (allFilesError || !allDocFiles) {
					console.error(`Failed to get files for doc ${docId}:`, allFilesError);
					docsFailed++;
					continue;
				}

				const relatedFiles = allDocFiles.map(f => f.file_path);

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
					console.log(`  ✅ Updated: ${docInfo.title}`);
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
