import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canonicalProvider } from '@/lib/providers';
import { requireWorkspace } from '@/lib/server/organization';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  hasNangoApiKey,
  listNangoConnectionsForUser,
  providerForNangoIntegration,
  supportedNangoProviders,
} from '@/lib/server/integrations/nango';

async function reconcileNangoConnections(params: { userId: string; organizationId: string }) {
  if (!hasNangoApiKey()) return;

  try {
    const supportedProviders = new Set(supportedNangoProviders());
    const connections = await listNangoConnectionsForUser(params);
    const rows = connections.flatMap((connection) => {
      const provider = providerForNangoIntegration(connection.provider_config_key);
      if (!supportedProviders.has(provider)) return [];

      const hasAuthError = (connection.errors ?? []).some((error) => error.type === 'auth');
      return [{
        user_id: params.userId,
        provider,
        connection_id: connection.connection_id,
        status: hasAuthError ? 'error' : 'active',
        metadata: {
          ...(connection.metadata ?? {}),
          source: 'nango',
          provider_config_key: connection.provider_config_key,
          nango_provider: connection.provider,
          nango_connection_id: connection.id,
          organization_id: params.organizationId,
          reconciled_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      }];
    });

    if (rows.length === 0) return;

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from('oauth_connections')
      .upsert(rows, { onConflict: 'user_id,provider' });

    if (error) {
      console.warn('Failed to reconcile Nango connections:', error);
    }
  } catch (error) {
    console.warn('Failed to list Nango connections for reconciliation:', error);
  }
}

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { supabase, organization } = await requireWorkspace(user);
    await reconcileNangoConnections({ userId: user.id, organizationId: organization.id });

    const supportedProviders = ['slack', ...supportedNangoProviders()];
    const { data: connections, error } = await supabase
      .from('oauth_connections')
      .select('id, provider, connection_id, status, metadata, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('provider', supportedProviders)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch connections:', error);
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
    }

    const activeConnections = (connections || []).flatMap((connection) => {
      const provider = canonicalProvider(connection.provider);
      if (!supportedProviders.includes(provider)) return [];
      const metadata = connection.metadata && typeof connection.metadata === 'object'
        ? connection.metadata as Record<string, unknown>
        : {};
      return [{
        ...connection,
        provider,
        platform: metadata.source === 'nango' ? 'nango' : 'native',
      }];
    });

    return NextResponse.json({
      connections: activeConnections,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('List connections error:', err);
    return NextResponse.json(
      {
        error: 'Failed to list connections',
        detail: message,
      },
      { status: 500 }
    );
  }
}
