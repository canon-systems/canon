import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function validSlackUserIds(values: unknown) {
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
}

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ settings: null });

    const { data: settings, error } = await supabase
      .from('readiness_delivery_settings')
      .select('channel_id, channel_name, slack_user_ids')
      .eq('organization_id', org.id)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      settings: settings
        ? {
            channelId: settings.channel_id ?? 'auto',
            channelName: settings.channel_name ?? null,
            userIds: Array.isArray(settings.slack_user_ids) ? settings.slack_user_ids : [],
          }
        : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/readiness/delivery-settings] GET failed', error);
    return NextResponse.json({ error: 'Failed to load readiness delivery settings', detail: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      channelId?: unknown;
      channelName?: unknown;
      userIds?: unknown;
    };

    const channelId = typeof body.channelId === 'string' && body.channelId !== 'auto' && body.channelId.trim().length > 0
      ? body.channelId.trim()
      : null;
    const channelName = typeof body.channelName === 'string' && channelId ? body.channelName.replace(/^#/, '').trim() : null;
    const userIds = validSlackUserIds(body.userIds);
    if (Array.isArray(body.userIds) && userIds.length !== body.userIds.length) {
      return NextResponse.json({ error: 'Invalid Slack user' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const updatedAt = new Date().toISOString();
    const { data: settings, error } = await supabase
      .from('readiness_delivery_settings')
      .upsert({
        organization_id: org.id,
        channel_id: channelId,
        channel_name: channelName,
        slack_user_ids: Array.from(new Set(userIds)),
        updated_at: updatedAt,
      }, { onConflict: 'organization_id' })
      .select('channel_id, channel_name, slack_user_ids')
      .single();

    if (error) throw error;

    return NextResponse.json({
      settings: {
        channelId: settings.channel_id ?? 'auto',
        channelName: settings.channel_name ?? null,
        userIds: Array.isArray(settings.slack_user_ids) ? settings.slack_user_ids : [],
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/readiness/delivery-settings] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to save readiness delivery settings', detail: message }, { status: 500 });
  }
}
