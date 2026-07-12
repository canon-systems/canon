import type { SupabaseClient } from '@supabase/supabase-js';

async function trackUsageEvent(
  supabase: SupabaseClient,
  workspaceId: string,
  eventType: string,
  metadata: Record<string, unknown> = {}
) {
  const sourceId = typeof metadata.source_id === 'string' && metadata.source_id.trim().length > 0
    ? metadata.source_id.trim()
    : null;

  await supabase.from('usage_events').insert({
    user_id: workspaceId,
    source_id: sourceId,
    event_type: eventType,
    metadata,
    created_at: new Date().toISOString(),
  });
}

function withSourceMetadata(sourceId: string, metadata: Record<string, unknown>): Record<string, unknown> {
  return {
    source_id: sourceId,
    ...metadata,
  };
}

async function trackSourceLifecycleEvent(
  supabase: SupabaseClient,
  workspaceId: string,
  state: 'connected' | 'disconnected',
  sourceId: string,
  metadata: Record<string, unknown>
) {
  await trackUsageEvent(supabase, workspaceId, `source_${state}`, withSourceMetadata(sourceId, metadata));
}

export function sourceUrlFromSourceScope(
  provider: string | null | undefined,
  scope: Record<string, unknown> | null | undefined
): string | null {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (normalizedProvider === 'github' || normalizedProvider === 'gitlab') {
    const repoValue = typeof scope?.repo === 'string' ? scope.repo.trim() : '';
    if (!repoValue) return null;
    if (/^https?:\/\//i.test(repoValue)) return repoValue;
    const cleanedRepo = repoValue.replace(/^\/+|\/+$/g, '');
    if (!cleanedRepo.includes('/')) return null;
    return `https://${normalizedProvider}.com/${cleanedRepo}`;
  }

  const urlValue = typeof scope?.url === 'string' ? scope.url.trim() : '';
  return urlValue || null;
}

export async function trackIntegrationStateChanged(
  supabase: SupabaseClient,
  workspaceId: string,
  state: 'connected' | 'disconnected',
  provider: string,
  connectionId?: string
) {
  await trackUsageEvent(supabase, workspaceId, `integration_${state}`, {
    provider,
    connection_id: connectionId,
  });
}

export async function trackSourceDisconnected(
  supabase: SupabaseClient,
  workspaceId: string,
  sourceId: string,
  sourceUrl?: string | null,
  branch?: string | null,
  provider?: string | null
) {
  await trackSourceLifecycleEvent(supabase, workspaceId, 'disconnected', sourceId, {
    source_url: sourceUrl ?? null,
    branch,
    provider,
  });
}
