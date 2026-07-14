import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listDeliveryTargets } from '@/lib/server/integrations/chat-targets';
import { listSlackChannels } from '@/lib/server/integrations/nativeSlack';
import { requireWorkspace } from '@/lib/server/organization';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import { isReadinessDeliveryProvider } from '@/lib/server/readiness/delivery-targets';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type SlackUserRaw = {
  id: string;
  name?: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  is_app_user?: boolean;
  profile?: {
    email?: string;
    display_name?: string;
    real_name?: string;
  };
};

type SlackUsersListResponse = {
  ok: boolean;
  error?: string;
  needed?: string;
  provided?: string;
  members?: SlackUserRaw[];
  response_metadata?: { next_cursor?: string };
};

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

async function listSlackUsers(accessToken: string) {
  const users: Array<{ id: string; name: string; email: string | null }> = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`https://slack.com/api/users.list?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as SlackUsersListResponse;
    if (!data.ok || !data.members) break;

    users.push(
      ...data.members.flatMap((member) => {
        if (member.id === 'USLACKBOT') return [];
        if (member.deleted || member.is_bot || member.is_app_user) return [];
        const name = member.profile?.display_name || member.real_name || member.profile?.real_name || member.name || member.id;
        return [{ id: member.id, name, email: member.profile?.email ?? null }];
      })
    );

    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor && users.length < 1000);

  return users.sort((a, b) => a.name.localeCompare(b.name));
}

async function listSlackTargets(organizationId: string) {
  const connectionId = await activeSlackConnectionId(organizationId);
  if (!connectionId) return { targets: [], reconnectRequired: false };

  const accessToken = await getProviderAccessToken({ provider: 'slack', connectionId });
  if (!accessToken) return { targets: [], reconnectRequired: true };

  const [channels, users] = await Promise.all([
    listSlackChannels(accessToken).catch(() => []),
    listSlackUsers(accessToken).catch(() => []),
  ]);

  return {
    targets: [
      ...channels.map((channel) => ({
        provider: 'slack' as const,
        targetType: 'channel' as const,
        targetId: channel.id,
        targetName: channel.name,
        enabled: true,
        label: `#${channel.name}`,
      })),
      ...users.map((user) => ({
        provider: 'slack' as const,
        targetType: 'dm' as const,
        targetId: user.id,
        targetName: user.name,
        enabled: true,
        label: user.name,
      })),
    ],
    reconnectRequired: false,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const provider = request.nextUrl.searchParams.get('provider');
    if (!isReadinessDeliveryProvider(provider)) {
      return NextResponse.json({ error: 'Unsupported delivery provider' }, { status: 400 });
    }

    const { organization } = await requireWorkspace(user);
    if (provider === 'slack') {
      const { targets, reconnectRequired } = await listSlackTargets(organization.id);
      return NextResponse.json({ targets, reconnectRequired });
    }

    const targets = await listDeliveryTargets({ organizationId: organization.id, provider });
    return NextResponse.json({ targets, reconnectRequired: false });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/readiness/delivery-target-options] GET failed', error);
    return NextResponse.json({ error: 'Failed to load delivery targets', detail }, { status: 500 });
  }
}
