import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';

export const dynamic = 'force-dynamic';

type SlackChannelRaw = {
  id: string;
  name: string;
  num_members?: number;
  topic?: { value?: string };
};

type SlackConversationsListResponse = {
  ok: boolean;
  error?: string;
  needed?: string;
  provided?: string;
  channels?: SlackChannelRaw[];
  response_metadata?: { next_cursor?: string };
};

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

    const channels: { id: string; name: string; member_count: number; topic: string }[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({ limit: '200', exclude_archived: 'true', types: 'public_channel' });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`https://slack.com/api/conversations.list?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await res.json()) as SlackConversationsListResponse;

      if (!data.ok || !data.channels) {
        return badRequest({
          error: 'Slack API failed to list channels',
          detail: data.error ?? 'unknown_error',
          needed: data.needed,
          provided: data.provided,
        });
      }

      channels.push(
        ...data.channels.map((c) => ({
          id: c.id,
          name: c.name,
          member_count: c.num_members ?? 0,
          topic: c.topic?.value ?? '',
        }))
      );

      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor && channels.length < 1000);

    return NextResponse.json({ channels: channels.sort((a, b) => a.name.localeCompare(b.name)) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/slack/channels] GET failed', error);
    return NextResponse.json({ error: 'Failed to load Slack channels', detail: message }, { status: 500 });
  }
}
