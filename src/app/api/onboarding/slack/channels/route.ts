import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import { listSlackChannels, SlackListChannelsError } from '@/lib/server/integrations/nativeSlack';

export const dynamic = 'force-dynamic';

function badRequest(payload: Record<string, unknown>) {
  console.warn('[api/onboarding/slack/channels] GET blocked', payload);
  return NextResponse.json(payload, { status: 400 });
}

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createClient();
    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('provider', 'slack')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const connectionId = connection?.connection_id;
    if (!connectionId) {
      return badRequest({ error: 'No active Slack connection' });
    }

    const accessToken = await getProviderAccessToken({ provider: 'slack', connectionId });
    if (!accessToken) {
      return badRequest({ error: 'No Slack access token available', connectionId });
    }

    const channels = await listSlackChannels(accessToken);
    return NextResponse.json({ channels });
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
    console.error('[api/onboarding/slack/channels] GET failed', error);
    return NextResponse.json({ error: 'Failed to load Slack channels', detail: message }, { status: 500 });
  }
}
