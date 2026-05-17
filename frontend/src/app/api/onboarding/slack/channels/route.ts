import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type SlackChannelRaw = {
  id: string;
  name: string;
  num_members?: number;
  topic?: { value?: string };
};

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id, slack_bot_token')
      .eq('owner_id', user.id)
      .single();

    if (!org?.slack_bot_token) {
      return NextResponse.json({ error: 'No Slack bot token configured' }, { status: 400 });
    }

    const channels: { id: string; name: string; member_count: number; topic: string }[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({ limit: '200', exclude_archived: 'true', types: 'public_channel' });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`https://slack.com/api/conversations.list?${params}`, {
        headers: { Authorization: `Bearer ${org.slack_bot_token}` },
      });
      const data = (await res.json()) as {
        ok: boolean;
        channels?: SlackChannelRaw[];
        response_metadata?: { next_cursor?: string };
      };

      if (!data.ok || !data.channels) break;

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
