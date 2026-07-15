import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkspaceProvider = 'slack' | 'granola' | 'teams' | 'gmail' | 'google_calendar' | 'outlook';

export type WorkspaceConnection = {
  id: string;
  organization_id: string;
  user_id: string;
  provider: string;
  connection_id: string;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function getActiveWorkspaceConnection(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    provider: WorkspaceProvider;
  }
): Promise<WorkspaceConnection | null> {
  const { data, error } = await supabase
    .from('oauth_connections')
    .select('id, organization_id, user_id, provider, connection_id, status, metadata, created_at, updated_at')
    .eq('organization_id', params.organizationId)
    .eq('provider', params.provider)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as WorkspaceConnection | null) ?? null;
}

export async function upsertWorkspaceConnection(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    connectedByUserId: string;
    provider: WorkspaceProvider;
    connectionId: string;
    status?: 'active' | 'error';
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase
    .from('oauth_connections')
    .upsert(
      {
        organization_id: params.organizationId,
        user_id: params.connectedByUserId,
        provider: params.provider,
        connection_id: params.connectionId,
        status: params.status ?? 'active',
        metadata: {
          ...(params.metadata ?? {}),
          organization_id: params.organizationId,
          connected_by_user_id: params.connectedByUserId,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,provider' }
    );

  if (error) throw error;
}
