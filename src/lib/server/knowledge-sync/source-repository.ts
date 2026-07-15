import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  getActiveWorkspaceConnection,
  upsertWorkspaceConnection,
} from '@/lib/server/integrations/workspaceConnections';

type SupabaseServiceClient = ReturnType<typeof createServiceRoleClient>;

export type KnowledgeProvider = 'slack' | 'granola' | 'teams' | 'gmail' | 'google_calendar' | 'outlook';

export async function getActiveProviderConnection(
  supabase: SupabaseServiceClient,
  params: {
    organizationId: string;
    provider: KnowledgeProvider;
  }
): Promise<{ connectionId?: string }> {
  const connection = await getActiveWorkspaceConnection(supabase, {
    organizationId: params.organizationId,
    provider: params.provider,
  });

  return {
    connectionId: typeof connection?.connection_id === 'string' ? connection.connection_id : undefined,
  };
}

export async function upsertProviderConnection(
  supabase: SupabaseServiceClient,
  params: {
    organizationId: string;
    connectedByUserId: string;
    provider: KnowledgeProvider;
    connectionId: string;
    metadata?: Record<string, unknown>;
  }
) {
  await upsertWorkspaceConnection(supabase, {
    organizationId: params.organizationId,
    connectedByUserId: params.connectedByUserId,
    provider: params.provider,
    connectionId: params.connectionId,
    metadata: params.metadata,
  });
}
