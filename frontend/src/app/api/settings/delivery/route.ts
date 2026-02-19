import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceSignalSettings, updateWorkspaceSignalSettings } from '@/lib/server/signals/settings';

const DELIVERY_PREFERENCES = ['slack_only', 'email_only', 'slack_then_email'] as const;

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
    return NextResponse.json(
      {
        slack_channel: settings.slack_channel,
        email_digest_enabled: settings.email_digest_enabled,
        email_digest_to: settings.email_digest_to,
        delivery_preference: settings.delivery_preference,
        baseline_window_days: settings.baseline_window_days,
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

    if (
      slack_channel === undefined ||
      email_digest_enabled === null ||
      (emailDigestToProvided && email_digest_to === undefined) ||
      delivery_preference === null ||
      baseline_window_days === null
    ) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    if (typeof slack_channel === 'string' && !isValidSlackChannel(slack_channel)) {
      return NextResponse.json(
        { error: 'Invalid Slack channel. Use a channel ID like C0123456789 or legacy #channel-name.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const settings = await updateWorkspaceSignalSettings({
      supabase,
      userId: user.id,
      patch: {
        slack_channel,
        ...(email_digest_enabled !== undefined ? { email_digest_enabled } : {}),
        ...(emailDigestToProvided ? { email_digest_to } : {}),
        ...(delivery_preference !== undefined ? { delivery_preference } : {}),
        ...(baseline_window_days !== undefined ? { baseline_window_days } : {}),
      },
    });

    return NextResponse.json(
      {
        slack_channel: settings.slack_channel,
        email_digest_enabled: settings.email_digest_enabled,
        email_digest_to: settings.email_digest_to,
        delivery_preference: settings.delivery_preference,
        baseline_window_days: settings.baseline_window_days,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/settings/delivery] PUT failed', error);
    return NextResponse.json({ error: 'Failed to update delivery settings', detail: message }, { status: 500 });
  }
}
