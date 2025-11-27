import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeRepository } from './analyzeRepository';
import { generateDocumentation } from './docGenerator';
import { generateArchitectureDiagram } from './diagramGenerator';
import { trackRepoScan, trackDocGenerated, trackDiagramGenerated } from './usageTracking';

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
}: AutomationRuleContext): Promise<{ success: boolean; actions: string[]; errors: string[]; docId?: string | null; diagramId?: string | null }> {
	const result = {
		success: false,
		actions: [],
		errors: [] as string[],
		docId: null as string | null,
		diagramId: null as string | null,
	};

	try {
		const settings = repo.settings || {};
		const subdir = settings.subdir || null;
		const filters = settings.filters || null;
		const promptConfig = settings.prompt_config || null;

		const analysis = await analyzeRepository({
			supabase,
			userId,
			repoUrl: repo.repo_url,
			branch: repo.default_branch,
			subdir,
			filters,
		});

		result.actions.push('detect_changes');

		const docResult = await generateDocumentation({
			supabase,
			userId,
			projectName: repo.name,
			model: rule.model || 'gpt-4o',
			files: analysis.rawFiles || [],
			repoUrl: repo.repo_url,
			branch: repo.default_branch,
			subdir,
			promptConfig,
		});

		const sourceMeta = {
			repoUrl: repo.repo_url,
			branch: repo.default_branch,
			subdir,
			repoId: repo.id,
			workspaceRepoName: repo.name,
			approval_status: 'pending_review',
			snapshot: analysis.snapshot,
			automation_rule_id: rule.id || rule.name,
		};

		const { data: submission } = await supabase
			.from('submissions')
			.insert({
				created_by: userId,
				title: repo.name,
				markdown: docResult.markdown,
				status: 'completed',
				input_type: 'github_repo',
				source_meta: sourceMeta,
				code_snapshot: analysis.snapshot,
				summary: docResult.markdown.replace(/\s+/g, ' ').slice(0, 200),
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.select()
			.single();

		const docId = submission?.id;
		result.docId = docId || null;
		result.actions.push('generate_doc');
		await trackRepoScan(supabase, userId, repo.id, repo.repo_url);
		await trackDocGenerated(supabase, userId, docId || '', repo.id);

		if (rule.generate_diagram) {
			const diagramResult = await generateArchitectureDiagram({
				supabase,
				userId,
				method: 'github',
				repoUrl: repo.repo_url,
				branch: repo.default_branch,
				subdir,
				files: analysis.rawFiles,
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

