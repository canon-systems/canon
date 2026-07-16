import { nangoProxyGet } from '@/lib/server/integrations/nango';

export type CalendarProvider = 'google_calendar' | 'outlook';

type RawRecord = Record<string, unknown>;
type ProxyQuery = Record<string, string | number | boolean | null | undefined>;

export type NormalizedCalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  organizer: string | null;
  attendees: string[];
  meetingUrl: string | null;
  customerDomain: string | null;
  metadata: Record<string, unknown>;
};

export type CalendarFetchResult = {
  events: NormalizedCalendarEvent[];
  cancelledIds: string[];
  pages: number;
  complete: boolean;
};

const MAX_CALENDAR_PAGES = 25;

function isRecord(value: unknown): value is RawRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringField(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function nestedStringField(record: RawRecord, key: string, nestedKeys: string[]) {
  const value = record[key];
  if (!isRecord(value)) return null;
  return stringField(value, nestedKeys);
}

function nestedRecordStringField(record: RawRecord, key: string, nestedKey: string, keys: string[]) {
  const value = record[key];
  if (!isRecord(value)) return null;
  return nestedStringField(value, nestedKey, keys);
}

function normalizeProviderDateTime(value: string, timeZone: string | null) {
  const trimmed = value.trim();
  if (!trimmed.includes('T')) return trimmed;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) return trimmed;
  return timeZone?.toUpperCase() === 'UTC' ? `${trimmed}Z` : trimmed;
}

function dateTimeField(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (isRecord(value)) {
      const dateTime = stringField(value, ['dateTime', 'date_time', 'date']);
      if (dateTime) return normalizeProviderDateTime(dateTime, stringField(value, ['timeZone', 'time_zone']));
    }
  }
  return null;
}

function attendeeEmails(record: RawRecord) {
  const raw = record.attendees ?? record.participants ?? [];
  if (!Array.isArray(raw)) return [];

  return Array.from(new Set(raw.flatMap((entry) => {
    if (typeof entry === 'string' && entry.includes('@')) return [entry.trim().toLowerCase()];
    if (!isRecord(entry)) return [];
    const email = stringField(entry, ['email', 'address']);
    const nestedEmail = nestedStringField(entry, 'emailAddress', ['address', 'email']);
    return [email, nestedEmail]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());
  })));
}

function externalDomain(emails: string[]) {
  const ignored = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com']);
  return emails
    .map((email) => email.split('@')[1]?.toLowerCase())
    .find((domain) => domain && !ignored.has(domain)) ?? null;
}

function eventMeetingUrl(record: RawRecord) {
  return stringField(record, ['hangoutLink', 'onlineMeetingUrl', 'webLink', 'htmlLink', 'joinUrl', 'meeting_url'])
    ?? nestedStringField(record, 'onlineMeeting', ['joinUrl', 'join_url']);
}

function eventDescription(record: RawRecord) {
  return stringField(record, ['description', 'bodyPreview', 'body', 'notes'])
    ?? nestedStringField(record, 'body', ['content']);
}

function eventId(record: RawRecord) {
  return stringField(record, ['id', 'iCalUID', 'uid', 'event_id', 'eventId']);
}

function isCancelledEvent(record: RawRecord) {
  return stringField(record, ['status'])?.toLowerCase() === 'cancelled' || record.isCancelled === true;
}

function isAllDayEvent(record: RawRecord) {
  if (record.isAllDay === true) return true;
  return isRecord(record.start) && typeof record.start.date === 'string' && !record.start.dateTime;
}

export function normalizeCalendarEvent(raw: unknown): NormalizedCalendarEvent | null {
  if (!isRecord(raw) || isCancelledEvent(raw) || isAllDayEvent(raw)) return null;

  const id = eventId(raw);
  const startAt = dateTimeField(raw, ['start', 'start_at', 'startAt', 'startTime', 'start_time']);
  if (!id || !startAt) return null;

  const attendees = attendeeEmails(raw);
  const organizer = nestedStringField(raw, 'organizer', ['email', 'address'])
    ?? nestedRecordStringField(raw, 'organizer', 'emailAddress', ['address', 'email'])
    ?? nestedStringField(raw, 'creator', ['email', 'address'])
    ?? stringField(raw, ['organizer', 'creator']);
  const allEmails = Array.from(new Set([
    ...attendees,
    ...(organizer && organizer.includes('@') ? [organizer.toLowerCase()] : []),
  ]));

  return {
    id,
    title: stringField(raw, ['summary', 'subject', 'title', 'name']) ?? 'Untitled meeting',
    description: eventDescription(raw),
    startAt,
    endAt: dateTimeField(raw, ['end', 'end_at', 'endAt', 'endTime', 'end_time']),
    organizer,
    attendees,
    meetingUrl: eventMeetingUrl(raw),
    customerDomain: externalDomain(allEmails),
    metadata: raw,
  };
}

function eventsFromResponse(response: unknown) {
  if (Array.isArray(response)) return response;
  if (!isRecord(response)) return [];
  for (const key of ['items', 'events', 'value', 'data']) {
    const value = response[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function nextGooglePage(response: unknown, currentQuery: ProxyQuery) {
  if (!isRecord(response)) return null;
  const pageToken = stringField(response, ['nextPageToken']);
  return pageToken ? { endpoint: '/calendar/v3/calendars/primary/events', query: { ...currentQuery, pageToken } } : null;
}

function nextOutlookPage(response: unknown) {
  if (!isRecord(response)) return null;
  const nextLink = stringField(response, ['@odata.nextLink']);
  if (!nextLink) return null;

  const url = new URL(nextLink);
  return {
    endpoint: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()) as ProxyQuery,
  };
}

export async function fetchUpcomingCalendarEvents(params: {
  provider: CalendarProvider;
  connectionId: string;
  from: string;
  to: string;
}): Promise<CalendarFetchResult> {
  let endpoint = params.provider === 'google_calendar'
    ? '/calendar/v3/calendars/primary/events'
    : '/v1.0/me/calendarView';
  let query: ProxyQuery = params.provider === 'google_calendar'
    ? {
        timeMin: params.from,
        timeMax: params.to,
        singleEvents: true,
        showDeleted: true,
        orderBy: 'startTime',
        maxResults: 250,
      }
    : {
        startDateTime: params.from,
        endDateTime: params.to,
        '$orderby': 'start/dateTime',
        '$top': 100,
      };

  const rawEvents: unknown[] = [];
  let pages = 0;
  let hasMore = false;

  while (pages < MAX_CALENDAR_PAGES) {
    const response = await nangoProxyGet({
      provider: params.provider,
      connectionId: params.connectionId,
      endpoint,
      query,
      headers: params.provider === 'outlook' ? { Prefer: 'outlook.timezone="UTC"' } : undefined,
    });
    pages++;
    rawEvents.push(...eventsFromResponse(response));

    const nextPage = params.provider === 'google_calendar'
      ? nextGooglePage(response, query)
      : nextOutlookPage(response);
    hasMore = Boolean(nextPage);
    if (!nextPage) break;
    endpoint = nextPage.endpoint;
    query = nextPage.query;
  }

  const cancelledIds = Array.from(new Set(rawEvents.flatMap((event) => (
    isRecord(event) && isCancelledEvent(event) && eventId(event) ? [eventId(event) as string] : []
  ))));
  const events = rawEvents
    .map((event) => normalizeCalendarEvent(event))
    .filter((event): event is NormalizedCalendarEvent => event !== null);

  return { events, cancelledIds, pages, complete: !hasMore };
}
