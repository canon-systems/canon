import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ nangoProxyGet: vi.fn() }));

vi.mock('@/lib/server/integrations/nango', () => ({ nangoProxyGet: mocks.nangoProxyGet }));

import { discoverCalendarSources, fetchUpcomingCalendarEvents, normalizeCalendarEvent } from './calendar';

describe('normalizeCalendarEvent', () => {
  it('normalizes Outlook meeting details in UTC', () => {
    expect(normalizeCalendarEvent({
      id: 'event-1',
      subject: 'Customer review',
      body: { content: 'Review rollout status' },
      start: { dateTime: '2026-07-16T13:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-07-16T13:30:00', timeZone: 'UTC' },
      organizer: { emailAddress: { address: 'owner@canon.dev' } },
      attendees: [{ emailAddress: { address: 'buyer@example.com' } }],
      onlineMeeting: { joinUrl: 'https://teams.example/join' },
    })).toMatchObject({
      id: 'event-1',
      title: 'Customer review',
      description: 'Review rollout status',
      startAt: '2026-07-16T13:00:00Z',
      organizer: 'owner@canon.dev',
      attendees: ['buyer@example.com'],
      meetingUrl: 'https://teams.example/join',
      customerDomain: 'example.com',
    });
  });

  it('ignores cancelled and all-day entries', () => {
    expect(normalizeCalendarEvent({ id: 'cancelled', status: 'cancelled' })).toBeNull();
    expect(normalizeCalendarEvent({ id: 'all-day', start: { date: '2026-07-16' } })).toBeNull();
  });
});

describe('fetchUpcomingCalendarEvents', () => {
  beforeEach(() => mocks.nangoProxyGet.mockReset());

  it('reads every Google page and returns deleted event IDs', async () => {
    mocks.nangoProxyGet
      .mockResolvedValueOnce({
        items: [{ id: 'event-1', summary: 'Kickoff', start: { dateTime: '2026-07-16T13:00:00Z' } }],
        nextPageToken: 'page-2',
      })
      .mockResolvedValueOnce({ items: [{ id: 'event-2', status: 'cancelled' }] });

    const result = await fetchUpcomingCalendarEvents({
      provider: 'google_calendar',
      connectionId: 'connection-1',
      from: '2026-07-15T12:00:00Z',
      to: '2026-07-29T12:00:00Z',
    });

    expect(result.events.map((event) => event.id)).toEqual(['event-1']);
    expect(result.cancelledIds).toEqual(['event-2']);
    expect(result.pages).toBe(2);
    expect(result.complete).toBe(true);
    expect(mocks.nangoProxyGet).toHaveBeenNthCalledWith(2, expect.objectContaining({
      endpoint: '/calendar/v3/calendars/primary/events',
      query: expect.objectContaining({ pageToken: 'page-2', showDeleted: true }),
    }));
  });

  it('reads events from a selected Google calendar', async () => {
    mocks.nangoProxyGet.mockResolvedValueOnce({ items: [] });

    await fetchUpcomingCalendarEvents({
      provider: 'google_calendar',
      connectionId: 'connection-1',
      from: '2026-07-15T12:00:00Z',
      to: '2026-07-29T12:00:00Z',
      source: { externalId: 'team@group.calendar.google.com', type: 'calendar' },
    });

    expect(mocks.nangoProxyGet).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: '/calendar/v3/calendars/team%40group.calendar.google.com/events',
    }));
  });

  it('uses the Outlook calendar view and follows the next page link', async () => {
    mocks.nangoProxyGet
      .mockResolvedValueOnce({
        value: [{ id: 'event-1', subject: 'Review', start: { dateTime: '2026-07-16T13:00:00', timeZone: 'UTC' } }],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=next',
      })
      .mockResolvedValueOnce({ value: [] });

    const result = await fetchUpcomingCalendarEvents({
      provider: 'outlook',
      connectionId: 'connection-2',
      from: '2026-07-15T12:00:00Z',
      to: '2026-07-29T12:00:00Z',
    });

    expect(result.events).toHaveLength(1);
    expect(mocks.nangoProxyGet).toHaveBeenNthCalledWith(1, expect.objectContaining({
      endpoint: '/v1.0/me/calendarView',
      headers: { Prefer: 'outlook.timezone="UTC"' },
      query: expect.objectContaining({ startDateTime: '2026-07-15T12:00:00Z' }),
    }));
    expect(mocks.nangoProxyGet).toHaveBeenNthCalledWith(2, expect.objectContaining({
      endpoint: '/v1.0/me/calendarView',
      query: { '$skiptoken': 'next' },
    }));
  });

  it('reads events from a selected Microsoft 365 group calendar', async () => {
    mocks.nangoProxyGet.mockResolvedValueOnce({ value: [] });

    await fetchUpcomingCalendarEvents({
      provider: 'outlook',
      connectionId: 'connection-2',
      from: '2026-07-15T12:00:00Z',
      to: '2026-07-29T12:00:00Z',
      source: { externalId: 'group-1', type: 'group' },
    });

    expect(mocks.nangoProxyGet).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: '/v1.0/groups/group-1/calendarView',
    }));
  });
});

