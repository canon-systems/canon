import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/server/logging';

export const dynamic = 'force-dynamic';

const log = createLogger('api.onboarding.readiness.delivery_settings', {
  label: 'Readiness Delivery Settings',
  eventLabels: {
    settings_loaded: 'Settings Loaded',
    settings_save_requested: 'Settings Save Requested',
    settings_saved: 'Settings Saved',
  },
});

function validSlackDmTargets(values: unknown) {
  return Array.isArray(values)
    ? values
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
        .filter((value) => value !== 'USLACKBOT')
        .filter((value) => /^[DU][A-Z0-9]+$/.test(value))
    : [];
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

    log.info('settings_loaded', {
      userId: user.id,
      orgId: org.id,
      channelId: settings?.channel_id ?? 'auto',
      dmTargets: Array.isArray(settings?.slack_user_ids) ? settings.slack_user_ids.length : 0,
    });

    return NextResponse.json({
      settings: settings
        ? {
            channelId: settings.channel_id ?? 'auto',
            channelName: settings.channel_name ?? null,
            userIds: validSlackDmTargets(settings.slack_user_ids),
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
    const userIds = validSlackDmTargets(body.userIds);

    log.info('settings_save_requested', {
      userId: user.id,
      channelId: channelId ?? 'auto',
      channelName: channelName ?? null,
      dmTargets: Array.from(new Set(userIds)),
    });

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

    log.info('settings_saved', {
      userId: user.id,
      orgId: org.id,
      channelId: settings.channel_id ?? 'auto',
      channelName: settings.channel_name ?? null,
      dmTargets: Array.isArray(settings.slack_user_ids) ? settings.slack_user_ids : [],
    });

    return NextResponse.json({
      settings: {
        channelId: settings.channel_id ?? 'auto',
        channelName: settings.channel_name ?? null,
        userIds: validSlackDmTargets(settings.slack_user_ids),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/readiness/delivery-settings] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to save readiness delivery settings', detail: message }, { status: 500 });
  }
}
