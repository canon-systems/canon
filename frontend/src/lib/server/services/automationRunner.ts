import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeRepository } from './analyzeRepository';
import { generateDocumentation } from './docGenerator';
import { generateArchitectureDiagram } from './diagramGenerator';
import { trackRepoScan, trackDocGenerated, trackDiagramGenerated } from './usageTracking';
import { detectRepositoryChanges } from './changeDetector';
import { analyzeChangeSignificance } from './changeSignificanceAnalyzer';
import { updateTrackedFilesForRenames } from './fileRenameHandler';
import { prepareFileSummaries } from './prepareSummaries';

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
		const settings = repo.settings || {};
		const subdir = settings.subdir || null;
		const filters = settings.filters || null;
		const promptConfig = settings.prompt_config || null;

		// Check if we should detect changes first (if auto_publish is enabled)
		if (rule.auto_publish && rule.detect_changes !== false) {
			// Get the last submission for this repo and rule to compare against
			const ruleId = rule.id || rule.name;
			const { data: lastSubmission } = await supabase
				.from('submissions')
				.select('id, selected_files, code_snapshot, source_meta')
				.eq('source_meta->>repoId', repo.id)
				.eq('source_meta->>automation_rule_id', ruleId)
				.order('created_at', { ascending: false })
				.limit(1)
				.single();

			if (lastSubmission?.id) {
				// Detect changes
				const changeDetection = await detectRepositoryChanges({
					supabase,
					userId,
					repoUrl: repo.repo_url,
					branch: repo.default_branch,
					submissionId: lastSubmission.id,
				});

				result.actions.push('detect_changes');

				// Handle renames first - auto-update tracked files
				if (changeDetection.files_renamed && changeDetection.files_renamed.length > 0) {
					const renameResult = await updateTrackedFilesForRenames(
						supabase,
						lastSubmission.id,
						changeDetection.files_renamed
					);

					if (renameResult.updated) {
						console.log(`Auto-updated tracked files for renames:`,
							changeDetection.files_renamed.map(r => `${r.old_path} → ${r.new_path}`)
						);

						// Reload submission with updated file list
						const { data: updatedSubmission } = await supabase
							.from('submissions')
							.select('selected_files')
							.eq('id', lastSubmission.id)
							.single();

						if (updatedSubmission) {
							lastSubmission.selected_files = updatedSubmission.selected_files || [];
						}
					}
				}

				// Filter changes to only files that were in the original doc (file-level checking)
				const trackedFiles = new Set(lastSubmission.selected_files || []);

				// Include renamed files in relevant changes
				const relevantRenames = changeDetection.files_renamed.filter(rename =>
					trackedFiles.has(rename.old_path) || trackedFiles.has(rename.new_path)
				);

				const relevantChanges = changeDetection.files_changed.filter(change => {
					if (change.status === 'renamed') {
						return trackedFiles.has(change.old_path!) || trackedFiles.has(change.path);
					}
					return trackedFiles.has(change.path);
				});

				// Also check if any tracked files were removed
				const relevantRemovals = changeDetection.files_removed.filter(path =>
					trackedFiles.has(path)
				);

				// If there are relevant changes, analyze their significance
				if (relevantChanges.length > 0 || relevantRenames.length > 0 || relevantRemovals.length > 0) {
					// Renames are always significant - they change file paths
					if (relevantRenames.length > 0) {
						// Always regenerate for renames
						console.log(`File renames detected: ${relevantRenames.map(r => `${r.old_path} → ${r.new_path}`).join(', ')}`);
					} else {
						// Check significance for other changes
						const significance = await analyzeChangeSignificance(
							supabase,
							userId,
							repo.repo_url,
							repo.default_branch,
							changeDetection.old_commit_sha,
							changeDetection.current_commit_sha,
							relevantChanges.map(change => ({
								path: change.path,
								oldHash: change.old_hash || null,
								newHash: change.new_hash || null,
								old_path: change.old_path,
								status: change.status,
							})),
							{
								model: rule.model || 'gpt-4o-mini',
							}
						);

						result.actions.push('analyze_significance');

						// Apply user-configured significance rules
						const sigConfig = rule.significance_analysis || {};
						const enabled = sigConfig.enabled !== false; // Default to enabled

						if (enabled) {
							// Check sensitivity level
							const sensitivity = sigConfig.sensitivity || 'balanced';
							let shouldSkip = false;

							if (sensitivity === 'strict') {
								// Strict: require both technical AND business changes
								shouldSkip = !(
									significance.technicalChanges.level !== 'none' &&
									significance.businessLogicChanges.level !== 'none'
								);
							} else if (sensitivity === 'balanced') {
								// Balanced: require technical OR business changes
								shouldSkip = !(
									significance.technicalChanges.level !== 'none' ||
									significance.businessLogicChanges.level !== 'none'
								);
							} else if (sensitivity === 'lenient') {
								// Lenient: only skip if truly trivial
								shouldSkip = !significance.isSignificant;
							}

							// Check user requirements
							if (sigConfig.require_technical_changes && significance.technicalChanges.level === 'none') {
								shouldSkip = true;
							}
							if (sigConfig.require_business_changes && significance.businessLogicChanges.level === 'none') {
								shouldSkip = true;
							}

							// Check confidence threshold
							const minConfidence = sigConfig.minimum_confidence || 'medium';
							const confidenceLevels: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 1, high: 2 };
							const currentLevel = confidenceLevels[significance.confidence] || 0;
							const requiredLevel = confidenceLevels[minConfidence as keyof typeof confidenceLevels] || 1;

							if (currentLevel < requiredLevel) {
								// Not confident enough to skip
								shouldSkip = false;
							}

							if (shouldSkip) {
								// Store skip reason for user visibility
								// Check if a skipped entry already exists for this repo+rule
								const skipRuleId = rule.id || rule.name;
								const { data: existingSkipped } = await supabase
									.from('submissions')
									.select('id')
									.eq('created_by', userId)
									.eq('source_meta->>repoId', repo.id)
									.eq('source_meta->>automation_rule_id', skipRuleId)
									.eq('status', 'skipped')
									.order('created_at', { ascending: false })
									.limit(1)
									.single();

								const skipData = {
									title: `${repo.name} - Skipped (${new Date().toLocaleDateString()})`,
									markdown: `## Automation Rule Skipped\n\n**Reason:** ${significance.reason}\n\n**Technical Changes:** ${significance.technicalChanges.level} - ${significance.technicalChanges.description}\n\n**Business Logic Changes:** ${significance.businessLogicChanges.level} - ${significance.businessLogicChanges.description}\n\n**Summary:** ${significance.summary}`,
									status: 'skipped',
									source_meta: {
										repoUrl: repo.repo_url,
										branch: repo.default_branch,
										repoId: repo.id,
										automation_rule_id: rule.id || rule.name,
										skip_reason: significance.reason,
										significance_analysis: significance,
									},
									updated_at: new Date().toISOString(),
								};

								if (existingSkipped?.id) {
									// Update existing skipped entry
									await supabase
										.from('submissions')
										.update(skipData)
										.eq('id', existingSkipped.id);
								} else {
									// Create new skipped entry
									await supabase.from('submissions').insert({
										...skipData,
										created_by: userId,
										input_type: 'github_repo',
										created_at: new Date().toISOString(),
									});
								}

								result.skipped = true;
								result.skipReason = `${significance.reason}. ${significance.summary}`;
								result.success = true;

								console.log(`Skipping regeneration: ${result.skipReason}`);
								console.log(`Technical changes: ${significance.technicalChanges.level} - ${significance.technicalChanges.description}`);
								if (significance.technicalChanges.categories.length > 0) {
									console.log(`Technical categories: ${significance.technicalChanges.categories.join(', ')}`);
								}
								console.log(`Business logic changes: ${significance.businessLogicChanges.level} - ${significance.businessLogicChanges.description}`);
								if (significance.businessLogicChanges.category.length > 0) {
									console.log(`Business categories: ${significance.businessLogicChanges.category.join(', ')}`);
								}
								if (significance.unavailableFiles && significance.unavailableFiles.length > 0) {
									console.log(`⚠️  ${significance.unavailableFiles.length} file(s) unavailable for analysis: ${significance.unavailableFiles.map(f => f.path).join(', ')}`);
								}

								return result;
							}

							// Log exhaustive analysis results
							console.log(`\n=== SIGNIFICANT CHANGES DETECTED (${significance.confidence} confidence) ===`);
							console.log(`Summary: ${significance.summary}`);
							console.log(`\n--- TECHNICAL CHANGES (${significance.technicalChanges.level}) ---`);
							console.log(`Description: ${significance.technicalChanges.description}`);
							if (significance.technicalChanges.categories.length > 0) {
								console.log(`Categories: ${significance.technicalChanges.categories.join(', ')}`);
							}
							if (significance.technicalChanges.examples.length > 0) {
								console.log(`Examples: ${significance.technicalChanges.examples.join('; ')}`);
							}
							console.log(`\n--- BUSINESS LOGIC CHANGES (${significance.businessLogicChanges.level}) ---`);
							console.log(`Description: ${significance.businessLogicChanges.description}`);
							if (significance.businessLogicChanges.category.length > 0) {
								console.log(`Categories: ${significance.businessLogicChanges.category.join(', ')}`);
							}
							if (significance.businessLogicChanges.problemScopeChange) {
								console.log(`Problem Scope: ${significance.businessLogicChanges.problemScopeChange}`);
							}
							if (significance.businessLogicChanges.useCaseChanges && significance.businessLogicChanges.useCaseChanges.length > 0) {
								console.log(`Use Case Changes: ${significance.businessLogicChanges.useCaseChanges.join('; ')}`);
							}
							if (significance.businessLogicChanges.domainLogicChanges && significance.businessLogicChanges.domainLogicChanges.length > 0) {
								console.log(`Domain Logic Changes: ${significance.businessLogicChanges.domainLogicChanges.join('; ')}`);
							}
							if (significance.businessLogicChanges.featureChanges && significance.businessLogicChanges.featureChanges.length > 0) {
								console.log(`Feature Changes: ${significance.businessLogicChanges.featureChanges.join('; ')}`);
							}
							if (significance.businessLogicChanges.workflowChanges && significance.businessLogicChanges.workflowChanges.length > 0) {
								console.log(`Workflow Changes: ${significance.businessLogicChanges.workflowChanges.join('; ')}`);
							}
							if (significance.businessLogicChanges.ruleChanges && significance.businessLogicChanges.ruleChanges.length > 0) {
								console.log(`Rule Changes: ${significance.businessLogicChanges.ruleChanges.join('; ')}`);
							}
							if (significance.businessLogicChanges.calculationChanges && significance.businessLogicChanges.calculationChanges.length > 0) {
								console.log(`Calculation Changes: ${significance.businessLogicChanges.calculationChanges.join('; ')}`);
							}
							if (significance.businessLogicChanges.constraintChanges && significance.businessLogicChanges.constraintChanges.length > 0) {
								console.log(`Constraint Changes: ${significance.businessLogicChanges.constraintChanges.join('; ')}`);
							}
							if (significance.significantChanges.length > 0) {
								console.log(`\n--- SIGNIFICANT FILES ---`);
								significance.significantChanges.forEach(change => {
									console.log(`  - ${change.path} (${change.category}): ${change.reason}`);
								});
							}
							if (significance.unavailableFiles && significance.unavailableFiles.length > 0) {
								console.log(`\n--- UNAVAILABLE FILES (couldn't be analyzed) ---`);
								significance.unavailableFiles.forEach(file => {
									console.log(`  - ${file.path} at ${file.commitSha.substring(0, 7)}: ${file.reason}`);
								});
							}
							console.log(`\n========================================\n`);
						}
					}
				} else if (!changeDetection.has_changes) {
					// No changes at all
					result.skipped = true;
					result.skipReason = 'No changes detected';
					result.success = true;
					return result;
				} else {
					// Changes detected but none in tracked files
					result.skipped = true;
					result.skipReason = 'No changes detected in files used to generate this documentation';
					result.success = true;
					return result;
				}
			}
		}

		// Proceed with generation if we get here
		const analysis = await analyzeRepository({
			supabase,
			userId,
			repoUrl: repo.repo_url,
			branch: repo.default_branch,
			subdir,
			filters,
		});

		// Filter to only tracked files if we have a previous submission
		let filesToUse = analysis.rawFiles || [];
		let submissionIdForSummaries: string | undefined;

		if (rule.auto_publish && rule.detect_changes !== false) {
			const ruleId = rule.id || rule.name;
			const { data: lastSubmission } = await supabase
				.from('submissions')
				.select('id, selected_files')
				.eq('source_meta->>repoId', repo.id)
				.eq('source_meta->>automation_rule_id', ruleId)
				.order('created_at', { ascending: false })
				.limit(1)
				.single();

			if (lastSubmission?.id) {
				submissionIdForSummaries = lastSubmission.id;

				// Prepare summaries before generating docs to avoid token limit issues
				try {
					await prepareFileSummaries(supabase, lastSubmission.id, false, userId);
					result.actions.push('prepare_summaries');
				} catch (summaryError) {
					console.warn('Failed to prepare summaries, will use full content:', summaryError);
					submissionIdForSummaries = undefined;
				}
			}

			if (lastSubmission?.selected_files && lastSubmission.selected_files.length > 0) {
				const trackedFilesSet = new Set(lastSubmission.selected_files);
				filesToUse = filesToUse.filter(file => trackedFilesSet.has(file.path));
			}
		}

		result.actions.push('analyze_repository');

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
			useSummaries: !!submissionIdForSummaries,
			submissionId: submissionIdForSummaries,
		});

		const sourceMeta = {
			repoUrl: repo.repo_url,
			branch: repo.default_branch,
			subdir,
			repoId: repo.id,
			workspaceRepoName: repo.name,
			approval_status: rule.auto_publish ? 'approved' : 'pending_review',
			snapshot: analysis.snapshot,
			automation_rule_id: rule.id || rule.name,
		};

		// Check if an existing submission exists for this repo + rule combination
		// This ensures we UPDATE the existing doc instead of creating duplicates
		const ruleId = rule.id || rule.name;
		const { data: existingSubmission } = await supabase
			.from('submissions')
			.select('id, source_meta')
			.eq('created_by', userId)
			.eq('source_meta->>repoId', repo.id)
			.eq('source_meta->>automation_rule_id', ruleId)
			.neq('status', 'skipped') // Don't update skipped entries
			.order('created_at', { ascending: false })
			.limit(1)
			.single();

		let docId: string | null = null;

		if (existingSubmission?.id) {
			// UPDATE existing submission instead of creating a new one
			console.log(`[automationRunner] Updating existing submission ${existingSubmission.id} for repo ${repo.name}`);

			const { data: updatedSubmission, error: updateError } = await supabase
				.from('submissions')
				.update({
					title: repo.name,
					markdown: docResult.markdown,
					status: 'completed',
					source_meta: sourceMeta,
					code_snapshot: analysis.snapshot,
					selected_files: filesToUse.map(f => f.path),
					summary: docResult.markdown.replace(/\s+/g, ' ').slice(0, 200),
					updated_at: new Date().toISOString(),
					is_outdated: false, // Clear outdated flag since we just regenerated
				})
				.eq('id', existingSubmission.id)
				.select()
				.single();

			if (updateError) {
				console.error(`[automationRunner] Failed to update submission:`, updateError);
				throw new Error(`Failed to update existing submission: ${updateError.message}`);
			}

			docId = updatedSubmission?.id || existingSubmission.id;
			result.actions.push('update_doc');
		} else {
			// CREATE new submission (first time for this repo + rule)
			console.log(`[automationRunner] Creating new submission for repo ${repo.name}`);

			const { data: newSubmission } = await supabase
				.from('submissions')
				.insert({
					created_by: userId,
					title: repo.name,
					markdown: docResult.markdown,
					status: 'completed',
					input_type: 'github_repo',
					source_meta: sourceMeta,
					code_snapshot: analysis.snapshot,
					selected_files: filesToUse.map(f => f.path),
					summary: docResult.markdown.replace(/\s+/g, ' ').slice(0, 200),
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.select()
				.single();

			docId = newSubmission?.id || null;
			result.actions.push('generate_doc');
		}
		result.docId = docId || null;
		await trackRepoScan(supabase, userId, repo.id, repo.repo_url);
		if (docId) {
			await trackDocGenerated(supabase, userId, docId, repo.id);

			// Track publish status if auto_publish is enabled
			if (rule.auto_publish) {
				result.publishStatus = 'approved'; // Doc is auto-approved when auto_publish is enabled
				// Check if there's a target provider configured
				if (rule.auto_publish_target_provider) {
					result.publishProvider = rule.auto_publish_target_provider;
				}
				if (rule.auto_publish_target_resource_id) {
					result.publishResourceId = rule.auto_publish_target_resource_id;
				}
			}
		}

		if (rule.generate_diagram) {
			const diagramResult = await generateArchitectureDiagram({
				supabase,
				userId,
				method: 'github',
				repoUrl: repo.repo_url,
				branch: repo.default_branch,
				subdir,
				files: filesToUse,
				saveDiagram: true,
				title: `${repo.name} Architecture`,
			});

			if (diagramResult.diagram_id) {
				result.diagramId = diagramResult.diagram_id as string;
				await trackDiagramGenerated(supabase, userId, result.diagramId, repo.id);
				result.actions.push('generate_diagram');
			}
		}

		result.success = true;
	} catch (error: any) {
		result.errors.push(error.message || String(error));
	}

	return result;
}