describe('discoverCalendarSources', () => {
  beforeEach(() => mocks.nangoProxyGet.mockReset());

  it('discovers every Google calendar page', async () => {
    mocks.nangoProxyGet
      .mockResolvedValueOnce({
        items: [{ id: 'primary@example.com', summary: 'Primary', primary: true, accessRole: 'owner' }],
        nextPageToken: 'page-2',
      })
      .mockResolvedValueOnce({
        items: [{ id: 'team@example.com', summary: 'Team calendar', accessRole: 'reader' }],
      });

    const result = await discoverCalendarSources({
      provider: 'google_calendar',
      connectionId: 'connection-1',
    });

    expect(result.sources).toEqual([
      expect.objectContaining({ key: 'primary:primary@example.com', isDefault: true }),
      expect.objectContaining({ key: 'calendar:team@example.com', displayName: 'Team calendar' }),
    ]);
    expect(mocks.nangoProxyGet).toHaveBeenNthCalledWith(2, expect.objectContaining({
      endpoint: '/calendar/v3/users/me/calendarList',
      query: expect.objectContaining({ pageToken: 'page-2' }),
    }));
  });

  it('combines Outlook user and Microsoft 365 group calendars', async () => {
    mocks.nangoProxyGet
      .mockResolvedValueOnce({
        value: [{ id: 'calendar-1', name: 'Calendar', isDefaultCalendar: true }],
      })
      .mockResolvedValueOnce({
        value: [
          { id: 'group-1', displayName: 'Customer team', groupTypes: ['Unified'] },
          { id: 'security-1', displayName: 'Security group', groupTypes: [] },
        ],
      });

    const result = await discoverCalendarSources({
      provider: 'outlook',
      connectionId: 'connection-2',
    });

    expect(result.sources).toEqual([
      expect.objectContaining({ key: 'primary:calendar-1', isDefault: true }),
      expect.objectContaining({ key: 'group:group-1', displayName: 'Customer team' }),
    ]);
    expect(result.warnings).toEqual([]);
    expect(mocks.nangoProxyGet).toHaveBeenNthCalledWith(2, expect.objectContaining({
      endpoint: '/v1.0/me/memberOf/microsoft.graph.group',
      query: expect.objectContaining({ '$count': true }),
      headers: { ConsistencyLevel: 'eventual' },
    }));
  });

  it('keeps Outlook calendars available when group discovery lacks permission', async () => {
    mocks.nangoProxyGet
      .mockResolvedValueOnce({ value: [{ id: 'calendar-1', name: 'Calendar', isDefaultCalendar: true }] })
      .mockRejectedValueOnce(new Error('Forbidden'))
      .mockResolvedValueOnce({ value: [{ id: 'organization-1' }] });

    const result = await discoverCalendarSources({
      provider: 'outlook',
      connectionId: 'connection-2',
    });

    expect(result.sources).toHaveLength(1);
    expect(result.warnings).toEqual([
      'Microsoft 365 group calendars need additional Microsoft access. Reconnect Outlook after a Microsoft 365 administrator grants Group.Read.All.',
    ]);
  });

  it('explains that Microsoft 365 groups are unavailable to a personal Outlook account', async () => {
    mocks.nangoProxyGet
      .mockResolvedValueOnce({ value: [{ id: 'calendar-1', name: 'Calendar', isDefaultCalendar: true }] })
      .mockRejectedValueOnce(new Error('UnknownError'))
      .mockRejectedValueOnce(new Error('This API is not supported for MSA accounts'));

    const result = await discoverCalendarSources({
      provider: 'outlook',
      connectionId: 'connection-2',
    });

    expect(result.sources).toHaveLength(1);
    expect(result.warnings).toEqual([
      'Microsoft 365 group calendars require a work or school Outlook account. Reconnect Outlook with the same Microsoft 365 account your team uses for Microsoft Teams.',
    ]);
    expect(mocks.nangoProxyGet).toHaveBeenNthCalledWith(3, expect.objectContaining({
      endpoint: '/v1.0/organization',
    }));
  });

  it('warns when Microsoft returns group IDs without readable group details', async () => {
    mocks.nangoProxyGet
      .mockResolvedValueOnce({ value: [{ id: 'calendar-1', name: 'Calendar', isDefaultCalendar: true }] })
      .mockResolvedValueOnce({
        value: [{ id: 'group-1', '@odata.type': '#microsoft.graph.group' }],
      });

    const result = await discoverCalendarSources({
      provider: 'outlook',
      connectionId: 'connection-2',
    });

    expect(result.sources).toHaveLength(1);
    expect(result.warnings).toEqual([
      'Microsoft 365 group calendars need additional Microsoft access. Reconnect Outlook after a Microsoft 365 administrator grants Group.Read.All.',
    ]);
  });
});
