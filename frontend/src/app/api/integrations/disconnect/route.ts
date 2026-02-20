import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deleteSourceDependents } from '@/lib/server/services/sourceCleanup';
import {
  sourceUrlFromSourceScope,
  trackIntegrationStateChanged,
  trackSourceDisconnected,
} from '@/lib/server/services/usageTracking';

type ConnectionRow = {
  id: string;
  connection_id: string;
  provider: string;
};

type SourceRow = {
  id: string;
  provider: string | null;
  scope: Record<string, unknown> | null;
};

function normalizeProvider(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function sourceProvidersForIntegrationProvider(provider: string): string[] {
  if (provider === 'confluence') return ['jira', 'confluence'];
  return [provider];
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { connectionId, provider } = body as { connectionId?: string; provider?: string };
    const normalizedProvider = normalizeProvider(provider);

    if (!connectionId && !normalizedProvider) {
      return NextResponse.json({ error: 'Missing connectionId or provider' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    let connectionLookup = supabase
      .from('oauth_connections')
      .select('id, connection_id, provider')
      .eq('user_id', user.id);

    if (connectionId) {
      connectionLookup = connectionLookup.eq('connection_id', connectionId);
    } else if (normalizedProvider) {
      connectionLookup = connectionLookup.eq('provider', normalizedProvider);
    }

    const { data: connectionRowsRaw, error: connectionLookupError } = await connectionLookup;
    if (connectionLookupError) {
      throw connectionLookupError;
    }

    const connectionRows = ((connectionRowsRaw || []) as ConnectionRow[]).map((row) => ({
      id: row.id,
      connection_id: row.connection_id,
      provider: String(row.provider || '').toLowerCase(),
    }));

    const integrationProviderSet = new Set<string>();
    if (normalizedProvider) integrationProviderSet.add(normalizedProvider);
    for (const row of connectionRows) {
      if (row.provider) integrationProviderSet.add(row.provider);
    }

    const sourceProviderSet = new Set<string>();
    for (const integrationProvider of integrationProviderSet) {
      for (const sourceProvider of sourceProvidersForIntegrationProvider(integrationProvider)) {
        sourceProviderSet.add(sourceProvider);
      }
    }

    const internalConnectionIds = Array.from(
      new Set(connectionRows.map((row) => row.id).filter((id) => typeof id === 'string' && id.length > 0))
    );
    const externalConnectionIds = Array.from(
      new Set(
        [
          ...connectionRows.map((row) => row.connection_id).filter((id) => typeof id === 'string' && id.length > 0),
          connectionId || '',
        ].filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    const sourcesById = new Map<string, SourceRow>();

    if (internalConnectionIds.length > 0) {
      const { data: sourceRowsByConnection, error: sourceByConnectionError } = (await supabase
        .from('workspace_sources')
        .select('id, provider, scope')
        .eq('user_id', user.id)
        .in('connection_id', internalConnectionIds)) as { data: SourceRow[] | null; error: { message?: string } | null };

      if (sourceByConnectionError) {
        throw sourceByConnectionError;
      }

      for (const source of sourceRowsByConnection || []) {
        sourcesById.set(source.id, source);
      }
    }

    const sourceProviders = Array.from(sourceProviderSet);
    if (sourceProviders.length > 0) {
      const { data: sourceRowsByProvider, error: sourceByProviderError } = (await supabase
        .from('workspace_sources')
        .select('id, provider, scope')
        .eq('user_id', user.id)
        .in('provider', sourceProviders)) as { data: SourceRow[] | null; error: { message?: string } | null };

      if (sourceByProviderError) {
        throw sourceByProviderError;
      }

      for (const source of sourceRowsByProvider || []) {
        sourcesById.set(source.id, source);
      }
    }

    for (const source of sourcesById.values()) {
      await deleteSourceDependents({
        supabase,
        userId: user.id,
        sourceId: source.id,
      });

      const { error: sourceDeleteError } = await supabase
        .from('workspace_sources')
        .delete()
        .eq('id', source.id)
        .eq('user_id', user.id);

      if (sourceDeleteError) {
        throw sourceDeleteError;
      }

      try {
        const providerForLog = typeof source.provider === 'string' ? source.provider : 'unknown';
        const sourceScope = source.scope && typeof source.scope === 'object' ? source.scope : null;
        const sourceUrl = sourceUrlFromSourceScope(providerForLog, sourceScope);
        await trackSourceDisconnected(supabase, user.id, source.id, sourceUrl, null, providerForLog);
      } catch (logError) {
        console.warn('Failed to track source disconnect during integration cleanup:', logError);
      }
    }

    let tokenDelete = supabase
      .from('oauth_provider_tokens')
      .delete()
      .eq('user_id', user.id);

    if (externalConnectionIds.length > 0) {
      tokenDelete = tokenDelete.in('connection_id', externalConnectionIds);
    } else {
      const integrationProviders = Array.from(integrationProviderSet);
      if (integrationProviders.length > 0) {
        tokenDelete = tokenDelete.in('provider', integrationProviders);
      }
    }

    const { error: tokenDeleteError } = await tokenDelete;
    if (tokenDeleteError) {
      console.warn('Failed to delete oauth_provider_tokens rows:', tokenDeleteError);
    }

    let connectionDelete = supabase
      .from('oauth_connections')
      .delete()
      .eq('user_id', user.id);

    if (internalConnectionIds.length > 0) {
      connectionDelete = connectionDelete.in('id', internalConnectionIds);
    } else if (connectionId) {
      connectionDelete = connectionDelete.eq('connection_id', connectionId);
    } else if (normalizedProvider) {
      connectionDelete = connectionDelete.eq('provider', normalizedProvider);
    }

    const { error: connectionDeleteError } = await connectionDelete;

    if (connectionDeleteError) {
      console.error('Failed to disconnect integration:', connectionDeleteError);
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    }

    const providerForLog = connectionRows[0]?.provider || normalizedProvider || provider || 'unknown';
    const connectionIdForLog = connectionId || connectionRows[0]?.connection_id;
    try {
      await trackIntegrationStateChanged(
        supabase,
        user.id,
        'disconnected',
        providerForLog,
        connectionIdForLog
      );
    } catch (logError) {
      console.warn('Failed to track integration disconnect:', logError);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('Disconnect error:', err);
    return NextResponse.json(
      {
        error: 'Failed to disconnect',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
