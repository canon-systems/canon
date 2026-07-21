import {
  fetchUpcomingCalendarEvents,
  type CalendarProvider,
  type CalendarSourceTarget,
  type CalendarSourceType,
} from '@/lib/server/integrations/calendar';
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

type CalendarSourceRow = {
  id: string;
  external_id: string;
  calendar_type: CalendarSourceType;
  display_name: string;
  enabled: boolean;
};

type CalendarSyncSource = {
  id: string | null;
  externalId: string;
  type: CalendarSourceType;
  displayName: string;
};

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

async function updateCalendarSourceState(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  sourceId: string | null;
  values: Record<string, unknown>;
}) {
  if (!params.sourceId) return;
  const { error } = await params.supabase
    .from('calendar_sources')
    .update({ ...params.values, updated_at: new Date().toISOString() })
    .eq('id', params.sourceId);
  if (error) throw error;
}

export function calendarEventExternalId(sourceId: string | null, providerEventId: string) {
  return sourceId ? `${sourceId}:${providerEventId}` : providerEventId;
}

function sourceTarget(source: CalendarSyncSource): CalendarSourceTarget | undefined {
  if (!source.id) return undefined;
  return { externalId: source.externalId, type: source.type };
}

async function loadCalendarSources(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  connection: CalendarConnection;
}): Promise<CalendarSyncSource[]> {
  const { data, error } = await params.supabase
    .from('calendar_sources')
    .select('id, external_id, calendar_type, display_name, enabled')
    .eq('organization_id', params.connection.organization_id)
    .eq('provider', params.connection.provider)
    .order('is_default', { ascending: false })
    .order('display_name', { ascending: true });
  if (error) throw error;

  const configuredSources = (data ?? []) as CalendarSourceRow[];
  if (configuredSources.length === 0) {
    return [{
      id: null,
      externalId: params.connection.provider === 'google_calendar' ? 'primary' : 'default',
      type: 'primary',
      displayName: 'Default calendar',
    }];
  }

  return configuredSources.flatMap((source) => source.enabled ? [{
    id: source.id,
    externalId: source.external_id,
    type: source.calendar_type,
    displayName: source.display_name,
  }] : []);
}

async function syncCalendarSource(params: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  connection: CalendarConnection;
  source: CalendarSyncSource;
  window: CalendarSyncWindow;
  syncStartedAt: string;
}) {
  const fetched = await fetchUpcomingCalendarEvents({
    provider: params.connection.provider,
    connectionId: params.connection.connection_id,
    from: params.window.from,
    to: params.window.to,
    source: sourceTarget(params.source),
  });
  const now = new Date().toISOString();

  if (fetched.events.length > 0) {
    const { error: upsertError } = await params.supabase
      .from('meeting_events')
      .upsert(
        fetched.events.map((calendarEvent) => {
          const externalId = calendarEventExternalId(params.source.id, calendarEvent.id);
          return {
            organization_id: params.connection.organization_id,
            provider: params.connection.provider,
            external_id: externalId,
            title: calendarEvent.title,
            description: calendarEvent.description,
            start_at: calendarEvent.startAt,
            end_at: calendarEvent.endAt,
            organizer: calendarEvent.organizer,
            attendees: calendarEvent.attendees,
            meeting_url: calendarEvent.meetingUrl,
            customer_domain: calendarEvent.customerDomain,
            metadata: {
              ...calendarEvent.metadata,
              calendar_source_id: params.source.id,
              calendar_external_id: params.source.externalId,
              calendar_display_name: params.source.displayName,
              provider_event_id: calendarEvent.id,
            } as Json,
            status: 'active',
            connection_id: params.connection.connection_id,
            calendar_source_id: params.source.id,
            last_seen_at: params.syncStartedAt,
            updated_at: now,
          };
        }),
        { onConflict: 'organization_id,provider,external_id' }
      );
    if (upsertError) throw upsertError;

    await upsertReadinessSourceEvents({
      supabase: params.supabase,
      events: fetched.events.map((calendarEvent) => {
        const externalId = calendarEventExternalId(params.source.id, calendarEvent.id);
        return {
          organizationId: params.connection.organization_id,
          provider: params.connection.provider,
          sourceType: 'calendar' as const,
          externalId: `${params.connection.provider}:${externalId}`,
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
            calendar_source_id: params.source.id,
            calendar_external_id: params.source.externalId,
            calendar_display_name: params.source.displayName,
            provider_event_id: calendarEvent.id,
          },
        };
      }),
    });
  }

  const cancelledExternalIds = fetched.cancelledIds.map((eventId) => (
    calendarEventExternalId(params.source.id, eventId)
  ));
  if (cancelledExternalIds.length > 0) {
    const { error: cancellationError } = await params.supabase
      .from('meeting_events')
      .update({ status: 'cancelled', last_seen_at: params.syncStartedAt, updated_at: now })
      .eq('organization_id', params.connection.organization_id)
      .eq('provider', params.connection.provider)
      .in('external_id', cancelledExternalIds);
    if (cancellationError) throw cancellationError;
  }

  let staleMeetingCount = 0;
  let staleExternalIds: string[] = [];
  if (fetched.complete) {
    const staleQuery = params.supabase
      .from('meeting_events')
      .update({ status: 'cancelled', updated_at: now })
      .eq('organization_id', params.connection.organization_id)
      .eq('provider', params.connection.provider)
      .eq('status', 'active')
      .gte('start_at', params.window.from)
      .lte('start_at', params.window.to)
      .lt('last_seen_at', params.syncStartedAt);
    const sourceScopedQuery = params.source.id
      ? staleQuery.eq('calendar_source_id', params.source.id)
      : staleQuery.is('calendar_source_id', null);
    const { data: staleMeetings, error: staleError } = await sourceScopedQuery.select('external_id');
    if (staleError) throw staleError;
    staleMeetingCount = staleMeetings?.length ?? 0;
    staleExternalIds = (staleMeetings ?? []).map((meeting) => meeting.external_id).filter(Boolean);
  }

  const removedExternalIds = Array.from(new Set([...cancelledExternalIds, ...staleExternalIds]));
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

  await updateCalendarSourceState({
    supabase: params.supabase,
    sourceId: params.source.id,
    values: { last_synced_at: now, last_error: null },
  });

  return {
    synced: fetched.events.length,
    cancelled: fetched.cancelledIds.length + staleMeetingCount,
    pages: fetched.pages,
    complete: fetched.complete,
  };
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
    const sources = await loadCalendarSources(params);
    let synced = 0;
    let cancelled = 0;
    let pages = 0;
    let complete = true;
    const failures: string[] = [];

    for (const source of sources) {
      try {
        const result = await syncCalendarSource({
          ...params,
          source,
          window,
          syncStartedAt,
        });
        synced += result.synced;
        cancelled += result.cancelled;
        pages += result.pages;
        complete = complete && result.complete;
      } catch (sourceError) {
        const message = `${source.displayName}: ${errorMessage(sourceError)}`;
        failures.push(message);
        await updateCalendarSourceState({
          supabase: params.supabase,
          sourceId: source.id,
          values: { last_error: errorMessage(sourceError) },
        });
      }
    }

    if (failures.length > 0) throw new Error(failures.join('; '));

    const now = new Date().toISOString();

    await updateConnectionSyncState({
      ...params,
      values: {
        calendar_sync_status: 'ready',
        calendar_sync_error: null,
        calendar_last_synced_at: now,
        calendar_last_attempted_at: now,
        calendar_events_seen: synced,
        calendar_sources_synced: sources.length,
      },
    });

    return {
      synced,
      cancelled,
      pages,
      complete,
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
