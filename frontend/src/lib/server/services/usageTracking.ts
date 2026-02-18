import type { SupabaseClient } from '@supabase/supabase-js';

async function trackUsageEvent(
	supabase: SupabaseClient,
	workspaceId: string,
	eventType: string,
	metadata: Record<string, unknown> = {}
) {
	await supabase.from('usage_events').insert({
		user_id: workspaceId,
		event_type: eventType,
		metadata,
		created_at: new Date().toISOString(),
	});
}

export async function trackDocGenerated(
	supabase: SupabaseClient,
	workspaceId: string,
	docId?: string | null,
	sourceId?: string | null,
	autoPublished = false
) {
	await trackUsageEvent(supabase, workspaceId, 'doc_generated', {
		doc_id: docId,
		source_id: sourceId,
		// keep legacy field for back-compat with old dashboards
		repo_id: sourceId,
		auto_published: autoPublished,
	});
}

export async function trackRepoScan(
	supabase: SupabaseClient,
	workspaceId: string,
	sourceId?: string | null,
	repoUrl?: string | null
) {
	await trackUsageEvent(supabase, workspaceId, 'repo_scan_run', {
		source_id: sourceId,
		repo_id: sourceId,
		repo_url: repoUrl,
	});
}

export async function trackAutomationRun(
	supabase: SupabaseClient,
	workspaceId: string,
	data: {
		sourceId: string;
		repoUrl?: string | null;
		automationRuleId?: string | null;
		triggerType: 'scheduled' | 'manual';
		status: 'succeeded' | 'failed' | 'skipped';
		skipReason?: string | null;
		actions?: string[] | null;
		executionTimeMs?: number | null;
		filesProcessed?: number | null;
		documentsUpdated?: number | null;
		docId?: string | null;
		diagramId?: string | null;
		errors?: string[] | null;
		generatedDocuments?: unknown[] | null;
		generatedDiagrams?: unknown[] | null;
		dbRecorded?: boolean;
		dbError?: string | null;
	}
) {
	const errors = Array.isArray(data.errors) ? data.errors.filter(Boolean) : [];
	const actions = Array.isArray(data.actions) ? data.actions.filter(Boolean) : [];

	await trackUsageEvent(supabase, workspaceId, 'automation_run', {
		source_id: data.sourceId,
		repo_id: data.sourceId,
		repo_url: data.repoUrl ?? null,
		automation_rule_id: data.automationRuleId ?? null,
		trigger_type: data.triggerType,
		status: data.status,
		skip_reason: data.skipReason ?? null,
		actions,
		execution_time_ms: data.executionTimeMs ?? null,
		files_processed: data.filesProcessed ?? null,
		documents_updated: data.documentsUpdated ?? null,
		doc_id: data.docId ?? null,
		diagram_id: data.diagramId ?? null,
		errors_count: errors.length,
		errors: errors.slice(0, 5),
		generated_documents_count: Array.isArray(data.generatedDocuments) ? data.generatedDocuments.length : null,
		generated_diagrams_count: Array.isArray(data.generatedDiagrams) ? data.generatedDiagrams.length : null,
		db_recorded: typeof data.dbRecorded === 'boolean' ? data.dbRecorded : undefined,
		db_error: data.dbError ?? null,
	});
}

export async function trackPushToKb(
	supabase: SupabaseClient,
	workspaceId: string,
	provider: string,
	docId?: string | null,
	resourceId?: string | null
) {
	await trackUsageEvent(supabase, workspaceId, 'push_to_kb', {
		provider,
		doc_id: docId,
		resource_id: resourceId,
	});
}

export async function trackAutoPublish(
	supabase: SupabaseClient,
	workspaceId: string,
	docId: string,
	reason: string,
	diffSize?: number | null
) {
	await trackUsageEvent(supabase, workspaceId, 'doc_auto_published', {
		doc_id: docId,
		reason,
		diff_size: diffSize,
	});
}

export async function trackArchitectureDiagram(
	supabase: SupabaseClient,
	workspaceId: string,
	sourceId: string,
	diagramId: string,
	isNew: boolean,
	repoUrl?: string | null,
	branch?: string | null
) {
	const eventType = isNew ? 'architecture_diagram_generated' : 'architecture_diagram_regenerated';

	await trackUsageEvent(supabase, workspaceId, eventType, {
		source_id: sourceId,
		repo_id: sourceId,
		repo_url: repoUrl,
		diagram_id: diagramId,
		is_new: isNew,
		branch,
	});
}

export async function trackRepoConnected(
	supabase: SupabaseClient,
	workspaceId: string,
	sourceId: string,
	repoUrl: string,
	provider: string,
	defaultBranch?: string | null,
	authType?: string | null
) {
	await trackUsageEvent(supabase, workspaceId, 'repo_connected', {
		source_id: sourceId,
		repo_id: sourceId,
		repo_url: repoUrl,
		provider,
		default_branch: defaultBranch,
		auth_type: authType,
	});
}

/** Track connection of a non-repo source (e.g. Jira, Linear, Asana). Use trackRepoConnected for GitHub/GitLab. */
export async function trackSourceConnected(
	supabase: SupabaseClient,
	workspaceId: string,
	sourceId: string,
	provider: string,
	externalUrl?: string | null
) {
	await trackUsageEvent(supabase, workspaceId, 'source_connected', {
		source_id: sourceId,
		provider,
		external_url: externalUrl ?? null,
	});
}

export async function trackIntegrationConnected(
	supabase: SupabaseClient,
	workspaceId: string,
	provider: string,
	connectionId?: string
) {
	await trackUsageEvent(supabase, workspaceId, 'integration_connected', {
		provider,
		connection_id: connectionId,
	});
}

export async function trackIntegrationDisconnected(
	supabase: SupabaseClient,
	workspaceId: string,
	provider: string,
	connectionId?: string
) {
	await trackUsageEvent(supabase, workspaceId, 'integration_disconnected', {
		provider,
		connection_id: connectionId,
	});
}

export async function trackDocDeleted(
	supabase: SupabaseClient,
	workspaceId: string,
	docId: string,
	title?: string | null,
	sourceId?: string | null,
	repoUrl?: string | null
) {
	await trackUsageEvent(supabase, workspaceId, 'doc_deleted', {
		doc_id: docId,
		title,
		source_id: sourceId,
		repo_id: sourceId,
		repo_url: repoUrl,
	});
}

export async function trackArchitectureDiagramDeleted(
	supabase: SupabaseClient,
	workspaceId: string,
	sourceId: string,
	diagramId: string,
	repoUrl?: string | null
) {
	await trackUsageEvent(supabase, workspaceId, 'architecture_diagram_deleted', {
		source_id: sourceId,
		repo_id: sourceId,
		repo_url: repoUrl,
		diagram_id: diagramId,
	});
}

export async function trackAkusGenerated(
	supabase: SupabaseClient,
	workspaceId: string,
	data: {
		sourceIds: string[];
		akusCount: number;
	}
) {
	await trackUsageEvent(supabase, workspaceId, 'akus_generated', {
		source_ids: data.sourceIds,
		source_count: data.sourceIds.length,
		akus_count: data.akusCount,
	});
}

export async function trackRepoDisconnected(
	supabase: SupabaseClient,
	workspaceId: string,
	sourceId: string,
	repoUrl?: string | null,
	branch?: string | null,
	provider?: string | null
) {
	await trackUsageEvent(supabase, workspaceId, 'repo_disconnected', {
		source_id: sourceId,
		repo_id: sourceId,
		repo_url: repoUrl,
		branch,
		provider,
	});
}
