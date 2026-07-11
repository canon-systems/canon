import { createServiceRoleClient } from '@/lib/supabase/server';

type SupabaseServiceClient = ReturnType<typeof createServiceRoleClient>;

export type KnowledgeProvider = 'slack' | 'granola';

export async function getOrganizationOwnerId(
  supabase: SupabaseServiceClient,
  organizationId: string
): Promise<string | undefined> {
  const { data: org } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', organizationId)
    .maybeSingle();

  return typeof org?.owner_id === 'string' ? org.owner_id : undefined;
}

export async function getActiveProviderConnection(
  supabase: SupabaseServiceClient,
  params: {
    ownerId: string;
    provider: KnowledgeProvider;
  }
): Promise<{ connectionId?: string }> {
  const { data: connection } = await supabase
    .from('oauth_connections')
    .select('connection_id')
    .eq('user_id', params.ownerId)
    .eq('provider', params.provider)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    connectionId: typeof connection?.connection_id === 'string' ? connection.connection_id : undefined,
  };
}

export async function upsertProviderConnection(
  supabase: SupabaseServiceClient,
  params: {
    ownerId: string;
    provider: KnowledgeProvider;
    connectionId: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase
    .from('oauth_connections')
    .upsert(
      {
        user_id: params.ownerId,
        provider: params.provider,
        connection_id: params.connectionId,
        status: 'active',
        metadata: params.metadata ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );

  if (error) throw error;
}
