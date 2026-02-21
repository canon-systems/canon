import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceSignalSettings, updateWorkspaceSignalSettings } from '@/lib/server/signals/settings';
import { DEFAULT_SIGNAL_TIME_ZONE, parseTimeZoneParam } from '@/lib/server/signals/window';

const DELIVERY_PREFERENCES = ['slack_only', 'email_only', 'slack_then_email'] as const;
const TIME_ZONE_COOKIE = 'canon_tz';

export const dynamic = 'force-dynamic';

function isValidSlackChannel(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  const isChannelId = /^[CGD][A-Z0-9]{8,}$/.test(trimmed);
  const isLegacyChannelName = /^#[a-z0-9][a-z0-9._-]{0,79}$/i.test(trimmed);
  return isChannelId || isLegacyChannelName;
}

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const settings = await getWorkspaceSignalSettings({ supabase, userId: user.id });
    const cookieStore = await cookies();
    const cookieTimeZone = parseTimeZoneParam(cookieStore.get(TIME_ZONE_COOKIE)?.value);
    const resolvedTimeZone = cookieTimeZone || settings.time_zone || DEFAULT_SIGNAL_TIME_ZONE;
    return NextResponse.json(
      {
        slack_channel: settings.slack_channel,
        email_digest_enabled: settings.email_digest_enabled,
        email_digest_to: settings.email_digest_to,
        delivery_preference: settings.delivery_preference,
        baseline_window_days: settings.baseline_window_days,
        time_zone: resolvedTimeZone,
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
    const baselineWindowDaysRaw = body.baseline_window_days;
    const emailDigestEnabledRaw = body.email_digest_enabled;
    const emailDigestToRaw = body.email_digest_to;
    const deliveryPreferenceRaw = body.delivery_preference;
    const timeZoneRaw = body.time_zone;
    const slack_channel =
      typeof slackChannelRaw === 'string'
        ? slackChannelRaw.trim() || null
        : slackChannelRaw === null
          ? null
          : undefined;
    const email_digest_enabled =
      typeof emailDigestEnabledRaw === 'boolean'
        ? emailDigestEnabledRaw
        : emailDigestEnabledRaw === undefined
          ? undefined
          : null;
    const emailDigestToProvided = Object.prototype.hasOwnProperty.call(body, 'email_digest_to');
    const email_digest_to =
      typeof emailDigestToRaw === 'string'
        ? emailDigestToRaw.trim() || null
        : emailDigestToRaw === null
          ? null
          : undefined;
    const delivery_preference =
      typeof deliveryPreferenceRaw === 'string' && DELIVERY_PREFERENCES.includes(deliveryPreferenceRaw as (typeof DELIVERY_PREFERENCES)[number])
        ? (deliveryPreferenceRaw as (typeof DELIVERY_PREFERENCES)[number])
        : deliveryPreferenceRaw === undefined
          ? undefined
          : null;
    const baseline_window_days =
      typeof baselineWindowDaysRaw === 'number'
        ? baselineWindowDaysRaw
        : baselineWindowDaysRaw === undefined
          ? undefined
          : null;
    const parsedTimeZone = typeof timeZoneRaw === 'string' ? parseTimeZoneParam(timeZoneRaw) : null;
    const time_zone =
      typeof timeZoneRaw === 'string'
        ? parsedTimeZone
        : timeZoneRaw === null
          ? null
          : timeZoneRaw === undefined
            ? undefined
            : '__invalid__';

    if (
      slack_channel === undefined ||
      email_digest_enabled === null ||
      (emailDigestToProvided && email_digest_to === undefined) ||
      delivery_preference === null ||
      baseline_window_days === null ||
      time_zone === '__invalid__'
    ) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    if (typeof timeZoneRaw === 'string' && !parsedTimeZone) {
      return NextResponse.json({ error: 'Invalid time zone' }, { status: 400 });
    }

    if (typeof slack_channel === 'string' && !isValidSlackChannel(slack_channel)) {
      return NextResponse.json(
        { error: 'Invalid Slack channel. Use a channel ID like C0123456789 or legacy #channel-name.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const requestedTimeZone =
      time_zone === undefined ? undefined : normalizeTimeZoneValue(time_zone);
    const settings = await updateWorkspaceSignalSettings({
      supabase,
      userId: user.id,
      patch: {
        slack_channel,
        ...(email_digest_enabled !== undefined ? { email_digest_enabled } : {}),
        ...(emailDigestToProvided ? { email_digest_to } : {}),
        ...(delivery_preference !== undefined ? { delivery_preference } : {}),
        ...(baseline_window_days !== undefined ? { baseline_window_days } : {}),
        ...(requestedTimeZone !== undefined ? { time_zone: requestedTimeZone } : {}),
      },
    });
    const resolvedTimeZone = requestedTimeZone ?? settings.time_zone ?? DEFAULT_SIGNAL_TIME_ZONE;
    const response = NextResponse.json(
      {
        slack_channel: settings.slack_channel,
        email_digest_enabled: settings.email_digest_enabled,
        email_digest_to: settings.email_digest_to,
        delivery_preference: settings.delivery_preference,
        baseline_window_days: settings.baseline_window_days,
        time_zone: resolvedTimeZone,
      },
      { status: 200 }
    );

    if (requestedTimeZone !== undefined) {
      response.cookies.set(TIME_ZONE_COOKIE, resolvedTimeZone, {
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/settings/delivery] PUT failed', error);
    return NextResponse.json({ error: 'Failed to update delivery settings', detail: message }, { status: 500 });
  }
}

function normalizeTimeZoneValue(value: string | null): string {
  if (value === null) return DEFAULT_SIGNAL_TIME_ZONE;
  return value;
}
