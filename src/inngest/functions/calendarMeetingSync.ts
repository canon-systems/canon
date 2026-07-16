import { inngest } from '../client';
import { INNGEST_CRONS, INNGEST_EVENTS, INNGEST_FUNCTION_IDS } from '../constants';
import { fetchUpcomingCalendarEvents, type CalendarProvider } from '@/lib/server/integrations/calendar';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { upsertReadinessSourceEvents } from '@/lib/server/readiness/source-events';
import { createServiceRoleClient } from '@/lib/supabase/server';

type CalendarConnection = {
  organization_id: string;
  provider: CalendarProvider;
  connection_id: string;
  metadata: Record<string, unknown> | null;
};

type CalendarSyncEvent = {
  organizationId?: string;
  provider?: CalendarProvider;
  connectionId?: string;
  reason?: string;
};

const log = createLogger('inngest.calendar_meeting_sync', {
  label: 'Calendar Meeting Sync',
  eventLabels: {
    sync_start: 'Sync Started',
    sync_complete: 'Sync Complete',
    sync_failed: 'Sync Failed',
    sync_skipped: 'Sync Skipped',
  },
  componentColor: 'orange',
});

function syncWindow() {
  const from = new Date();
  const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
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
      metadata: { ...(params.connection.metadata ?? {}), ...params.values },
      updated_at: new Date().toISOString(),
    })
    .eq('connection_id', params.connection.connection_id);

  if (error) throw error;
}

