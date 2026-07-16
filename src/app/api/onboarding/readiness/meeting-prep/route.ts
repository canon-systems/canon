import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { inngest } from '@/inngest/client';
import { INNGEST_EVENTS } from '@/inngest/constants';
import { syncCalendarConnection, type CalendarConnection } from '@/lib/server/integrations/calendar-sync';
import { reconcileNangoWorkspaceConnections } from '@/lib/server/integrations/nango-reconciliation';
import { isWorkspaceAdmin, requireWorkspace, requireWorkspaceAdmin } from '@/lib/server/organization';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type ConnectionRow = {
  provider: 'google_calendar' | 'outlook';
  status: string;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

type MeetingRow = {
  id: string;
  provider: 'google_calendar' | 'outlook';
  title: string;
  start_at: string;
  end_at: string | null;
  meeting_url: string | null;
  customer_domain: string | null;
  status: 'active' | 'cancelled';
};

type DeliveryRow = {
  id: string;
  meeting_event_id: string;
  target_provider: 'slack' | 'teams';
  target_id: string;
  target_name: string | null;
  status: 'pending' | 'delivered' | 'skipped' | 'failed';
  reason: string | null;
  brief_text: string | null;
  attempt_count: number;
  delivered_at: string | null;
  last_attempt_at: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

function metadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function providerLabel(provider: ConnectionRow['provider']) {
  return provider === 'google_calendar' ? 'Google Calendar' : 'Outlook';
}

function meetingDeliveryStatus(deliveries: DeliveryRow[]) {
  if (deliveries.some((delivery) => delivery.status === 'failed')) return 'failed';
  if (deliveries.some((delivery) => delivery.status === 'pending')) return 'pending';
  if (deliveries.some((delivery) => delivery.status === 'delivered')) return 'delivered';
  if (deliveries.length > 0 && deliveries.every((delivery) => delivery.status === 'skipped')) return 'skipped';
  return 'waiting';
}

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { supabase, organization } = await requireWorkspace(user);
    const now = new Date();
    const recentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const [connectionsResult, meetingsResult, deliveriesResult] = await Promise.all([
      supabase
        .from('oauth_connections')
        .select('provider, status, metadata, updated_at')
        .eq('organization_id', organization.id)
        .in('provider', ['google_calendar', 'outlook'])
        .order('provider', { ascending: true }),
      supabase
        .from('meeting_events')
        .select('id, provider, title, start_at, end_at, meeting_url, customer_domain, status')
        .eq('organization_id', organization.id)
        .gte('start_at', recentStart)
        .lte('start_at', futureEnd)
        .order('start_at', { ascending: true })
        .limit(200),
      supabase
        .from('meeting_prep_deliveries')
        .select('id, meeting_event_id, target_provider, target_id, target_name, status, reason, brief_text, attempt_count, delivered_at, last_attempt_at, metadata, updated_at')
        .eq('organization_id', organization.id)
        .order('updated_at', { ascending: false })
        .limit(100),
    ]);

    if (connectionsResult.error) throw connectionsResult.error;
    if (meetingsResult.error) throw meetingsResult.error;
    if (deliveriesResult.error) throw deliveriesResult.error;

    const connections = (connectionsResult.data ?? []) as ConnectionRow[];
    const meetings = (meetingsResult.data ?? []) as MeetingRow[];
    const deliveries = (deliveriesResult.data ?? []) as DeliveryRow[];
    const activeCalendarProviders = new Set(connections
      .filter((connection) => connection.status === 'active')
      .map((connection) => connection.provider));
    const visibleMeetings = meetings.filter((meeting) => activeCalendarProviders.has(meeting.provider));
    const deliveriesByMeeting = new Map<string, DeliveryRow[]>();
    for (const delivery of deliveries) {
      deliveriesByMeeting.set(delivery.meeting_event_id, [
        ...(deliveriesByMeeting.get(delivery.meeting_event_id) ?? []),
        delivery,
      ]);
    }
    const meetingsById = new Map(visibleMeetings.map((meeting) => [meeting.id, meeting]));

    const calendarProviders = connections.map((connection) => ({
      provider: connection.provider,
      label: providerLabel(connection.provider),
      connected: connection.status === 'active',
      syncStatus: metadataString(connection.metadata, 'calendar_sync_status') ?? 'waiting',
      lastSyncedAt: metadataString(connection.metadata, 'calendar_last_synced_at'),
      error: metadataString(connection.metadata, 'calendar_sync_error'),
    }));
    const lastSyncedAt = calendarProviders
      .flatMap((provider) => provider.lastSyncedAt ? [provider.lastSyncedAt] : [])
      .sort((a, b) => b.localeCompare(a))[0] ?? null;
    const upcoming = visibleMeetings
      .filter((meeting) => meeting.status === 'active' && new Date(meeting.start_at).getTime() >= now.getTime())
      .slice(0, 30)
      .map((meeting) => {
        const meetingDeliveries = deliveriesByMeeting.get(meeting.id) ?? [];
        return {
          id: meeting.id,
          provider: meeting.provider,
          providerLabel: providerLabel(meeting.provider),
          title: meeting.title,
          startAt: meeting.start_at,
          endAt: meeting.end_at,
          meetingUrl: meeting.meeting_url,
          customerDomain: meeting.customer_domain,
          briefingStatus: meetingDeliveryStatus(meetingDeliveries),
          recipients: meetingDeliveries.map((delivery) => delivery.target_name ?? delivery.target_id),
        };
      });
    const history = deliveries.slice(0, 30).flatMap((delivery) => {
      const meeting = meetingsById.get(delivery.meeting_event_id);
      if (!meeting) return [];
      return [{
        id: delivery.id,
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        meetingStartAt: meeting.start_at,
        recipient: delivery.target_name ?? delivery.target_id,
        status: delivery.status,
        reason: delivery.reason,
        briefText: delivery.brief_text,
        attempts: delivery.attempt_count,
        deliveredAt: delivery.delivered_at,
        lastAttemptAt: delivery.last_attempt_at,
        permalink: metadataString(delivery.metadata, 'permalink'),
      }];
    });
    const delivered = history.filter((delivery) => delivery.status === 'delivered').length;
    const needsAttention = history.filter((delivery) => delivery.status === 'failed').length
      + calendarProviders.filter((provider) => provider.syncStatus === 'needs_attention').length;

    return NextResponse.json({
      calendar: {
        connected: calendarProviders.some((provider) => provider.connected),
        providers: calendarProviders,
        lastSyncedAt,
      },
      summary: {
        upcoming: upcoming.length,
        delivered,
        needsAttention,
      },
      upcoming,
      history,
      permissions: { canSync: isWorkspaceAdmin(organization.role) },
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/readiness/meeting-prep] GET failed', error);
    return NextResponse.json({ error: 'Canon could not load meeting briefings.', detail }, { status: 500 });
  }
}

export async function POST() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { organization } = await requireWorkspaceAdmin(user);
    const supabase = createServiceRoleClient();
    await reconcileNangoWorkspaceConnections({
      supabase,
      organizationId: organization.id,
      connectedByUserId: user.id,
      providers: ['google_calendar', 'outlook'],
    }).catch((reconciliationError) => {
      console.warn('[api/onboarding/readiness/meeting-prep] Nango reconciliation failed', reconciliationError);
    });
    const { data: connections, error } = await supabase
      .from('oauth_connections')
      .select('organization_id, provider, connection_id, metadata')
      .eq('organization_id', organization.id)
      .in('provider', ['google_calendar', 'outlook'])
      .eq('status', 'active');

    if (error) throw error;
    if (!connections || connections.length === 0) {
      return NextResponse.json({ error: 'Connect a calendar before refreshing meetings.' }, { status: 400 });
    }

    const results = await Promise.allSettled((connections as CalendarConnection[]).map((connection) => (
      syncCalendarConnection({ supabase, connection })
    )));
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length > 0) {
      await inngest.send({
        name: INNGEST_EVENTS.CALENDAR_SYNC_REQUESTED,
        data: { organizationId: organization.id, reason: 'manual_refresh_retry' },
      }).catch(() => undefined);
    }
    const synced = results.flatMap((result) => result.status === 'fulfilled' ? [result.value.synced] : [])
      .reduce((total, count) => total + count, 0);

    await inngest.send({
      name: INNGEST_EVENTS.MEETING_PREP_CHECK_REQUESTED,
      data: { organizationId: organization.id, reason: 'manual_calendar_refresh' },
    });

    return NextResponse.json({
      refreshed: true,
      synced,
      connections: connections.length,
      needsAttention: failed.length,
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/readiness/meeting-prep] POST failed', error);
    return NextResponse.json({ error: 'Canon could not refresh the calendar.', detail }, { status: 500 });
  }
}
