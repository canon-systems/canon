import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import { listSlackChannels, SlackListChannelsError } from '@/lib/server/integrations/nativeSlack';
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

    const { supabase } = await requireWorkspace(user);
    const options: Array<{
      id: string;
      name: string;
      provider: string;
      member_count: number;
      topic: string;
    }> = [];

    let slackConnected = false;

    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('user_id', user.id)
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
        const channels = await listSlackChannels(accessToken);
        options.push(
          ...channels.map((channel) => ({
            ...channel,
            provider: 'slack',
          }))
        );
      }
    }

    return NextResponse.json({
      options,
      noIntegrationsConnected: !slackConnected,
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
