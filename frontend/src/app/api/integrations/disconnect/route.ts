import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { deleteSourceDependents } from '@/lib/server/services/sourceCleanup';
import {
  sourceUrlFromSourceScope,
  trackIntegrationStateChanged,
  trackSourceDisconnected,
} from '@/lib/server/services/usageTracking';
import { canonicalProvider } from '@/lib/providers';
import { createLogger } from '@/lib/server/logging';
import { getOrganizationForUser } from '@/lib/server/organization';

const log = createLogger('api.integrations.disconnect', {
  label: 'Integration Disconnect',
  eventLabels: {
    disconnect_requested: 'Disconnect Requested',
    source_cleanup_completed: 'Source Cleanup Completed',
    delivery_settings_cleared: 'Delivery Settings Cleared',
    token_cleanup_completed: 'Token Cleanup Completed',
    connection_cleanup_completed: 'Connection Cleanup Completed',
  },
});

type ConnectionRow = {
  id: string;
  connection_id: string;
  provider: string;
};

type SourceRow = {
  id: string;
  provider: string | null;
  scope?: Record<string, unknown> | null;
  name?: string | null;
  slack_channel_id?: string | null;
  slack_channel_name?: string | null;
};

function normalizeProvider(value: string | undefined): string | null {
  const normalized = canonicalProvider(value);
  return normalized.length > 0 ? normalized : null;
}

function sourceProvidersForIntegrationProvider(provider: string): string[] {
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

    const organization = await getOrganizationForUser(supabase, user);

    log.info('disconnect_requested', {
      userId: user.id,
      provider: normalizedProvider ?? provider ?? 'unknown',
      connectionId: connectionId ?? 'by_provider',
      orgId: organization?.id,
    });

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

    if (organization && integrationProviderSet.has('slack')) {
      const { error: deliverySettingsDeleteError } = await supabase
        .from('readiness_delivery_settings')
        .delete()
        .eq('organization_id', organization.id);

      if (deliverySettingsDeleteError) {
        console.warn('Failed to clear readiness delivery settings during Slack disconnect:', deliverySettingsDeleteError);
      } else {
        log.info('delivery_settings_cleared', {
          userId: user.id,
          orgId: organization.id,
          provider: 'slack',
        });
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

    const sourceProviders = Array.from(sourceProviderSet);
    if (organization && sourceProviders.length > 0) {
      const { data: sourceRowsByProvider, error: sourceByProviderError } = (await supabase
        .from('knowledge_sources')
        .select('id, provider, name, slack_channel_id, slack_channel_name')
        .eq('organization_id', organization.id)
        .in('provider', sourceProviders)) as { data: SourceRow[] | null; error: { message?: string } | null };

      if (sourceByProviderError) {
        throw sourceByProviderError;
      }

      for (const source of sourceRowsByProvider || []) {
        sourcesById.set(source.id, source);
      }
    }

    for (const source of sourcesById.values()) {
      if (!organization) continue;

      await deleteSourceDependents({
        supabase,
        userId: user.id,
        sourceId: source.id,
      });

      const { error: sourceDeleteError } = await supabase
        .from('knowledge_sources')
        .delete()
        .eq('id', source.id)
        .eq('organization_id', organization.id);

      if (sourceDeleteError) {
        throw sourceDeleteError;
      }

      try {
        const providerForLog = typeof source.provider === 'string' ? source.provider : 'unknown';
        const sourceScope = source.scope && typeof source.scope === 'object'
          ? source.scope
          : providerForLog === 'slack'
            ? {
                channelId: source.slack_channel_id,
                channelName: source.slack_channel_name || source.name,
              }
            : null;
        const sourceUrl = sourceUrlFromSourceScope(providerForLog, sourceScope);
        await trackSourceDisconnected(supabase, user.id, source.id, sourceUrl, null, providerForLog);
      } catch (logError) {
        console.warn('Failed to track source disconnect during integration cleanup:', logError);
      }
    }

    log.info('source_cleanup_completed', {
      userId: user.id,
      orgId: organization?.id,
      provider: normalizedProvider ?? provider ?? 'unknown',
      sourceCount: sourcesById.size,
    });

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
    log.info('token_cleanup_completed', {
      userId: user.id,
      provider: normalizedProvider ?? provider ?? 'unknown',
      connectionIds: externalConnectionIds,
      error: tokenDeleteError?.message,
    });

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

    log.info('connection_cleanup_completed', {
      userId: user.id,
      provider: normalizedProvider ?? provider ?? 'unknown',
      connectionIds: internalConnectionIds,
    });

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
