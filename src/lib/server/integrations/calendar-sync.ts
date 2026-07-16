import { fetchUpcomingCalendarEvents, type CalendarProvider } from '@/lib/server/integrations/calendar';
import { errorMessage } from '@/lib/server/logging';
import { upsertReadinessSourceEvents } from '@/lib/server/readiness/source-events';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';

export type CalendarConnection = {
  organization_id: string;
  provider: CalendarProvider;
  connection_id: string;
  metadata: Record<string, unknown> | null;
};

type CalendarSyncWindow = { from: string; to: string };

export function calendarSyncWindow(now = new Date()): CalendarSyncWindow {
  return {
    from: now.toISOString(),
    to: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function meetingContent(event: {
  title: string;
  description: string | null;
  startAt: string;
  organizer: string | null;
  attendees: string[];
  customerDomain: string | null;
}) {
  return [
    `Meeting: ${event.title}`,
    event.description ? `Description: ${event.description}` : '',
    `Start: ${event.startAt}`,
    event.organizer ? `Organizer: ${event.organizer}` : '',
    event.attendees.length > 0 ? `Attendees: ${event.attendees.join(', ')}` : '',
    event.customerDomain ? `Customer domain: ${event.customerDomain}` : '',
  ].filter(Boolean).join('\n');
}

async function updateConnectionSyncState(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  connection: CalendarConnection;
  values: Record<string, unknown>;
}) {
  const { error } = await params.supabase
    .from('oauth_connections')
    .update({
      metadata: { ...(params.connection.metadata ?? {}), ...params.values } as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', params.connection.organization_id)
    .eq('connection_id', params.connection.connection_id);

  if (error) throw error;
}

export async function syncCalendarConnection(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  connection: CalendarConnection;
  window?: CalendarSyncWindow;
}) {
  const window = params.window ?? calendarSyncWindow();
  const syncStartedAt = new Date().toISOString();
  await updateConnectionSyncState({
    ...params,
    values: { calendar_sync_status: 'syncing', calendar_sync_error: null },
  });

  try {
    const fetched = await fetchUpcomingCalendarEvents({
      provider: params.connection.provider,
      connectionId: params.connection.connection_id,
      from: window.from,
      to: window.to,
    });

    const now = new Date().toISOString();
    if (fetched.events.length > 0) {
      const { error: upsertError } = await params.supabase
        .from('meeting_events')
        .upsert(
          fetched.events.map((calendarEvent) => ({
            organization_id: params.connection.organization_id,
            provider: params.connection.provider,
            external_id: calendarEvent.id,
            title: calendarEvent.title,
            description: calendarEvent.description,
            start_at: calendarEvent.startAt,
            end_at: calendarEvent.endAt,
            organizer: calendarEvent.organizer,
            attendees: calendarEvent.attendees,
            meeting_url: calendarEvent.meetingUrl,
            customer_domain: calendarEvent.customerDomain,
            metadata: calendarEvent.metadata as Json,
            status: 'active',
            connection_id: params.connection.connection_id,
            last_seen_at: syncStartedAt,
            updated_at: now,
          })),
          { onConflict: 'organization_id,provider,external_id' }
        );
      if (upsertError) throw upsertError;

      await upsertReadinessSourceEvents({
        supabase: params.supabase,
        events: fetched.events.map((calendarEvent) => ({
          organizationId: params.connection.organization_id,
          provider: params.connection.provider,
          sourceType: 'calendar',
          externalId: `${params.connection.provider}:${calendarEvent.id}`,
          content: meetingContent(calendarEvent),
          occurredAt: calendarEvent.startAt,
          metadata: {
            title: calendarEvent.title,
            start_at: calendarEvent.startAt,
            end_at: calendarEvent.endAt,
            organizer: calendarEvent.organizer,
            attendees: calendarEvent.attendees,
            meeting_url: calendarEvent.meetingUrl,
            customer_domain: calendarEvent.customerDomain,
          },
        })),
      });
    }

    if (fetched.cancelledIds.length > 0) {
      const { error: cancellationError } = await params.supabase
        .from('meeting_events')
        .update({ status: 'cancelled', last_seen_at: syncStartedAt, updated_at: now })
        .eq('organization_id', params.connection.organization_id)
        .eq('provider', params.connection.provider)
        .in('external_id', fetched.cancelledIds);
      if (cancellationError) throw cancellationError;
    }

    let staleMeetingCount = 0;
    let staleExternalIds: string[] = [];
    if (fetched.complete) {
      const { data: staleMeetings, error: staleError } = await params.supabase
        .from('meeting_events')
        .update({ status: 'cancelled', updated_at: now })
        .eq('organization_id', params.connection.organization_id)
        .eq('provider', params.connection.provider)
        .eq('status', 'active')
        .gte('start_at', window.from)
        .lte('start_at', window.to)
        .lt('last_seen_at', syncStartedAt)
        .select('external_id');
      if (staleError) throw staleError;
      staleMeetingCount = staleMeetings?.length ?? 0;
      staleExternalIds = (staleMeetings ?? []).map((meeting) => meeting.external_id).filter(Boolean);
    }

    const removedExternalIds = Array.from(new Set([...fetched.cancelledIds, ...staleExternalIds]));
    if (removedExternalIds.length > 0) {
      const { error: sourceDeleteError } = await params.supabase
        .from('readiness_source_events')
        .delete()
        .eq('organization_id', params.connection.organization_id)
        .eq('provider', params.connection.provider)
        .eq('source_type', 'calendar')
        .in('external_id', removedExternalIds.map((externalId) => `${params.connection.provider}:${externalId}`));
      if (sourceDeleteError) throw sourceDeleteError;
    }

    await updateConnectionSyncState({
      ...params,
      values: {
        calendar_sync_status: 'ready',
        calendar_sync_error: null,
        calendar_last_synced_at: now,
        calendar_last_attempted_at: now,
        calendar_events_seen: fetched.events.length,
      },
    });

    return {
      synced: fetched.events.length,
      cancelled: fetched.cancelledIds.length + staleMeetingCount,
      pages: fetched.pages,
      complete: fetched.complete,
    };
  } catch (error) {
    await updateConnectionSyncState({
      ...params,
      values: {
        calendar_sync_status: 'needs_attention',
        calendar_sync_error: errorMessage(error),
        calendar_last_attempted_at: new Date().toISOString(),
      },
    });
    throw error;
  }
}
