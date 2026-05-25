import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';

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

function badRequest(payload: Record<string, unknown>) {
  console.warn('[api/onboarding/slack/users] GET blocked', payload);
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
    if (!connectionId) return badRequest({ error: 'No active Slack connection' });

    const accessToken = await getProviderAccessToken({ provider: 'slack', connectionId });
    if (!accessToken) return badRequest({ error: 'No Slack access token available', connectionId });

    const users: { id: string; name: string; email: string | null }[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({ limit: '200' });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`https://slack.com/api/users.list?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await res.json()) as SlackUsersListResponse;

      if (!data.ok || !data.members) {
        if (data.error === 'missing_scope') {
          return NextResponse.json({
            users: [],
            reconnect_required: true,
            missing_scopes: data.needed ? data.needed.split(',').map((scope) => scope.trim()).filter(Boolean) : ['users:read'],
            provided_scopes: data.provided ? data.provided.split(',').map((scope) => scope.trim()).filter(Boolean) : [],
          });
        }

        return badRequest({
          error: 'Slack API failed to list users',
          detail: data.error ?? 'unknown_error',
          needed: data.needed,
          provided: data.provided,
        });
      }

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

    return NextResponse.json({ users: users.sort((a, b) => a.name.localeCompare(b.name)) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/slack/users] GET failed', error);
    return NextResponse.json({ error: 'Failed to load Slack users', detail: message }, { status: 500 });
  }
}
