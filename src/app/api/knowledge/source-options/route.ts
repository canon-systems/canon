import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import { listDeliveryTargets } from '@/lib/server/integrations/chat-targets';
import { listSlackChannels, SlackListChannelsError } from '@/lib/server/integrations/nativeSlack';
import { hasNangoApiKey, listNangoConnectionsForOrganization, providerForNangoIntegration } from '@/lib/server/integrations/nango';
import { isKnowledgeSourceTargetType, sourceOptionTopic } from '@/lib/server/knowledge-sync/source-option-labels';
import { requireWorkspace } from '@/lib/server/organization';
import type { KnowledgeProvider } from '@/types/onboarding';

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
    let teamsConnected = false;

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

    const { data: teamChatConnections, error: teamChatConnectionsError } = await supabase
      .from('oauth_connections')
      .select('provider, connection_id')
      .eq('organization_id', organization.id)
      .in('provider', ['teams'])
      .eq('status', 'active');

    if (teamChatConnectionsError) throw teamChatConnectionsError;

    teamsConnected = (teamChatConnections ?? []).some((connection) => connection.provider === 'teams' && connection.connection_id);

    const teamChatProviders = [
      ['teams', teamsConnected] as const,
    ];

    for (const [provider, connected] of teamChatProviders) {
      if (!connected) continue;
      const targets = await listDeliveryTargets({
        organizationId: organization.id,
        provider,
        targetScope: 'channels',
      }).catch((error) => {
        console.warn(`[api/knowledge/source-options] Failed to list ${provider} source options:`, error);
        return [];
      });

      const knowledgeTargets = targets.filter((target) => isKnowledgeSourceTargetType(target.targetType));
      options.push(
        ...knowledgeTargets.map((target) => ({
          id: target.targetId,
          name: target.targetName || target.label || target.targetId,
          provider: provider as KnowledgeProvider,
          member_count: 0,
          topic: sourceOptionTopic(provider, target.targetType),
        }))
      );
    }

    return NextResponse.json({
      options,
      connectedProviders: {
        slack: slackConnected,
        granola: granolaConnected,
        teams: teamsConnected,
      },
      noIntegrationsConnected: !slackConnected && !granolaConnected && !teamsConnected,
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
