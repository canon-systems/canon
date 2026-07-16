import { inngest } from '../client';
import { INNGEST_CRONS, INNGEST_EVENTS, INNGEST_FUNCTION_IDS } from '../constants';
import type { CalendarProvider } from '@/lib/server/integrations/calendar';
import {
  calendarSyncWindow,
  syncCalendarConnection,
  type CalendarConnection,
} from '@/lib/server/integrations/calendar-sync';
import { reconcileNangoWorkspaceConnections } from '@/lib/server/integrations/nango-reconciliation';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { createServiceRoleClient } from '@/lib/supabase/server';

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

    const window = calendarSyncWindow();
    log.info('sync_start', {
      organizationId,
      provider: request.provider ?? 'all',
      reason: request.reason ?? 'event',
      windowDays: 14,
    });

    await step.run('reconcile-calendar-connections', async () => {
      try {
        return await reconcileNangoWorkspaceConnections({
          supabase,
          organizationId,
          providers: ['google_calendar', 'outlook'],
        });
      } catch (error) {
        log.warn('sync_skipped', {
          organizationId,
          reason: 'nango_reconciliation_failed',
          error: errorMessage(error),
        });
        return [];
      }
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
          try {
            const result = await syncCalendarConnection({ supabase, connection, window });
            log.info('sync_complete', {
              orgId: connection.organization_id,
              provider: connection.provider,
              events: result.synced,
              cancelled: result.cancelled,
              pages: result.pages,
              complete: result.complete,
            });
            return result;
          } catch (syncError) {
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
