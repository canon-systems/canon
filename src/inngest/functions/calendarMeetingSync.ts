import { inngest } from '../client';
import { INNGEST_EVENTS, INNGEST_FUNCTION_IDS } from '../constants';
import { fetchUpcomingCalendarEvents } from '@/lib/server/integrations/calendar';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { upsertReadinessSourceEvents } from '@/lib/server/readiness/source-events';
import { createServiceRoleClient } from '@/lib/supabase/server';

type CalendarConnection = {
  organization_id: string;
  provider: 'google_calendar' | 'outlook';
  connection_id: string;
};

type CalendarSyncEvent = {
  organizationId?: string;
  provider?: 'google_calendar' | 'outlook';
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

function windowStart() {
  return new Date().toISOString();
}

function windowEnd() {
  return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
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

export const calendarMeetingSync = inngest.createFunction(
  {
    id: INNGEST_FUNCTION_IDS.SYNC_CALENDAR_MEETINGS,
    name: 'Canon: Sync Upcoming Calendar Meetings',
    retries: 1,
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

    log.info('sync_start', {
      organizationId,
      provider: request.provider ?? 'all',
      reason: request.reason ?? 'event',
      windowDays: 14,
    });

    let query = supabase
      .from('oauth_connections')
      .select('organization_id, provider, connection_id')
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
    for (const connection of calendarConnections) {
      const result = await step.run(`sync-calendar-${connection.organization_id}-${connection.provider}`, async () => {
        try {
          const events = await fetchUpcomingCalendarEvents({
            provider: connection.provider,
            connectionId: connection.connection_id,
            from: windowStart(),
            to: windowEnd(),
          });

          if (events.length === 0) return { synced: 0 };

          const now = new Date().toISOString();
          const { error: upsertError } = await supabase
            .from('meeting_events')
            .upsert(
              events.map((event) => ({
                organization_id: connection.organization_id,
                provider: connection.provider,
                external_id: event.id,
                title: event.title,
                description: event.description,
                start_at: event.startAt,
                end_at: event.endAt,
                organizer: event.organizer,
                attendees: event.attendees,
                meeting_url: event.meetingUrl,
                customer_domain: event.customerDomain,
                metadata: event.metadata,
                updated_at: now,
              })),
              { onConflict: 'organization_id,provider,external_id' }
            );

          if (upsertError) throw upsertError;

          await upsertReadinessSourceEvents({
            supabase,
            events: events.map((event) => ({
              organizationId: connection.organization_id,
              provider: connection.provider,
              sourceType: 'calendar',
              externalId: `${connection.provider}:${event.id}`,
              content: meetingContent(event),
              occurredAt: event.startAt,
              metadata: {
                title: event.title,
                start_at: event.startAt,
                end_at: event.endAt,
                organizer: event.organizer,
                attendees: event.attendees,
                meeting_url: event.meetingUrl,
                customer_domain: event.customerDomain,
              },
            })),
          });

          await step.sendEvent(`queue-meeting-prep-${connection.organization_id}-${connection.provider}`, {
            name: INNGEST_EVENTS.MEETING_PREP_CHECK_REQUESTED,
            data: {
              organizationId: connection.organization_id,
              reason: 'calendar_sync_complete',
            },
          });

          log.info('sync_complete', {
            orgId: connection.organization_id,
            provider: connection.provider,
            events: events.length,
          });
          return { synced: events.length };
        } catch (syncError) {
          log.error('sync_failed', {
            orgId: connection.organization_id,
            provider: connection.provider,
            error: errorMessage(syncError),
          });
          throw syncError;
        }
      });

      synced += result.synced;
    }

    return { ok: true, connections: calendarConnections.length, synced };
  }
);
