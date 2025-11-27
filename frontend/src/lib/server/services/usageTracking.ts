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

export async function trackDiagramGenerated(
	supabase: SupabaseClient,
	workspaceId: string,
	diagramId?: string | null,
	repoId?: string | null
) {
	await trackUsageEvent(supabase, workspaceId, 'diagram_generated', {
		diagram_id: diagramId,
		repo_id: repoId,
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

export async function trackDocApproved(
	supabase: SupabaseClient,
	workspaceId: string,
	docId: string,
	autoApproved = false,
	diffSize?: number | null
) {
	await trackUsageEvent(supabase, workspaceId, 'doc_approved', {
		doc_id: docId,
		auto_approved: autoApproved,
		diff_size: diffSize,
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

