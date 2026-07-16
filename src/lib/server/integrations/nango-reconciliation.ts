import type { SupabaseClient } from '@supabase/supabase-js';
import {
  hasNangoApiKey,
  listNangoConnectionsForOrganization,
  providerForNangoIntegration,
  supportedNangoProviders,
} from '@/lib/server/integrations/nango';
import {
  upsertWorkspaceConnection,
  type WorkspaceProvider,
} from '@/lib/server/integrations/workspaceConnections';

type ReconciledConnection = {
  provider: WorkspaceProvider;
  connectionId: string;
  status: 'active' | 'error';
};

function connectionTimestamp(connection: { created?: string; id: number }) {
  const timestamp = connection.created ? Date.parse(connection.created) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : connection.id;
}

function hasAuthError(connection: { errors?: Array<{ type?: string }> }) {
  return (connection.errors ?? []).some((error) => error.type === 'auth');
}

export async function reconcileNangoWorkspaceConnections(params: {
  supabase: SupabaseClient;
  organizationId: string;
  connectedByUserId?: string;
  providers?: WorkspaceProvider[];
}) : Promise<ReconciledConnection[]> {
  if (!hasNangoApiKey()) return [];

  const supportedProviders = new Set(supportedNangoProviders());
  const allowedProviders = params.providers ? new Set(params.providers) : null;
  const connections = await listNangoConnectionsForOrganization({
    organizationId: params.organizationId,
  });
  const byProvider = new Map<WorkspaceProvider, typeof connections>();

  for (const connection of connections) {
    const provider = providerForNangoIntegration(connection.provider_config_key);
    if (!supportedProviders.has(provider) || (allowedProviders && !allowedProviders.has(provider as WorkspaceProvider))) {
      continue;
    }
    const workspaceProvider = provider as WorkspaceProvider;
    byProvider.set(workspaceProvider, [...(byProvider.get(workspaceProvider) ?? []), connection]);
  }

  const reconciled: ReconciledConnection[] = [];
  for (const [provider, candidates] of byProvider) {
    // Prefer a working connection. A failed reconnect must not replace one that still works.
    const selected = [...candidates].sort((left, right) => {
      const healthOrder = Number(hasAuthError(left)) - Number(hasAuthError(right));
      return healthOrder || connectionTimestamp(right) - connectionTimestamp(left);
    })[0];
    if (!selected) continue;

    const connectedByUserId = params.connectedByUserId
      ?? selected.tags?.end_user_id;
    if (!connectedByUserId) continue;

    const status = hasAuthError(selected) ? 'error' : 'active';
    await upsertWorkspaceConnection(params.supabase, {
      organizationId: params.organizationId,
      connectedByUserId,
      provider,
      connectionId: selected.connection_id,
      status,
      metadata: {
        ...(selected.metadata ?? {}),
        source: 'nango',
        provider_config_key: selected.provider_config_key,
        nango_provider: selected.provider,
        nango_connection_id: selected.id,
        organization_id: params.organizationId,
        reconciled_at: new Date().toISOString(),
      },
    });
    reconciled.push({ provider, connectionId: selected.connection_id, status });
  }

  return reconciled;
}
