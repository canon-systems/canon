import { createServiceRoleClient } from '@/lib/supabase/server';
import { errorMessage } from '@/lib/server/logging';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import {
  hasNangoApiKey,
  listNangoConnectionsForOrganization,
  providerForNangoIntegration,
} from '@/lib/server/integrations/nango';
import {
  getActiveProviderConnection,
  upsertProviderConnection,
} from '@/lib/server/knowledge-sync/source-repository';

type SupabaseServiceClient = ReturnType<typeof createServiceRoleClient>;

type SourceConnectionLogger = {
  info(event: string, metadata?: Record<string, unknown>): void;
  warn(event: string, metadata?: Record<string, unknown>): void;
};

export async function getSlackAccessTokenForOrganization(
  supabase: SupabaseServiceClient,
  organizationId: string
): Promise<{ accessToken: string | null; connectionId?: string; scope?: string | null }> {
  const { connectionId } = await getActiveProviderConnection(supabase, { organizationId, provider: 'slack' });
  if (!connectionId) return { accessToken: null };

  const { data: tokenRow } = await supabase
    .from('oauth_provider_tokens')
    .select('scope')
    .eq('provider', 'slack')
    .eq('connection_id', connectionId)
    .maybeSingle();

  const accessToken = await getProviderAccessToken({ provider: 'slack', connectionId });
  const scope = typeof tokenRow?.scope === 'string' ? tokenRow.scope : null;
  return { accessToken, connectionId, scope };
}

export async function getGranolaConnectionForOrganization(
  supabase: SupabaseServiceClient,
  params: {
    organizationId: string;
    log: SourceConnectionLogger;
  }
): Promise<{ connectionId?: string }> {
  if (hasNangoApiKey()) {
    try {
      const connections = await listNangoConnectionsForOrganization({
        organizationId: params.organizationId,
      });
      const nangoConnection = connections.find((connection) => {
        const provider = providerForNangoIntegration(connection.provider_config_key);
        const hasAuthError = (connection.errors ?? []).some((error) => error.type === 'auth');
        return provider === 'granola' && !hasAuthError;
      });

      if (nangoConnection) {
        await upsertProviderConnection(supabase, {
          organizationId: params.organizationId,
          connectedByUserId: typeof nangoConnection.tags?.end_user_id === 'string'
            ? nangoConnection.tags.end_user_id
            : 'system',
          provider: 'granola',
          connectionId: nangoConnection.connection_id,
          metadata: {
            ...(nangoConnection.metadata ?? {}),
            source: 'nango',
            provider_config_key: nangoConnection.provider_config_key,
            nango_provider: nangoConnection.provider,
            nango_connection_id: nangoConnection.id,
            organization_id: params.organizationId,
            reconciled_at: new Date().toISOString(),
            reconciled_from: 'knowledge_source_sync',
          },
        });

        params.log.info('granola_connection_reconciled', {
          organizationId: params.organizationId,
          connectionId: nangoConnection.connection_id,
          providerConfigKey: nangoConnection.provider_config_key,
        });

        return { connectionId: nangoConnection.connection_id };
      }
    } catch (error) {
      params.log.warn('granola_connection_reconcile_failed', {
        organizationId: params.organizationId,
        error: errorMessage(error),
      });
    }
  }

  const { connectionId } = await getActiveProviderConnection(supabase, { organizationId: params.organizationId, provider: 'granola' });
  return { connectionId };
}
