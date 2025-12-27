import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeRepository } from './analyzeRepository';
import { generateDocumentation } from './docGenerator';
import { trackArchitectureDiagram, trackDocGenerated, trackPushToKb } from './usageTracking';
import { LLMGateway } from './llmGateway';
import { FileSummaryManager } from './fileSummaryManager';
import { parseRepoUrl } from '../github/github';
import { TreeSitterAnalyzer } from './treeSitterAnalyzer';
import { getWorkspaceProvider } from '../workspaces/workspaceFactory';
import type { WorkspaceInfo } from '../workspaces/base';

const ARCHITECTURE_SUPPORTED_EXTENSIONS = new Set([
	'js',
	'ts',
	'tsx',
	'jsx',
	'py',
	'java',
	'go',
	'rs',
	'cpp',
	'c',
	'cs',
	'php',
	'rb',
]);

const ARCHITECTURE_MANIFEST_SUFFIXES = [
	'package.json',
	'requirements.txt',
	'pipfile',
	'pyproject.toml',
	'go.mod',
	'cargo.toml',
	'pom.xml',
	'build.gradle',
	'build.gradle.kts',
	'composer.json',
	'gemfile',
	'gemfile.lock',
	'.csproj',
	'package.swift',
];

function isArchitectureCodeFile(filePath: string): boolean {
	const ext = filePath.split('.').pop()?.toLowerCase();
	return Boolean(ext && ARCHITECTURE_SUPPORTED_EXTENSIONS.has(ext));
}

function isManifestFile(filePath: string): boolean {
	const lower = filePath.toLowerCase();
	return ARCHITECTURE_MANIFEST_SUFFIXES.some(suffix => lower.endsWith(suffix));
}

async function getProviderConnectionId(
	supabase: SupabaseClient,
	workspaceId: string,
	provider: string,
	desiredConnectionId?: string | null
): Promise<string | null> {
	let query = supabase
		.from('oauth_connections')
		.select('connection_id, status')
		.eq('user_id', workspaceId)
		.eq('provider', provider)
		.eq('status', 'active')
		.limit(1);

	if (desiredConnectionId) {
		query = query.eq('connection_id', desiredConnectionId);
	}

	const { data, error } = await query.maybeSingle();
	if (error) {
		console.error(`❌ [PUBLISH] Failed to load connection for ${provider}:`, error);
		return null;
	}

	return data?.connection_id || null;
}

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
	triggerType?: 'scheduled' | 'manual';
};

