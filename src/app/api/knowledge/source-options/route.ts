import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import { listSlackChannels, SlackListChannelsError } from '@/lib/server/integrations/nativeSlack';
import { hasNangoApiKey, listNangoConnectionsForOrganization, providerForNangoIntegration } from '@/lib/server/integrations/nango';
import { sourceOptionTopic } from '@/lib/server/knowledge-sync/source-option-labels';
import { requireWorkspace } from '@/lib/server/organization';

export const dynamic = 'force-dynamic';

function badRequest(payload: Record<string, unknown>) {
  console.warn('[api/knowledge/source-options] GET blocked', payload);
  return NextResponse.json(payload, { status: 400 });
}

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { supabase, organization } = await requireWorkspace(user);
    const options: Array<{
      id: string;
      name: string;
      provider: string;
      member_count: number;
      topic: string;
    }> = [];

    let slackConnected = false;
    let granolaConnected = false;

    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('organization_id', organization.id)
      .eq('provider', 'slack')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const connectionId = typeof connection?.connection_id === 'string' ? connection.connection_id : '';
    if (connectionId) {
      const accessToken = await getProviderAccessToken({ provider: 'slack', connectionId });
      if (accessToken) {
        slackConnected = true;
        const channels = await listSlackChannels(accessToken).catch((error) => {
          if (error instanceof SlackListChannelsError) {
            console.warn('[api/knowledge/source-options] Failed to list Slack source options:', {
              detail: error.detail,
              needed: error.needed,
              provided: error.provided,
            });
            return [];
          }
          throw error;
        });
        options.push(
          ...channels.map((channel) => ({
            ...channel,
            provider: 'slack',
          }))
        );
      }
    }

    const { data: granolaConnection } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('organization_id', organization.id)
      .eq('provider', 'granola')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    granolaConnected = Boolean(granolaConnection?.connection_id);
    if (!granolaConnected && hasNangoApiKey()) {
      try {
        const nangoConnections = await listNangoConnectionsForOrganization({ organizationId: organization.id });
        granolaConnected = nangoConnections.some((connection) => {
          const provider = providerForNangoIntegration(connection.provider_config_key);
          const hasAuthError = (connection.errors ?? []).some((error) => error.type === 'auth');
          return provider === 'granola' && !hasAuthError;
        });
      } catch (error) {
        console.warn('[api/knowledge/source-options] Failed to reconcile Granola connection from Nango:', error);
      }
    }

    if (granolaConnected) {
      options.push({
        id: 'granola-transcripts',
        name: 'Granola transcripts',
        provider: 'granola',
        member_count: 0,
        topic: sourceOptionTopic('granola'),
      });
    }

    return NextResponse.json({
      options,
      connectedProviders: {
        slack: slackConnected,
        granola: granolaConnected,
      },
      noIntegrationsConnected: !slackConnected && !granolaConnected,
    });
  } catch (error: unknown) {
    if (error instanceof SlackListChannelsError) {
      return badRequest({
        error: error.message,
        detail: error.detail,
        needed: error.needed,
        provided: error.provided,
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/knowledge/source-options] GET failed', error);
    return NextResponse.json({ error: 'Failed to load source options', detail: message }, { status: 500 });
  }
}
