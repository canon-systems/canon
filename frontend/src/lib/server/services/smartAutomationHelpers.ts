import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeRepository } from './analyzeRepository';
import { generateDocumentation } from './docGenerator';
import { generateArchitectureDiagram } from './diagramGenerator';
import { sendAutomationNotification as sendEmailNotification } from './emailService';

type AutomationResult = {
	success: boolean;
	actions: string[];
	errors: string[];
	generatedDocuments?: Array<{
		id: string;
		title: string;
		changes: 'new' | 'updated' | 'unchanged';
		significance?: any;
	}>;
	generatedDiagrams?: Array<{
		id: string;
		title: string;
		changes: 'new' | 'updated' | 'unchanged';
		significance?: any;
	}>;
	significanceAnalysis?: {
		filesAnalyzed: number;
		significantChanges: number;
		confidence: 'high' | 'medium' | 'low';
		details: any;
	};
	skipped?: boolean;
	skipReason?: string;
	automationId?: string;
	previewUrl?: string;
};

type SmartAutomationRule = {
	id: string;
	name: string;
	action_preset: 'docs_only' | 'diagrams_only' | 'docs_and_diagrams' | 'full_auto_publish';
	significance_analysis: {
		sensitivity: 'strict' | 'balanced' | 'lenient';
		minimum_confidence: 'high' | 'medium' | 'low';
		require_technical_changes?: boolean;
		require_business_changes?: boolean;
	};
	target_documents?: string[];
	target_diagrams?: string[];
	notifications: {
		email_enabled: boolean;
		include_preview_links: boolean;
	};
	publish_targets?: {
		knowledge_bases?: Array<{
			provider: 'notion' | 'confluence' | 'coda';
			id: string;
			name: string;
		}>;
	};
};

/**
 * Process documents in batch based on significance analysis
 */
export async function processDocumentsBatch({
	supabase,
	repo,
	userId,
	changedFiles,
	targetDocuments,
	significanceAnalysis,
	subdir,
	filters,
	promptConfig,
}: {
	supabase: SupabaseClient;
	repo: any;
	userId: string;
	changedFiles: string[];
	targetDocuments?: string[];
	significanceAnalysis: any;
	subdir: any;
	filters: any;
	promptConfig: any;
}): Promise<Array<{ id: string; title: string; changes: 'new' | 'updated' | 'unchanged'; significance?: any }>> {
	const results: Array<{ id: string; title: string; changes: 'new' | 'updated' | 'unchanged'; significance?: any }> = [];

	// Get documents that are affected by changes
	const query = supabase
		.from('documents')
		.select('id, title')
		.eq('repo_id', repo.id);

	if (targetDocuments?.length) {
		query.in('id', targetDocuments);
	}

	const { data: affectedDocuments, error } = await query;

	if (error || !affectedDocuments) {
		console.error('Failed to get affected documents:', error);
		return results;
	}

	// Get document files for all documents
	const docIds = affectedDocuments.map(d => d.id);
	const { data: allDocFiles } = docIds.length > 0
		? await supabase
			.from('document_files')
			.select('document_id, file_path')
			.in('document_id', docIds)
			.in('file_path', changedFiles)
		: { data: null };

	// Group affected documents
	const affectedDocs = new Map();
	affectedDocuments.forEach(doc => {
		const affectedFiles = (allDocFiles || [])
			.filter(df => df.document_id === doc.id)
			.map(df => ({ path: df.file_path, relationship: 'primary' }));

		if (affectedFiles.length > 0) {
			affectedDocs.set(doc.id, {
				docId: doc.id,
				title: doc.title,
				status: 'completed',
				sourceMeta: { repoId: repo.id },
				affectedFiles,
			});
		}
	});

	console.log(`📄 Found ${affectedDocs.size} documents affected by changes`);

	// Process each affected document
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
				continue;
			}

			const relatedFiles = allDocFiles.map(f => f.file_path);

			// Get current content for all related files
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
				continue;
			}

			// Generate updated documentation
			const docResult = await generateDocumentation({
				supabase,
				userId,
				projectName: repo.name,
				model: 'gpt-4o', // Use default model for automation
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
				continue;
			}

			// Create new version
			await supabase.from('document_versions').insert({
				document_id: docId,
				version_number: versionNumber,
				content: docResult.markdown,
				change_summary: `Automated update: ${docInfo.affectedFiles.length} file(s) changed`
			});

			results.push({
				id: docId,
				title: docInfo.title,
				changes: 'updated',
				significance: significanceAnalysis,
			});

			console.log(`  ✅ Updated: ${docInfo.title}`);

		} catch (error) {
			console.error(`Failed to regenerate document ${docInfo.title}:`, error);
			results.push({
				id: docId,
				title: docInfo.title,
				changes: 'unchanged',
				significance: significanceAnalysis,
			});
		}
	}

	return results;
}

