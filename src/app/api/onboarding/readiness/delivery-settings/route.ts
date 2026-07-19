import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createLogger } from '@/lib/server/logging';
import { demoDeliverySettings } from '@/lib/server/demo-workspace-data';
import { isDemoOrganization, requireWorkspace, requireWorkspaceAdmin } from '@/lib/server/organization';
import {
  validDeliveryTargets,
  validSlackChannelIds,
  validSlackDmTargets,
} from '@/lib/server/readiness/delivery-targets';

export const dynamic = 'force-dynamic';

const log = createLogger('api.onboarding.readiness.delivery_settings', {
  label: 'Readiness Delivery Settings',
  eventLabels: {
    settings_loaded: 'Settings Loaded',
    settings_save_requested: 'Settings Save Requested',
    settings_saved: 'Settings Saved',
  },
});

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { supabase, organization } = await requireWorkspace(user);
    if (isDemoOrganization(organization)) return NextResponse.json({ settings: demoDeliverySettings() });

    const { data: settings, error } = await supabase
      .from('readiness_delivery_settings')
      .select('channel_ids, channel_names, slack_user_ids, weekly_digest_enabled, digest_weekday, digest_hour_utc, meeting_prep_enabled, meeting_prep_minutes_before, last_digest_sent_at')
      .eq('organization_id', organization.id)
      .maybeSingle();

    if (error) throw error;

    const { data: targets, error: targetsError } = await supabase
      .from('readiness_delivery_targets')
      .select('id, provider, target_type, target_id, target_name, enabled')
      .eq('organization_id', organization.id)
      .eq('provider', 'slack')
      .order('provider', { ascending: true })
      .order('target_type', { ascending: true })
      .order('target_name', { ascending: true });

    if (targetsError) throw targetsError;

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
            weeklyDigestEnabled: settings.weekly_digest_enabled !== false,
            digestWeekday: typeof settings.digest_weekday === 'number' ? settings.digest_weekday : 1,
            digestHourUtc: typeof settings.digest_hour_utc === 'number' ? settings.digest_hour_utc : 13,
            meetingPrepEnabled: settings.meeting_prep_enabled !== false,
            meetingPrepMinutesBefore: typeof settings.meeting_prep_minutes_before === 'number' ? settings.meeting_prep_minutes_before : 45,
            lastDigestSentAt: typeof settings.last_digest_sent_at === 'string' ? settings.last_digest_sent_at : null,
            targets: (targets ?? []).map((target) => ({
              id: target.id,
              provider: target.provider,
              targetType: target.target_type,
              targetId: target.target_id,
              targetName: target.target_name,
              enabled: target.enabled,
            })),
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
      targets?: unknown;
      weeklyDigestEnabled?: unknown;
      digestWeekday?: unknown;
      digestHourUtc?: unknown;
      meetingPrepEnabled?: unknown;
      meetingPrepMinutesBefore?: unknown;
    };

    const channelIds = Array.from(new Set(validSlackChannelIds(body.channelIds)));
    const channelNames = channelIds.length > 0 && Array.isArray(body.channelNames)
      ? body.channelNames
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map((v) => v.replace(/^#/, '').trim())
          .slice(0, channelIds.length)
      : [];
    const userIds = Array.from(new Set(validSlackDmTargets(body.userIds)));
    const providerTargets = validDeliveryTargets(body.targets).filter((target) => target.provider === 'slack');
    const targets = providerTargets.length > 0
      ? providerTargets
      : [
          ...channelIds.map((channelId, index) => ({
            provider: 'slack' as const,
            targetType: 'channel' as const,
            targetId: channelId,
            targetName: channelNames[index] ?? null,
            enabled: true,
          })),
          ...userIds.map((userId) => ({
            provider: 'slack' as const,
            targetType: 'dm' as const,
            targetId: userId,
            targetName: null,
            enabled: true,
          })),
        ];
    const digestWeekday = typeof body.digestWeekday === 'number' && body.digestWeekday >= 0 && body.digestWeekday <= 6
      ? body.digestWeekday
      : 1;
    const digestHourUtc = typeof body.digestHourUtc === 'number' && body.digestHourUtc >= 0 && body.digestHourUtc <= 23
      ? body.digestHourUtc
      : 13;
    const meetingPrepMinutesBefore = typeof body.meetingPrepMinutesBefore === 'number' && body.meetingPrepMinutesBefore >= 5 && body.meetingPrepMinutesBefore <= 240
      ? body.meetingPrepMinutesBefore
      : 45;

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
        weekly_digest_enabled: body.weeklyDigestEnabled !== false,
        digest_weekday: digestWeekday,
        digest_hour_utc: digestHourUtc,
        meeting_prep_enabled: body.meetingPrepEnabled !== false,
        meeting_prep_minutes_before: meetingPrepMinutesBefore,
        updated_at: updatedAt,
      }, { onConflict: 'organization_id' })
      .select('channel_ids, channel_names, slack_user_ids, weekly_digest_enabled, digest_weekday, digest_hour_utc, meeting_prep_enabled, meeting_prep_minutes_before, last_digest_sent_at')
      .single();

    if (error) throw error;

    const { error: disableError } = await supabase
      .from('readiness_delivery_targets')
      .update({ enabled: false, updated_at: updatedAt })
      .eq('organization_id', organization.id)
      .eq('provider', 'slack');

    if (disableError) throw disableError;

    if (targets.length > 0) {
      const { error: targetError } = await supabase
        .from('readiness_delivery_targets')
        .upsert(
          targets.map((target) => ({
            organization_id: organization.id,
            provider: target.provider,
            target_type: target.targetType,
            target_id: target.targetId,
            target_name: target.targetName,
            enabled: target.enabled,
            updated_at: updatedAt,
          })),
          { onConflict: 'organization_id,provider,target_type,target_id' }
        );

      if (targetError) throw targetError;
    }

    const { data: savedTargets, error: savedTargetsError } = await supabase
      .from('readiness_delivery_targets')
      .select('id, provider, target_type, target_id, target_name, enabled')
      .eq('organization_id', organization.id)
      .eq('provider', 'slack')
      .eq('enabled', true);

    if (savedTargetsError) throw savedTargetsError;

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
        weeklyDigestEnabled: settings.weekly_digest_enabled !== false,
        digestWeekday: typeof settings.digest_weekday === 'number' ? settings.digest_weekday : 1,
        digestHourUtc: typeof settings.digest_hour_utc === 'number' ? settings.digest_hour_utc : 13,
        meetingPrepEnabled: settings.meeting_prep_enabled !== false,
        meetingPrepMinutesBefore: typeof settings.meeting_prep_minutes_before === 'number' ? settings.meeting_prep_minutes_before : 45,
        lastDigestSentAt: typeof settings.last_digest_sent_at === 'string' ? settings.last_digest_sent_at : null,
        targets: (savedTargets ?? []).map((target) => ({
          id: target.id,
          provider: target.provider,
          targetType: target.target_type,
          targetId: target.target_id,
          targetName: target.target_name,
          enabled: target.enabled,
        })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/readiness/delivery-settings] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to save readiness delivery settings', detail: message }, { status: 500 });
  }
}
