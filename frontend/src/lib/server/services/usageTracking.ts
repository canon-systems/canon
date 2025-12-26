import type { SupabaseClient } from '@supabase/supabase-js';

async function trackUsageEvent(
	supabase: SupabaseClient,
	workspaceId: string,
	eventType: string,
	metadata: Record<string, unknown> = {}
) {
	await supabase.from('usage_events').insert({
		workspace_id: workspaceId,
		event_type: eventType,
		metadata,
		created_at: new Date().toISOString(),
	});
}

export async function trackDocGenerated(
	supabase: SupabaseClient,
	workspaceId: string,
	docId?: string | null,
	repoId?: string | null,
	autoPublished = false
) {
	await trackUsageEvent(supabase, workspaceId, 'doc_generated', {
		doc_id: docId,
		repo_id: repoId,
		auto_published: autoPublished,
	});
}

export async function trackRepoScan(
	supabase: SupabaseClient,
	workspaceId: string,
	repoId?: string | null,
	repoUrl?: string | null
) {
	await trackUsageEvent(supabase, workspaceId, 'repo_scan_run', {
		repo_id: repoId,
		repo_url: repoUrl,
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
	repoId: string,
	diagramId: string,
	isNew: boolean,
	componentsCount?: number,
	relationshipsCount?: number,
	repoUrl?: string | null,
	branch?: string | null
) {
	const eventType = isNew ? 'architecture_diagram_generated' : 'architecture_diagram_regenerated';

	await trackUsageEvent(supabase, workspaceId, eventType, {
		repo_id: repoId,
		repo_url: repoUrl,
		diagram_id: diagramId,
		is_new: isNew,
		components_count: componentsCount,
		relationships_count: relationshipsCount,
		branch,
	});
}

export async function trackRepoConnected(
	supabase: SupabaseClient,
	workspaceId: string,
	repoId: string,
	repoUrl: string,
	provider: string,
	defaultBranch?: string | null,
	authType?: string | null
) {
	await trackUsageEvent(supabase, workspaceId, 'repo_connected', {
		repo_id: repoId,
		repo_url: repoUrl,
		provider,
		default_branch: defaultBranch,
		auth_type: authType,
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
	repoId?: string | null,
	repoUrl?: string | null
) {
	await trackUsageEvent(supabase, workspaceId, 'doc_deleted', {
		doc_id: docId,
		title,
		repo_id: repoId,
		repo_url: repoUrl,
	});
}

export async function trackArchitectureDiagramDeleted(
	supabase: SupabaseClient,
	workspaceId: string,
	repoId: string,
	diagramId: string,
	repoUrl?: string | null
) {
	await trackUsageEvent(supabase, workspaceId, 'architecture_diagram_deleted', {
		repo_id: repoId,
		repo_url: repoUrl,
		diagram_id: diagramId,
	});
}

export async function trackRepoDisconnected(
	supabase: SupabaseClient,
	workspaceId: string,
	repoId: string,
	repoUrl?: string | null,
	branch?: string | null,
	provider?: string | null
) {
	await trackUsageEvent(supabase, workspaceId, 'repo_disconnected', {
		repo_id: repoId,
		repo_url: repoUrl,
		branch,
		provider,
	});
}
