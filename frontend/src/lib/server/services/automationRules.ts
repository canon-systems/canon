import type { SupabaseClient } from '@supabase/supabase-js';

type RuleConfig = {
	id?: string;
	name?: string;
	schedule?: string;
	enabled?: boolean;

	// WHEN: Trigger conditions (simplified)
	detect_changes?: boolean; // Always true for smart automation

	// WHAT: Actions (simplified to presets)
	action_preset: 'docs_only' | 'diagrams_only' | 'docs_and_diagrams' | 'full_auto_publish';

	// SIGNIFICANCE: Always required for smart automation
	significance_analysis: {
		sensitivity: 'strict' | 'balanced' | 'lenient';
		minimum_confidence: 'high' | 'medium' | 'low';
	};

	// SCOPE: What to process (empty = all)
	target_documents?: string[]; // Document IDs to process (empty = all)
	target_diagrams?: string[];  // Diagram IDs to process (empty = all)

	// NOTIFICATIONS: Always enabled for smart automation
	notifications: {
		email_enabled: boolean;
		include_preview_links: boolean;
	};

	// PUBLISHING: Where to publish approved content
	publish_targets?: {
		knowledge_bases?: Array<{
			provider: 'notion' | 'confluence' | 'coda';
			id: string;
			name: string;
		}>;
	};

	// LEGACY: Keep for backward compatibility
	generate_doc?: boolean;
	generate_diagram?: boolean;
	auto_publish?: boolean;
	auto_publish_new_docs?: boolean;
	auto_publish_max_changes?: number;
	auto_publish_max_change_percentage?: number;
	auto_publish_target?: Record<string, unknown>;
};

export async function getRulesForRepo(supabase: SupabaseClient, repoId: string, workspaceId: string): Promise<RuleConfig[]> {
	const { data, error } = await supabase
		.from('automation_rules')
		.select('*')
		.eq('repo_id', repoId);

	if (error) {
		console.error('Error fetching automation rules:', error);
		return [];
	}

	// Convert back to RuleConfig format for compatibility
	return (data || []).map(rule => ({
		id: rule.rule_id,
		name: rule.name,
		enabled: rule.enabled,
		schedule: rule.schedule,
		action_preset: rule.action_preset,
		significance_analysis: rule.significance_analysis,
		target_documents: rule.target_documents,
		target_diagrams: rule.target_diagrams,
		notifications: rule.notifications,
		publish_targets: rule.publish_targets,
		// Legacy fields
		generate_doc: rule.generate_doc,
		generate_diagram: rule.generate_diagram,
		auto_publish: rule.auto_publish,
		auto_publish_new_docs: rule.auto_publish_new_docs,
		auto_publish_max_changes: rule.auto_publish_max_changes,
		auto_publish_max_change_percentage: rule.auto_publish_max_change_percentage,
		auto_publish_target: rule.auto_publish_target,
	}));
}

export type AutomationRuleEntry = {
	repo_id: string;
	repo: any;
	rule: RuleConfig;
	rule_id: string;
};

// Removed getDueRules - Inngest handles scheduling directly

export type ExecutionResult = {
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
	trigger?: 'manual' | 'scheduled';
};

export async function updateRuleLastRun(
	supabase: SupabaseClient,
	repoId: string,
	ruleId: string,
	workspaceId: string,
	execution?: ExecutionResult
): Promise<void> {
	const now = new Date();
	const nowIso = now.toISOString();
	const updateData: any = {
		last_run_at: nowIso,
	};

	if (execution) {
		updateData.last_run_status = execution.success ?
			(execution.skipped ? 'skipped' : 'success') : 'failed';
		updateData.last_run_error = execution.errors?.length > 0 ?
			execution.errors.join('; ') : null;
	}

	// Update the automation rule (no next_run_at calculation needed)
	const { error } = await supabase
		.from('automation_rules')
		.update(updateData)
		.eq('repo_id', repoId)
		.eq('rule_id', ruleId);

	if (error) {
		console.error('Error updating automation rule:', error);
	}

	// Still insert into automation_runs table for execution history
	if (execution) {
		const { error: insertError } = await supabase
			.from('automation_runs')
			.insert({
				repo_id: repoId,
				rule_id: ruleId,
				workspace_id: workspaceId,
				executed_at: nowIso,
				trigger_type: execution.trigger || 'scheduled',
				success: execution.success,
				skipped: execution.skipped || false,
				skip_reason: execution.skipReason,
				actions: execution.actions || [],
				doc_id: execution.docId || null,
				diagram_id: execution.diagramId || null,
				publish_status: execution.publishStatus,
				publish_provider: execution.publishProvider,
				publish_resource_id: execution.publishResourceId,
				errors: execution.errors || [],
			});

		if (insertError) {
			console.error('Failed to insert automation run:', insertError);
		}
	}
}

