import { nangoProxyGet } from '@/lib/server/integrations/nango';

export type CalendarProvider = 'google_calendar' | 'outlook';
export type CalendarSourceType = 'primary' | 'calendar' | 'group';

export type CalendarSourceTarget = {
  externalId: string;
  type: CalendarSourceType;
};

export type DiscoveredCalendarSource = CalendarSourceTarget & {
  key: string;
  displayName: string;
  isDefault: boolean;
  metadata: Record<string, unknown>;
};

export type CalendarDiscoveryResult = {
  sources: DiscoveredCalendarSource[];
  warnings: string[];
};

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
const OUTLOOK_GROUP_PERMISSION_WARNING =
  'Microsoft 365 group calendars need additional Microsoft access. Reconnect Outlook after a Microsoft 365 administrator grants Group.Read.All.';
const OUTLOOK_WORK_ACCOUNT_WARNING =
  'Microsoft 365 group calendars require a work or school Outlook account. Reconnect Outlook with the same Microsoft 365 account your team uses for Microsoft Teams.';

export function calendarSourceKey(source: CalendarSourceTarget) {
  return `${source.type}:${source.externalId}`;
}

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

function nextGooglePage(response: unknown, currentEndpoint: string, currentQuery: ProxyQuery) {
  if (!isRecord(response)) return null;
  const pageToken = stringField(response, ['nextPageToken']);
  return pageToken ? { endpoint: currentEndpoint, query: { ...currentQuery, pageToken } } : null;
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

function calendarEventsEndpoint(provider: CalendarProvider, source?: CalendarSourceTarget) {
  if (provider === 'google_calendar') {
    const calendarId = source?.externalId ?? 'primary';
    return `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  }

  if (!source) return '/v1.0/me/calendarView';
  if (source.type === 'group') {
    return `/v1.0/groups/${encodeURIComponent(source.externalId)}/calendarView`;
  }
  return `/v1.0/me/calendars/${encodeURIComponent(source.externalId)}/calendarView`;
}

function discoveredSource(params: {
  externalId: string | null;
  type: CalendarSourceType;
  displayName: string | null;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}): DiscoveredCalendarSource | null {
  if (!params.externalId) return null;
  const source: DiscoveredCalendarSource = {
    externalId: params.externalId,
    type: params.type,
    displayName: params.displayName ?? 'Unnamed calendar',
    isDefault: params.isDefault === true,
    metadata: params.metadata ?? {},
    key: '',
  };
  source.key = calendarSourceKey(source);
  return source;
}

function calendarSourcesFromGoogle(response: unknown) {
  return eventsFromResponse(response).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const isDefault = entry.primary === true;
    const source = discoveredSource({
      externalId: stringField(entry, ['id']),
      type: isDefault ? 'primary' : 'calendar',
      displayName: stringField(entry, ['summaryOverride', 'summary']),
      isDefault,
      metadata: {
        access_role: stringField(entry, ['accessRole']),
        background_color: stringField(entry, ['backgroundColor']),
        time_zone: stringField(entry, ['timeZone']),
      },
    });
    return source ? [source] : [];
  });
}

function calendarSourcesFromOutlook(response: unknown) {
  return eventsFromResponse(response).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const isDefault = entry.isDefaultCalendar === true;
    const owner = isRecord(entry.owner) ? entry.owner : {};
    const source = discoveredSource({
      externalId: stringField(entry, ['id']),
      type: isDefault ? 'primary' : 'calendar',
      displayName: stringField(entry, ['name']),
      isDefault,
      metadata: {
        can_edit: entry.canEdit === true,
        can_share: entry.canShare === true,
        owner_name: stringField(owner, ['name']),
        owner_address: stringField(owner, ['address']),
      },
    });
    return source ? [source] : [];
  });
}

function calendarSourcesFromOutlookGroups(response: unknown) {
  return eventsFromResponse(response).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const groupTypes = Array.isArray(entry.groupTypes)
      ? entry.groupTypes.filter((value): value is string => typeof value === 'string')
      : [];
    if (!groupTypes.some((value) => value.toLowerCase() === 'unified')) return [];

    const source = discoveredSource({
      externalId: stringField(entry, ['id']),
      type: 'group',
      displayName: stringField(entry, ['displayName', 'mail']),
      metadata: {
        mail: stringField(entry, ['mail']),
        group_types: groupTypes,
      },
    });
    return source ? [source] : [];
  });
}

function hasLimitedOutlookGroupDetails(response: unknown) {
  return eventsFromResponse(response).some((entry) => {
    if (!isRecord(entry) || !stringField(entry, ['id'])) return false;
    const objectType = stringField(entry, ['@odata.type']);
    if (objectType && !objectType.toLowerCase().endsWith('.group')) return false;

    return !stringField(entry, ['displayName', 'mail']) && !Array.isArray(entry.groupTypes);
  });
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function isPersonalMicrosoftAccount(connectionId: string) {
  try {
    await nangoProxyGet({
      provider: 'outlook',
      connectionId,
      endpoint: '/v1.0/organization',
      query: { '$select': 'id', '$top': 1 },
    });
    return false;
  } catch (error) {
    return /not supported for MSA accounts/i.test(errorText(error));
  }
}

async function discoverGoogleCalendarSources(connectionId: string) {
  const sources: DiscoveredCalendarSource[] = [];
  const endpoint = '/calendar/v3/users/me/calendarList';
  let query: ProxyQuery = { maxResults: 250, showHidden: false };

  for (let page = 0; page < MAX_CALENDAR_PAGES; page++) {
    const response = await nangoProxyGet({
      provider: 'google_calendar',
      connectionId,
      endpoint,
      query,
    });
    sources.push(...calendarSourcesFromGoogle(response));
    const nextPage = nextGooglePage(response, endpoint, query);
    if (!nextPage) break;
    query = nextPage.query;
  }

  return sources;
}

async function discoverOutlookPages(params: {
  connectionId: string;
  endpoint: string;
  query: ProxyQuery;
  headers?: Record<string, string>;
  map: (response: unknown) => DiscoveredCalendarSource[];
}) {
  const sources: DiscoveredCalendarSource[] = [];
  let endpoint = params.endpoint;
  let query = params.query;

  for (let page = 0; page < MAX_CALENDAR_PAGES; page++) {
    const response = await nangoProxyGet({
      provider: 'outlook',
      connectionId: params.connectionId,
      endpoint,
      query,
      headers: params.headers,
    });
    sources.push(...params.map(response));
    const nextPage = nextOutlookPage(response);
    if (!nextPage) break;
    endpoint = nextPage.endpoint;
    query = nextPage.query;
  }

  return sources;
}

async function discoverOutlookCalendarSources(connectionId: string): Promise<CalendarDiscoveryResult> {
  const sources = await discoverOutlookPages({
    connectionId,
    endpoint: '/v1.0/me/calendars',
    query: {
      '$select': 'id,name,isDefaultCalendar,canEdit,canShare,owner',
      '$top': 100,
    },
    map: calendarSourcesFromOutlook,
  });
  const warnings: string[] = [];
  let limitedGroupDetails = false;

  try {
    sources.push(...await discoverOutlookPages({
      connectionId,
      endpoint: '/v1.0/me/memberOf/microsoft.graph.group',
      query: {
        '$select': 'id,displayName,mail,groupTypes',
        '$count': true,
        '$top': 100,
      },
      headers: { ConsistencyLevel: 'eventual' },
      map: (response) => {
        limitedGroupDetails ||= hasLimitedOutlookGroupDetails(response);
        return calendarSourcesFromOutlookGroups(response);
      },
    }));
  } catch {
    warnings.push(await isPersonalMicrosoftAccount(connectionId)
      ? OUTLOOK_WORK_ACCOUNT_WARNING
      : OUTLOOK_GROUP_PERMISSION_WARNING);
  }
  if (limitedGroupDetails) warnings.push(OUTLOOK_GROUP_PERMISSION_WARNING);

  return { sources, warnings: Array.from(new Set(warnings)) };
}

export async function discoverCalendarSources(params: {
  provider: CalendarProvider;
  connectionId: string;
}): Promise<CalendarDiscoveryResult> {
  const result = params.provider === 'google_calendar'
    ? { sources: await discoverGoogleCalendarSources(params.connectionId), warnings: [] }
    : await discoverOutlookCalendarSources(params.connectionId);
  const sourcesByKey = new Map(result.sources.map((source) => [source.key, source]));

  return {
    sources: Array.from(sourcesByKey.values()).sort((left, right) => {
      if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
      if (left.type !== right.type) return left.type.localeCompare(right.type);
      return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' });
    }),
    warnings: result.warnings,
  };
}

export async function fetchUpcomingCalendarEvents(params: {
  provider: CalendarProvider;
  connectionId: string;
  from: string;
  to: string;
  source?: CalendarSourceTarget;
}): Promise<CalendarFetchResult> {
  let endpoint = calendarEventsEndpoint(params.provider, params.source);
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
      ? nextGooglePage(response, endpoint, query)
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
