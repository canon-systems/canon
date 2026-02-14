import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceSignalSettings, updateWorkspaceSignalSettings } from '@/lib/server/signals/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const settings = await getWorkspaceSignalSettings({ supabase, userId: user.id });
    return NextResponse.json(
      {
        slack_channel: settings.slack_channel,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/settings/delivery] GET failed', error);
    return NextResponse.json({ error: 'Failed to load delivery settings', detail: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const slackChannelRaw = body.slack_channel;
    const slack_channel =
      typeof slackChannelRaw === 'string'
        ? slackChannelRaw.trim() || null
        : slackChannelRaw === null
          ? null
          : undefined;

    if (slack_channel === undefined) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = await createClient();
    const settings = await updateWorkspaceSignalSettings({
      supabase,
      userId: user.id,
      patch: { slack_channel },
    });

    return NextResponse.json(
      {
        slack_channel: settings.slack_channel,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/settings/delivery] PUT failed', error);
    return NextResponse.json({ error: 'Failed to update delivery settings', detail: message }, { status: 500 });
  }
}
