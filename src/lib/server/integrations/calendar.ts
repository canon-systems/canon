import { nangoProxyGet } from '@/lib/server/integrations/nango';

type CalendarProvider = 'google_calendar' | 'outlook';

type RawRecord = Record<string, unknown>;

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

function dateTimeField(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (isRecord(value)) {
      const dateTime = stringField(value, ['dateTime', 'date_time', 'date']);
      if (dateTime) return dateTime;
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
    return [email, nestedEmail].filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase());
  })));
}

function externalDomain(emails: string[]) {
  const ignored = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com']);
  return emails
    .map((email) => email.split('@')[1]?.toLowerCase())
    .find((domain) => domain && !ignored.has(domain)) ?? null;
}

function meetingUrl(record: RawRecord) {
  return stringField(record, ['hangoutLink', 'onlineMeetingUrl', 'webLink', 'htmlLink', 'joinUrl', 'meeting_url']);
}

function normalizeCalendarEvent(raw: unknown, index: number): NormalizedCalendarEvent | null {
  if (!isRecord(raw)) return null;

  const id = stringField(raw, ['id', 'iCalUID', 'uid', 'event_id', 'eventId']) ?? `calendar-event-${index}`;
  const title = stringField(raw, ['summary', 'subject', 'title', 'name']) ?? 'Untitled meeting';
  const startAt = dateTimeField(raw, ['start', 'start_at', 'startAt', 'startTime', 'start_time']);
  if (!startAt) return null;

  const attendees = attendeeEmails(raw);
  const organizer = nestedStringField(raw, 'organizer', ['email', 'address'])
    ?? nestedStringField(raw, 'creator', ['email', 'address'])
    ?? stringField(raw, ['organizer', 'creator']);
  const allEmails = Array.from(new Set([...attendees, ...(organizer && organizer.includes('@') ? [organizer.toLowerCase()] : [])]));

  return {
    id,
    title,
    description: stringField(raw, ['description', 'bodyPreview', 'body', 'notes']),
    startAt,
    endAt: dateTimeField(raw, ['end', 'end_at', 'endAt', 'endTime', 'end_time']),
    organizer,
    attendees,
    meetingUrl: meetingUrl(raw),
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

export async function fetchUpcomingCalendarEvents(params: {
  provider: CalendarProvider;
  connectionId: string;
  from: string;
  to: string;
}) {
  const endpoint = params.provider === 'google_calendar'
    ? '/calendar/v3/calendars/primary/events'
    : '/v1.0/me/events';
  const query = params.provider === 'google_calendar'
    ? {
        timeMin: params.from,
        timeMax: params.to,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100,
      }
    : {
        '$filter': `start/dateTime ge '${params.from}' and start/dateTime le '${params.to}'`,
        '$orderby': 'start/dateTime',
        '$top': 100,
      };

  const response = await nangoProxyGet({
    provider: params.provider,
    connectionId: params.connectionId,
    endpoint,
    query,
  });

  return eventsFromResponse(response)
    .map((event, index) => normalizeCalendarEvent(event, index))
    .filter((event): event is NormalizedCalendarEvent => event !== null);
}