/**
 * Process diagrams in batch based on significance analysis
 */
export async function processDiagramsBatch({
	supabase,
	repo,
	userId,
	changedFiles,
	targetDiagrams,
	significanceAnalysis,
	subdir,
	filters,
	promptConfig,
}: {
	supabase: SupabaseClient;
	repo: any;
	userId: string;
	changedFiles: string[];
	targetDiagrams?: string[];
	significanceAnalysis: any;
	subdir: any;
	filters: any;
	promptConfig: any;
}): Promise<Array<{ id: string; title: string; changes: 'new' | 'updated' | 'unchanged'; significance?: any }>> {
	const results: Array<{ id: string; title: string; changes: 'new' | 'updated' | 'unchanged'; significance?: any }> = [];

	// For now, create a simple architecture diagram if significant changes detected
	// TODO: Implement more sophisticated diagram generation based on changed files
	try {
		console.log(`  ↳ Generating architecture diagram`);

		const diagramResult = await generateArchitectureDiagram({
			supabase,
			userId,
			method: 'github',
			repoUrl: repo.repo_url,
			branch: repo.default_branch,
			subdir,
			files: filters,
		});

		if (diagramResult.diagram_id) {
			results.push({
				id: diagramResult.diagram_id,
				title: 'Architecture Diagram',
				changes: 'new',
				significance: significanceAnalysis,
			});

			console.log(`  ✅ Generated architecture diagram`);
		}
	} catch (error) {
		console.error(`Failed to generate architecture diagram:`, error);
	}

	return results;
}

/**
 * Store automation results for review
 */
export async function storeAutomationResult({
	supabase,
	repoId,
	ruleId,
	userId,
	result,
	significanceAnalysis,
}: {
	supabase: SupabaseClient;
	repoId: string;
	ruleId: string;
	userId: string;
	result: AutomationResult;
	significanceAnalysis: any;
}): Promise<{ id: string }> {
	const automationResult = {
		id: `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
		rule_id: ruleId,
		repo_id: repoId,
		user_id: userId,
		status: result.success ? 'completed' : 'failed',
		significance_analysis: significanceAnalysis,
		generated_documents: result.generatedDocuments || [],
		generated_diagrams: result.generatedDiagrams || [],
		actions_taken: result.actions,
		errors: result.errors,
		preview_url: result.previewUrl,
		created_at: new Date().toISOString(),
	};

	await supabase.from('automation_results').insert(automationResult);

	return { id: automationResult.id };
}

/**
 * Send email notification about automation completion
 */
export async function sendAutomationNotification({
	supabase,
	userId,
	automationResult,
	rule,
	repo,
	result,
}: {
	supabase: SupabaseClient;
	userId: string;
	automationResult: { id: string };
	rule: SmartAutomationRule;
	repo: any;
	result: AutomationResult;
}): Promise<void> {
	try {
		// Get user email
		const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
		if (userError || !user?.user?.email) {
			console.error('Failed to get user email for notification:', userError);
			return;
		}

		// Send email notification
		const emailResult = await sendEmailNotification({
			userEmail: user.user.email,
			repoName: repo.name,
			ruleName: rule.name,
			previewUrl: result.previewUrl,
			summary: {
				filesAnalyzed: result.significanceAnalysis?.filesAnalyzed || 0,
				significantChanges: result.significanceAnalysis?.significantChanges || 0,
				confidence: result.significanceAnalysis?.confidence || 'unknown',
				documentsCount: result.generatedDocuments?.length || 0,
				diagramsCount: result.generatedDiagrams?.length || 0,
			},
		});

		if (emailResult.success) {
			console.log('✅ Email notification sent successfully');
		} else {
			console.error('❌ Failed to send email notification:', emailResult.error);
		}

	} catch (error) {
		console.error('Failed to send automation notification:', error);
	}
}