export const calendarMeetingSync = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.SYNC_CALENDAR_MEETINGS,
    name: 'Canon: Sync Upcoming Calendar Meetings',
    retries: 3,
    concurrency: {
      limit: 1,
      key: 'event.data.organizationId',
    },
  },
  { event: INNGEST_EVENTS.CALENDAR_SYNC_REQUESTED },
  async ({ event, step }) => {
    const request = (event.data ?? {}) as CalendarSyncEvent;
    const supabase = createServiceRoleClient();
    const organizationId = typeof request.organizationId === 'string' ? request.organizationId : '';
    if (!organizationId) return { skipped: true, reason: 'missing_organization_id' };

    const window = syncWindow();
    log.info('sync_start', {
      organizationId,
      provider: request.provider ?? 'all',
      reason: request.reason ?? 'event',
      windowDays: 14,
    });

    let query = supabase
      .from('oauth_connections')
      .select('organization_id, provider, connection_id, metadata')
      .eq('organization_id', organizationId)
      .in('provider', ['google_calendar', 'outlook'])
      .eq('status', 'active');

    if (request.provider) query = query.eq('provider', request.provider);
    if (request.connectionId) query = query.eq('connection_id', request.connectionId);

    const { data: connections, error } = await query;
    if (error) throw error;

    const calendarConnections = (connections ?? []) as CalendarConnection[];
    if (calendarConnections.length === 0) {
      log.info('sync_skipped', { organizationId, reason: 'no_calendar_connections' });
      return { ok: true, synced: 0 };
    }

    let synced = 0;
    let cancelled = 0;
    for (const connection of calendarConnections) {
      const result = await step.run(
        `sync-calendar-${connection.organization_id}-${connection.provider}-${connection.connection_id}`,
        async () => {
          const syncStartedAt = new Date().toISOString();
          await updateConnectionSyncState({
            supabase,
            connection,
            values: { calendar_sync_status: 'syncing', calendar_sync_error: null },
          });

          try {
            const fetched = await fetchUpcomingCalendarEvents({
              provider: connection.provider,
              connectionId: connection.connection_id,
              from: window.from,
              to: window.to,
            });

            const now = new Date().toISOString();
            if (fetched.events.length > 0) {
              const { error: upsertError } = await supabase
                .from('meeting_events')
                .upsert(
                  fetched.events.map((calendarEvent) => ({
                    organization_id: connection.organization_id,
                    provider: connection.provider,
                    external_id: calendarEvent.id,
                    title: calendarEvent.title,
                    description: calendarEvent.description,
                    start_at: calendarEvent.startAt,
                    end_at: calendarEvent.endAt,
                    organizer: calendarEvent.organizer,
                    attendees: calendarEvent.attendees,
                    meeting_url: calendarEvent.meetingUrl,
                    customer_domain: calendarEvent.customerDomain,
                    metadata: calendarEvent.metadata,
                    status: 'active',
                    connection_id: connection.connection_id,
                    last_seen_at: syncStartedAt,
                    updated_at: now,
                  })),
                  { onConflict: 'organization_id,provider,external_id' }
                );

              if (upsertError) throw upsertError;

              await upsertReadinessSourceEvents({
                supabase,
                events: fetched.events.map((calendarEvent) => ({
                  organizationId: connection.organization_id,
                  provider: connection.provider,
                  sourceType: 'calendar',
                  externalId: `${connection.provider}:${calendarEvent.id}`,
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
              const { error: cancellationError } = await supabase
                .from('meeting_events')
                .update({ status: 'cancelled', last_seen_at: syncStartedAt, updated_at: now })
                .eq('organization_id', connection.organization_id)
                .eq('provider', connection.provider)
                .in('external_id', fetched.cancelledIds);

              if (cancellationError) throw cancellationError;
            }

            let staleMeetingCount = 0;
            if (fetched.complete) {
              const { data: staleMeetings, error: staleError } = await supabase
                .from('meeting_events')
                .update({ status: 'cancelled', updated_at: now })
                .eq('organization_id', connection.organization_id)
                .eq('provider', connection.provider)
                .eq('status', 'active')
                .gte('start_at', window.from)
                .lte('start_at', window.to)
                .lt('last_seen_at', syncStartedAt)
                .select('id');

              if (staleError) throw staleError;
              staleMeetingCount = staleMeetings?.length ?? 0;
            }

            await updateConnectionSyncState({
              supabase,
              connection,
              values: {
                calendar_sync_status: 'ready',
                calendar_sync_error: null,
                calendar_last_synced_at: now,
                calendar_events_seen: fetched.events.length,
              },
            });

            log.info('sync_complete', {
              orgId: connection.organization_id,
              provider: connection.provider,
              events: fetched.events.length,
              cancelled: fetched.cancelledIds.length + staleMeetingCount,
              pages: fetched.pages,
              complete: fetched.complete,
            });
            return {
              synced: fetched.events.length,
              cancelled: fetched.cancelledIds.length + staleMeetingCount,
            };
          } catch (syncError) {
            await updateConnectionSyncState({
              supabase,
              connection,
              values: {
                calendar_sync_status: 'needs_attention',
                calendar_sync_error: errorMessage(syncError),
                calendar_last_attempted_at: new Date().toISOString(),
              },
            });
            log.error('sync_failed', {
              orgId: connection.organization_id,
              provider: connection.provider,
              error: errorMessage(syncError),
            });
            throw syncError;
          }
        }
      );

      synced += result.synced;
      cancelled += result.cancelled;
    }

    await step.sendEvent(`queue-meeting-prep-${organizationId}`, {
      name: INNGEST_EVENTS.MEETING_PREP_CHECK_REQUESTED,
      data: { organizationId, reason: 'calendar_sync_complete' },
    });

    return { ok: true, connections: calendarConnections.length, synced, cancelled };
  }
);

export const calendarMeetingSyncOnSchedule = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.SYNC_CALENDAR_MEETINGS_ON_SCHEDULE,
    name: 'Canon: Schedule Calendar Refreshes',
    retries: 3,
  },
  { cron: INNGEST_CRONS.CALENDAR_SYNC_DUE_CHECK },
  async ({ step }) => {
    const supabase = createServiceRoleClient();
    const organizations = await step.run('load-calendar-organizations', async () => {
      const { data, error } = await supabase
        .from('oauth_connections')
        .select('organization_id')
        .in('provider', ['google_calendar', 'outlook'])
        .eq('status', 'active');
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((row) => row.organization_id).filter(Boolean)));
    });

    if (organizations.length === 0) return { queued: 0 };

    await step.sendEvent('queue-calendar-refreshes', organizations.map((organizationId) => ({
      name: INNGEST_EVENTS.CALENDAR_SYNC_REQUESTED,
      data: { organizationId, reason: 'scheduled_refresh' },
    })));

    return { queued: organizations.length };
  }
);
