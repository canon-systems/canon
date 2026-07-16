import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ nangoProxyGet: vi.fn() }));

vi.mock('@/lib/server/integrations/nango', () => ({ nangoProxyGet: mocks.nangoProxyGet }));

import { fetchUpcomingCalendarEvents, normalizeCalendarEvent } from './calendar';

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
      query: expect.objectContaining({ pageToken: 'page-2', showDeleted: true }),
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
});