export async function executeAutomationRule({
	supabase,
	repo,
	rule,
	userId,
	triggerType = 'scheduled',
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
	filesProcessed?: number;
	documentsUpdated?: number;
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
		filesProcessed: 0,
		documentsUpdated: 0,
	};

	const actionPreset = rule.action_preset || 'docs_only';
	const targetDiagramTypes = Array.isArray(rule.target_diagrams) ? rule.target_diagrams.filter(Boolean) : [];
	const shouldGenerateDiagrams =
		rule.generate_diagram === true ||
		targetDiagramTypes.length > 0 ||
		actionPreset === 'diagrams_only' ||
		actionPreset === 'docs_and_diagrams' ||
		actionPreset === 'full_auto_publish';
	const shouldGenerateDocs = actionPreset !== 'diagrams_only' && rule.generate_doc !== false;
	const desiredDiagramTypes = targetDiagramTypes.length > 0 ? targetDiagramTypes : ['architecture'];
	const generatedDiagrams: Array<{ id: string; type: string; title?: string; isNew?: boolean; updatedAt?: string }> = [];
	let diagramGenerated = false;
	const shouldAutoPublish = actionPreset === 'full_auto_publish' || rule.auto_publish === true;
	const autoPublishTarget = rule.auto_publish_target || null;

	try {
		// 🔍 Pre-flight checks
		try {
			new LLMGateway();
			console.log(`✅ [CHECK] AI service available`);
		} catch (error: any) {
			console.error(`❌ [ERROR] AI service unavailable: ${error.message}`);
			result.errors.push(`AI service configuration error: ${error.message}`);
			await insertAutomationRun(supabase, {
				repoId: repo.id,
				ruleId: rule.rule_id || rule.id || ruleName,
				workspaceId: userId,
				triggerType,
				success: false,
				skipped: false,
				actions: result.actions,
				executionTimeMs: Date.now() - startTime,
				filesProcessed: 0,
				documentsUpdated: 0,
				errors: result.errors,
			});
			return result;
		}

		// 🔍 Repository validation
		const { data: repoSetup, error: setupError } = await supabase
			.from('repository_setup')
			.select('setup_status, last_analyzed, branch')
			.eq('repo_id', repo.id)
			.single();

		if (setupError || !repoSetup || repoSetup.setup_status !== 'ready') {
			console.log(`⚠️ [SKIP] Repository not set up for automation`);
			result.skipped = true;
			result.skipReason = 'Repository not set up for automation. Please run repository setup first.';
			result.success = true;
			await insertAutomationRun(supabase, {
				repoId: repo.id,
				ruleId: rule.rule_id || rule.id || ruleName,
				workspaceId: userId,
				triggerType,
				success: true,
				skipped: true,
				skipReason: result.skipReason,
				actions: result.actions,
				executionTimeMs: Date.now() - startTime,
				filesProcessed: 0,
				documentsUpdated: 0,
				errors: result.errors,
			});
			return result;
		}

		console.log(`✅ [CHECK] Repository ready for automation`);
		const repoBranch = repoSetup?.branch || repo.default_branch;

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
			branch: repoBranch,
			subdir: null,
			filters: null,
		});

		if (!analysis.success || !analysis.rawFiles) {
			console.error(`❌ [ERROR] Failed to analyze repository:`, analysis.message);
			result.errors.push('Failed to analyze repository for file processing');
			await insertAutomationRun(supabase, {
				repoId: repo.id,
				ruleId: rule.rule_id || rule.id || ruleName,
				workspaceId: userId,
				triggerType,
				success: false,
				skipped: false,
				actions: result.actions,
				executionTimeMs: Date.now() - startTime,
				filesProcessed: 0,
				documentsUpdated: 0,
				errors: result.errors,
			});
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
				repoBranch
			);

			console.log(`📊 Processing ${filesToProcess.length} files with FileSummaryManager...`);

			summaryResult = await summaryManager.updateSummariesIfNeeded(
				filesToProcess,
				{
					force: false,
					batchSize: 20,
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

		// STEP 5: Regenerate architecture diagrams when configured
		const updatedFiles = (summaryResult && filesToProcess.length > 0) ? summaryResult.updatedFiles : [];

		if (shouldGenerateDiagrams && analysis.rawFiles) {
			const wantsArchitecture = desiredDiagramTypes.includes('architecture');
			if (wantsArchitecture) {
				const architectureFiles = analysis.rawFiles.filter(file => isArchitectureCodeFile(file.path));
				const manifestFiles = analysis.rawFiles.filter(file => isManifestFile(file.path));
				const architectureChanges = updatedFiles.filter((path: string) => isArchitectureCodeFile(path));
				let existingDiagram: { id: string; title?: string; updated_at?: string } | null = null;

				if (architectureFiles.length === 0) {
					console.log(`⚠️ [DIAGRAMS] No supported code files found for architecture analysis`);
				} else {
					const { data: existing, error: findError } = await supabase
						.from('diagrams')
						.select('id, title, updated_at')
						.eq('repo_id', repo.id)
						.eq('diagram_type', 'architecture')
						.single();

					if (!findError && existing) {
						existingDiagram = existing;
					}

					const shouldRegenerateDiagram = architectureChanges.length > 0 || !existingDiagram;

					if (shouldRegenerateDiagram) {
						try {
							const analyzer = new TreeSitterAnalyzer();
							const architectureAnalysis = await analyzer.analyzeRepository(
								supabase,
								repo.id,
								architectureFiles,
								manifestFiles
							);

							let diagram;
							let isNew = false;

							if (existingDiagram) {
								const { data: updatedDiagram, error: updateError } = await supabase
									.from('diagrams')
									.update({
										title: `Architecture Diagram - ${repo.name}`,
										content: architectureAnalysis.mermaid,
										analysis_data: architectureAnalysis,
										updated_at: new Date().toISOString(),
									})
									.eq('id', existingDiagram.id)
									.select()
									.single();

								if (updateError) {
									throw updateError;
								}

								diagram = updatedDiagram;
							} else {
								const { data: insertedDiagram, error: insertError } = await supabase
									.from('diagrams')
									.insert({
										repo_id: repo.id,
										title: `Architecture Diagram - ${repo.name}`,
										diagram_type: 'architecture',
										content: architectureAnalysis.mermaid,
										analysis_data: architectureAnalysis,
									})
									.select()
									.single();

								if (insertError) {
									throw insertError;
								}

								diagram = insertedDiagram;
								isNew = true;
							}

							if (diagram) {
								diagramGenerated = true;
								result.diagramId = diagram.id;
								result.actions.push('generate_architecture_diagram');
								generatedDiagrams.push({
									id: diagram.id,
									type: 'architecture',
									title: diagram.title,
									isNew,
									updatedAt: diagram.updated_at || new Date().toISOString(),
								});

								try {
									await trackArchitectureDiagram(
										supabase,
										userId,
										repo.id,
										diagram.id,
										isNew,
										repo.repo_url,
										repoBranch
									);
								} catch (trackingError) {
									console.warn(`⚠️ [DIAGRAMS] Failed to track architecture diagram event:`, trackingError);
								}

								console.log(`✅ [DIAGRAMS] Architecture diagram ${isNew ? 'created' : 'updated'} (id: ${diagram.id})`);
							}
						} catch (diagramError: any) {
							const message = diagramError?.message || 'Failed to generate architecture diagram';
							console.error(`❌ [DIAGRAMS] ${message}`, diagramError);
							result.errors.push(message);
						}
					} else {
						console.log(`⏭️ [DIAGRAMS] No architecture code changes detected; skipping diagram regeneration`);
					}
				}
			}
		}

		// If documents are not part of this rule, finalize early
		if (!shouldGenerateDocs) {
			result.filesProcessed = summaryResult?.processed || 0;
			result.documentsUpdated = 0;
			result.success = result.errors.length === 0;
			if (!diagramGenerated) {
				result.skipped = true;
				result.skipReason = 'No architecture diagram changes detected';
			}

			await insertAutomationRun(supabase, {
				repoId: repo.id,
				ruleId: rule.rule_id || rule.id || ruleName,
				workspaceId: userId,
				triggerType,
				success: result.success,
				skipped: result.skipped,
				skipReason: result.skipReason,
				actions: result.actions,
				docId: result.docId,
				diagramId: result.diagramId,
				publishStatus: result.publishStatus,
				publishProvider: result.publishProvider,
				publishResourceId: result.publishResourceId,
				executionTimeMs: Date.now() - startTime,
				filesProcessed: result.filesProcessed,
				documentsUpdated: result.documentsUpdated,
				errors: result.errors,
				generatedDiagrams,
			});

			return result;
		}

		// STEP 6: Regenerate affected documents based on files that were actually updated
		console.log(`🔄 STEP 6: Regenerating documents based on ${updatedFiles.length} updated files...`);

		// Get all documents for this repo
		const { data: repoDocs, error: docsError } = await supabase
			.from('documents')
			.select('id, title, repo_id')
			.eq('repo_id', repo.id);

		if (docsError) {
			console.error(`❌ [ERROR] Failed to get documents:`, docsError);
			result.errors.push('Failed to identify affected documents');
			result.filesProcessed = summaryResult?.processed || 0;
			await insertAutomationRun(supabase, {
				repoId: repo.id,
				ruleId: rule.rule_id || rule.id || ruleName,
				workspaceId: userId,
				triggerType,
				success: false,
				skipped: false,
				actions: result.actions,
				docId: result.docId,
				diagramId: result.diagramId,
				executionTimeMs: Date.now() - startTime,
				filesProcessed: result.filesProcessed,
				documentsUpdated: 0,
				errors: result.errors,
				generatedDiagrams,
			});
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
			result.filesProcessed = summaryResult?.processed || 0;
			await insertAutomationRun(supabase, {
				repoId: repo.id,
				ruleId: rule.rule_id || rule.id || ruleName,
				workspaceId: userId,
				triggerType,
				success: false,
				skipped: false,
				actions: result.actions,
				docId: result.docId,
				diagramId: result.diagramId,
				executionTimeMs: Date.now() - startTime,
				filesProcessed: result.filesProcessed,
				documentsUpdated: 0,
				errors: result.errors,
				generatedDiagrams,
			});
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
			result.filesProcessed = summaryResult?.processed || 0;
			result.documentsUpdated = 0;
			result.success = result.errors.length === 0;

			if (!diagramGenerated) {
				result.skipped = true;
				result.skipReason = 'No documents affected by file updates';
			}

			await insertAutomationRun(supabase, {
				repoId: repo.id,
				ruleId: rule.rule_id || rule.id || ruleName,
				workspaceId: userId,
				triggerType,
				success: result.success,
				skipped: result.skipped,
				skipReason: result.skipReason,
				actions: result.actions,
				docId: result.docId,
				diagramId: result.diagramId,
				executionTimeMs: Date.now() - startTime,
				filesProcessed: result.filesProcessed,
				documentsUpdated: result.documentsUpdated,
				errors: result.errors,
				generatedDiagrams,
			});
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
					branch: repoBranch,
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
					branch: repoBranch,
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

					await trackDocGenerated(supabase, userId, docId, repo.id, false);

					if (shouldAutoPublish) {
						const provider = autoPublishTarget?.provider;
						const targetResourceId = autoPublishTarget?.resource_id || autoPublishTarget?.resourceId;
						const connectionIdOverride = autoPublishTarget?.connection_id || autoPublishTarget?.connectionId;

						if (!provider) {
							console.warn(`⚠️ [PUBLISH] Auto-publish enabled but no provider configured`);
						} else {
							const providerImpl = getWorkspaceProvider(provider);
							if (!providerImpl) {
								console.warn(`⚠️ [PUBLISH] Unsupported provider: ${provider}`);
							} else if (!targetResourceId) {
								console.warn(`⚠️ [PUBLISH] Missing target resource for provider ${provider}`);
							} else {
								const connectionId = await getProviderConnectionId(
									supabase,
									userId,
									provider,
									connectionIdOverride
								);

								if (!connectionId) {
									console.warn(`⚠️ [PUBLISH] No active connection found for provider ${provider}`);
								} else {
									const workspaceInfo: WorkspaceInfo = {
										provider,
										resourceId: targetResourceId,
										metadata: autoPublishTarget?.metadata || {},
									};

									try {
										const pushed = await providerImpl.pushContent(
											workspaceInfo,
											{
												title: docInfo.title,
												markdown: docResult.markdown,
											},
											connectionId,
											true
										);

										if (pushed) {
											result.publishStatus = 'success';
											result.publishProvider = provider;
											result.publishResourceId = pushed.resourceId || targetResourceId;

											await supabase
												.from('documents')
												.update({
													kb_provider: provider,
													kb_id: pushed.resourceId || targetResourceId,
													updated_at: new Date().toISOString(),
												})
												.eq('id', docId);

											await trackPushToKb(
												supabase,
												userId,
												provider,
												docId,
												pushed.resourceId || targetResourceId
											);
										} else {
											result.publishStatus = 'failed';
											result.publishProvider = provider;
											result.errors.push(`Failed to publish document ${docInfo.title} to ${provider}`);
											console.warn(`⚠️ [PUBLISH] Failed to push document ${docId} to ${provider}`);
										}
									} catch (publishError: any) {
										result.publishStatus = 'failed';
										result.publishProvider = provider;
										result.errors.push(publishError?.message || `Publish failed for provider ${provider}`);
										console.error(`❌ [PUBLISH] Error pushing document ${docId} to ${provider}:`, publishError);
									}
								}
							}
						}
					}
				}

			} catch (error) {
				console.error(`Failed to regenerate document ${docInfo.title}:`, error);
				docsFailed++;
			}
		}

		console.log(`📊 [RESULTS] Updated: ${docsUpdated} docs | Failed: ${docsFailed} docs`);

		result.success = docsFailed === 0 && result.errors.length === 0;
		result.filesProcessed = summaryResult?.processed || 0;
		result.documentsUpdated = docsUpdated;

		// Store the first updated doc ID if any were updated
		if (docsUpdated > 0 && affectedDocs.size > 0) {
			const firstDocId = Array.from(affectedDocs.keys())[0];
			result.docId = firstDocId;
		}

		const duration = ((Date.now() - startTime) / 1000).toFixed(1);
		console.log(`✅ [COMPLETE] Automation finished in ${duration}s`);

		// Insert into automation_runs table
		await insertAutomationRun(supabase, {
			repoId: repo.id,
			ruleId: rule.rule_id || rule.id || ruleName,
			workspaceId: userId,
			triggerType,
			success: result.success,
			skipped: result.skipped,
			skipReason: result.skipReason,
			actions: result.actions,
			docId: result.docId,
			diagramId: result.diagramId,
			publishStatus: result.publishStatus,
			publishProvider: result.publishProvider,
			publishResourceId: result.publishResourceId,
			executionTimeMs: Date.now() - startTime,
			filesProcessed: result.filesProcessed,
			documentsUpdated: result.documentsUpdated,
			errors: result.errors,
			generatedDiagrams,
		});

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

	// Insert into automation_runs table even on error/skip
	await insertAutomationRun(supabase, {
		repoId: repo.id,
		ruleId: rule.rule_id || rule.id || ruleName,
		workspaceId: userId,
		triggerType,
		success: result.success,
		skipped: result.skipped,
		skipReason: result.skipReason,
		actions: result.actions,
		docId: result.docId,
		diagramId: result.diagramId,
		publishStatus: result.publishStatus,
		publishProvider: result.publishProvider,
		publishResourceId: result.publishResourceId,
		executionTimeMs: Date.now() - startTime,
		filesProcessed: result.filesProcessed,
		documentsUpdated: result.documentsUpdated,
		errors: result.errors,
		generatedDiagrams,
	});

	return result;
}

