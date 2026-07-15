import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listSlackChannels } from '@/lib/server/integrations/nativeSlack';
import { requireWorkspace } from '@/lib/server/organization';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function activeSlackConnectionId(organizationId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('oauth_connections')
    .select('connection_id')
    .eq('organization_id', organizationId)
    .eq('provider', 'slack')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.connection_id ?? null;
}

async function listSlackTargets(organizationId: string) {
  const connectionId = await activeSlackConnectionId(organizationId);
  if (!connectionId) return { targets: [], reconnectRequired: false };

  const accessToken = await getProviderAccessToken({ provider: 'slack', connectionId });
  if (!accessToken) return { targets: [], reconnectRequired: true };

  const channels = await listSlackChannels(accessToken).catch(() => []);

  return {
    targets: channels.map((channel) => ({
      provider: 'slack' as const,
      targetType: 'channel' as const,
      targetId: channel.id,
      targetName: channel.name,
      enabled: true,
      label: `#${channel.name}`,
    })),
    reconnectRequired: false,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const provider = request.nextUrl.searchParams.get('provider');
    if (provider !== 'slack') {
      return NextResponse.json({ error: 'Unsupported delivery provider' }, { status: 400 });
    }

    const { organization } = await requireWorkspace(user);
    const { targets, reconnectRequired } = await listSlackTargets(organization.id);
    return NextResponse.json({ targets, reconnectRequired });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/readiness/delivery-target-options] GET failed', error);
    return NextResponse.json({ error: 'Failed to load delivery targets', detail }, { status: 500 });
  }
}
