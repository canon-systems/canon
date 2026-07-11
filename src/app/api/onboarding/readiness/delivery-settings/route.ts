import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createLogger } from '@/lib/server/logging';
import { requireWorkspace, requireWorkspaceAdmin } from '@/lib/server/organization';

export const dynamic = 'force-dynamic';

const log = createLogger('api.onboarding.readiness.delivery_settings', {
  label: 'Readiness Delivery Settings',
  eventLabels: {
    settings_loaded: 'Settings Loaded',
    settings_save_requested: 'Settings Save Requested',
    settings_saved: 'Settings Saved',
  },
});

function validSlackChannelIds(values: unknown): string[] {
  return Array.isArray(values)
    ? values
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
        .filter((value) => /^[CG][A-Z0-9]+$/.test(value))
    : [];
}

function validSlackDmTargets(values: unknown): string[] {
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

    const { supabase, organization } = await requireWorkspace(user);

    const { data: settings, error } = await supabase
      .from('readiness_delivery_settings')
      .select('channel_ids, channel_names, slack_user_ids')
      .eq('organization_id', organization.id)
      .maybeSingle();

    if (error) throw error;

    log.info('settings_loaded', {
      userId: user.id,
      orgId: organization.id,
      channelCount: Array.isArray(settings?.channel_ids) ? settings.channel_ids.length : 0,
      dmTargets: Array.isArray(settings?.slack_user_ids) ? settings.slack_user_ids.length : 0,
    });

    return NextResponse.json({
      settings: settings
        ? {
            channelIds: validSlackChannelIds(settings.channel_ids),
            channelNames: Array.isArray(settings.channel_names)
              ? settings.channel_names.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
              : [],
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
      channelIds?: unknown;
      channelNames?: unknown;
      userIds?: unknown;
    };

    const channelIds = Array.from(new Set(validSlackChannelIds(body.channelIds)));
    const channelNames = channelIds.length > 0 && Array.isArray(body.channelNames)
      ? body.channelNames
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map((v) => v.replace(/^#/, '').trim())
          .slice(0, channelIds.length)
      : [];
    const userIds = Array.from(new Set(validSlackDmTargets(body.userIds)));

    log.info('settings_save_requested', {
      userId: user.id,
      channelCount: channelIds.length,
      dmTargets: userIds.length,
    });

    const { supabase, organization } = await requireWorkspaceAdmin(user);

    const updatedAt = new Date().toISOString();
    const { data: settings, error } = await supabase
      .from('readiness_delivery_settings')
      .upsert({
        organization_id: organization.id,
        channel_ids: channelIds,
        channel_names: channelNames,
        slack_user_ids: userIds,
        updated_at: updatedAt,
      }, { onConflict: 'organization_id' })
      .select('channel_ids, channel_names, slack_user_ids')
      .single();

    if (error) throw error;

    log.info('settings_saved', {
      userId: user.id,
      orgId: organization.id,
      channelCount: Array.isArray(settings.channel_ids) ? settings.channel_ids.length : 0,
      dmTargets: Array.isArray(settings.slack_user_ids) ? settings.slack_user_ids.length : 0,
    });

    return NextResponse.json({
      settings: {
        channelIds: validSlackChannelIds(settings.channel_ids),
        channelNames: Array.isArray(settings.channel_names)
          ? settings.channel_names.filter((v): v is string => typeof v === 'string')
          : [],
        userIds: validSlackDmTargets(settings.slack_user_ids),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/readiness/delivery-settings] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to save readiness delivery settings', detail: message }, { status: 500 });
  }
}
