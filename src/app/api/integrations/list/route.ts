import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canonicalProvider } from '@/lib/providers';
import { demoConnections } from '@/lib/server/demo-workspace-data';
import { isDemoOrganization, requireWorkspace } from '@/lib/server/organization';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { supportedNangoProviders } from '@/lib/server/integrations/nango';
import { reconcileNangoWorkspaceConnections } from '@/lib/server/integrations/nango-reconciliation';

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { supabase, organization } = await requireWorkspace(user);
    if (isDemoOrganization(organization)) return NextResponse.json({ connections: demoConnections() });
    try {
      await reconcileNangoWorkspaceConnections({
        supabase: createServiceRoleClient(),
        organizationId: organization.id,
        connectedByUserId: user.id,
      });
    } catch (error) {
      console.warn('Failed to list Nango connections for reconciliation:', error);
    }

    const supportedProviders = ['slack', ...supportedNangoProviders()];
    const { data: connections, error } = await supabase
      .from('oauth_connections')
      .select('id, provider, connection_id, status, metadata, created_at, updated_at')
      .eq('organization_id', organization.id)
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