/**
 * Insert a record into the automation_runs table
 */
async function insertAutomationRun(
	supabase: SupabaseClient,
	data: {
		repoId: string;
		ruleId: string;
		workspaceId: string;
		triggerType: 'scheduled' | 'manual';
		success: boolean;
		skipped?: boolean;
		skipReason?: string;
		actions: string[];
		docId?: string | null;
		diagramId?: string | null;
		publishStatus?: string;
		publishProvider?: string;
		publishResourceId?: string;
		executionTimeMs: number;
		filesProcessed: number;
		documentsUpdated: number;
		errors: string[];
		significanceAnalysis?: any;
		generatedDocuments?: any[];
		generatedDiagrams?: any[];
		previewUrl?: string;
	}
): Promise<void> {
	try {
		const { error } = await supabase
			.from('automation_runs')
			.insert({
				repo_id: data.repoId,
				rule_id: data.ruleId,
				workspace_id: data.workspaceId,
				executed_at: new Date().toISOString(),
				trigger_type: data.triggerType,
				success: data.success,
				skipped: data.skipped || false,
				skip_reason: data.skipReason || null,
				actions: data.actions,
				doc_id: data.docId || null,
				diagram_id: data.diagramId || null,
				publish_status: data.publishStatus || null,
				publish_provider: data.publishProvider || null,
				publish_resource_id: data.publishResourceId || null,
				execution_time_ms: data.executionTimeMs,
				files_processed: data.filesProcessed,
				documents_updated: data.documentsUpdated,
				errors: data.errors.length > 0 ? data.errors : [],
				significance_analysis: data.significanceAnalysis || null,
				generated_documents: data.generatedDocuments || [],
				generated_diagrams: data.generatedDiagrams || [],
				preview_url: data.previewUrl || null,
			});

		if (error) {
			console.error(`❌ [ERROR] Failed to insert automation run:`, error);
		} else {
			console.log(`✅ [TRACKING] Automation run recorded in database`);
		}
	} catch (error: any) {
		console.error(`❌ [ERROR] Exception inserting automation run:`, error);
	}
}
