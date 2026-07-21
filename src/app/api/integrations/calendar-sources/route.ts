import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { inngest } from '@/inngest/client';
import { INNGEST_EVENTS } from '@/inngest/constants';
import {
  calendarSourceKey,
  discoverCalendarSources,
  type CalendarProvider,
  type DiscoveredCalendarSource,
} from '@/lib/server/integrations/calendar';
import { errorMessage } from '@/lib/server/logging';
import { requireWorkspace } from '@/lib/server/organization';
import type { Json } from '@/lib/supabase/database.types';

export const runtime = 'nodejs';

type CalendarSourceRow = {
  id: string;
  external_id: string;
  calendar_type: 'primary' | 'calendar' | 'group';
  display_name: string;
  enabled: boolean;
  is_default: boolean;
};

function calendarProvider(value: unknown): CalendarProvider | null {
  return value === 'google_calendar' || value === 'outlook' ? value : null;
}

function persistedSource(source: CalendarSourceRow): DiscoveredCalendarSource {
  const target = { externalId: source.external_id, type: source.calendar_type };
  return {
    ...target,
    key: calendarSourceKey(target),
    displayName: source.display_name,
    isDefault: source.is_default,
    metadata: {},
  };
}

function mergedSources(discovered: DiscoveredCalendarSource[], persisted: CalendarSourceRow[]) {
  const discoveredKeys = new Set(discovered.map((source) => source.key));
  return [
    ...discovered.map((source) => ({ source, available: true })),
    ...persisted
      .map(persistedSource)
      .filter((source) => !discoveredKeys.has(source.key))
      .map((source) => ({ source, available: false })),
  ];
}

function sourceOption(source: DiscoveredCalendarSource, selectedKeys: Set<string>, available: boolean) {
  return {
    key: source.key,
    externalId: source.externalId,
    type: source.type,
    displayName: source.displayName,
    isDefault: source.isDefault,
    selected: selectedKeys.has(source.key),
    available,
  };
}

async function loadConnectionAndSources(params: {
  supabase: Awaited<ReturnType<typeof requireWorkspace>>['supabase'];
  organizationId: string;
  provider: CalendarProvider;
}) {
  const { data: connection, error: connectionError } = await params.supabase
    .from('oauth_connections')
    .select('connection_id')
    .eq('organization_id', params.organizationId)
    .eq('provider', params.provider)
    .eq('status', 'active')
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection) return null;

  const { data: persistedSources, error: sourcesError } = await params.supabase
    .from('calendar_sources')
    .select('id, external_id, calendar_type, display_name, enabled, is_default')
    .eq('organization_id', params.organizationId)
    .eq('provider', params.provider);
  if (sourcesError) throw sourcesError;

  return {
    connectionId: connection.connection_id,
    persistedSources: (persistedSources ?? []) as CalendarSourceRow[],
  };
}

async function removeCalendarEvents(params: {
  supabase: Awaited<ReturnType<typeof requireWorkspace>>['supabase'];
  organizationId: string;
  provider: CalendarProvider;
  disabledSourceIds: string[];
}) {
  const legacyMeetings = await params.supabase
    .from('meeting_events')
    .select('external_id')
    .eq('organization_id', params.organizationId)
    .eq('provider', params.provider)
    .is('calendar_source_id', null);
  if (legacyMeetings.error) throw legacyMeetings.error;

  const disabledMeetings = params.disabledSourceIds.length > 0
    ? await params.supabase
        .from('meeting_events')
        .select('external_id')
        .eq('organization_id', params.organizationId)
        .eq('provider', params.provider)
        .in('calendar_source_id', params.disabledSourceIds)
    : { data: [], error: null };
  if (disabledMeetings.error) throw disabledMeetings.error;

  const externalIds = Array.from(new Set([
    ...(legacyMeetings.data ?? []).map((meeting) => meeting.external_id),
    ...(disabledMeetings.data ?? []).map((meeting) => meeting.external_id),
  ].filter(Boolean)));

  const legacyDelete = await params.supabase
    .from('meeting_events')
    .delete()
    .eq('organization_id', params.organizationId)
    .eq('provider', params.provider)
    .is('calendar_source_id', null);
  if (legacyDelete.error) throw legacyDelete.error;

  if (params.disabledSourceIds.length > 0) {
    const disabledDelete = await params.supabase
      .from('meeting_events')
      .delete()
      .eq('organization_id', params.organizationId)
      .eq('provider', params.provider)
      .in('calendar_source_id', params.disabledSourceIds);
    if (disabledDelete.error) throw disabledDelete.error;
  }

  if (externalIds.length > 0) {
    const sourceEventsDelete = await params.supabase
      .from('readiness_source_events')
      .delete()
      .eq('organization_id', params.organizationId)
      .eq('provider', params.provider)
      .eq('source_type', 'calendar')
      .in('external_id', externalIds.map((externalId) => `${params.provider}:${externalId}`));
    if (sourceEventsDelete.error) throw sourceEventsDelete.error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const provider = calendarProvider(request.nextUrl.searchParams.get('provider'));
    if (!provider) return NextResponse.json({ error: 'Invalid calendar provider' }, { status: 400 });

    const { supabase, organization } = await requireWorkspace(user);
    const connection = await loadConnectionAndSources({
      supabase,
      organizationId: organization.id,
      provider,
    });
    if (!connection) return NextResponse.json({ error: 'Calendar integration not found' }, { status: 404 });

    const discovered = await discoverCalendarSources({
      provider,
      connectionId: connection.connectionId,
    });
    const configured = connection.persistedSources.length > 0;
    const selectedKeys = configured
      ? new Set(connection.persistedSources.filter((source) => source.enabled).map((source) => (
          calendarSourceKey({ externalId: source.external_id, type: source.calendar_type })
        )))
      : new Set(discovered.sources.filter((source) => source.isDefault).map((source) => source.key));
    if (!configured && selectedKeys.size === 0 && discovered.sources[0]) {
      selectedKeys.add(discovered.sources[0].key);
    }

    return NextResponse.json({
      provider,
      configured,
      sources: mergedSources(discovered.sources, connection.persistedSources)
        .map(({ source, available }) => sourceOption(source, selectedKeys, available)),
      warnings: discovered.warnings,
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Unable to load calendars',
      detail: errorMessage(error),
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      provider?: unknown;
      selectedKeys?: unknown;
    };
    const provider = calendarProvider(body.provider);
    const selectedKeys = Array.isArray(body.selectedKeys)
      ? Array.from(new Set(body.selectedKeys.filter((value): value is string => (
          typeof value === 'string' && value.length > 0 && value.length <= 2048
        ))))
      : null;
    if (!provider || !selectedKeys || selectedKeys.length > 200) {
      return NextResponse.json({ error: 'Invalid calendar selection' }, { status: 400 });
    }

    const { supabase, organization } = await requireWorkspace(user);
    const connection = await loadConnectionAndSources({
      supabase,
      organizationId: organization.id,
      provider,
    });
    if (!connection) return NextResponse.json({ error: 'Calendar integration not found' }, { status: 404 });

    const discovered = await discoverCalendarSources({
      provider,
      connectionId: connection.connectionId,
    });
    const discoveredByKey = new Map(discovered.sources.map((source) => [source.key, source]));
    const persistedByKey = new Map(connection.persistedSources.map((source) => [
      calendarSourceKey({ externalId: source.external_id, type: source.calendar_type }),
      source,
    ]));
    const unknownKeys = selectedKeys.filter((key) => !discoveredByKey.has(key) && !persistedByKey.has(key));
    if (unknownKeys.length > 0) {
      return NextResponse.json({ error: 'One or more calendars are no longer available' }, { status: 409 });
    }

    const selectedKeySet = new Set(selectedKeys);
    const now = new Date().toISOString();
    const disableResult = await supabase
      .from('calendar_sources')
      .update({ enabled: false, updated_at: now })
      .eq('organization_id', organization.id)
      .eq('provider', provider);
    if (disableResult.error) throw disableResult.error;

    if (discovered.sources.length > 0) {
      const upsertResult = await supabase
        .from('calendar_sources')
        .upsert(discovered.sources.map((source) => ({
          organization_id: organization.id,
          provider,
          external_id: source.externalId,
          calendar_type: source.type,
          display_name: source.displayName,
          enabled: selectedKeySet.has(source.key),
          is_default: source.isDefault,
          metadata: source.metadata as Json,
          updated_at: now,
        })), { onConflict: 'organization_id,provider,calendar_type,external_id' });
      if (upsertResult.error) throw upsertResult.error;
    }

    const selectedPersistedIds = selectedKeys
      .filter((key) => !discoveredByKey.has(key))
      .flatMap((key) => persistedByKey.get(key)?.id ? [persistedByKey.get(key)!.id] : []);
    if (selectedPersistedIds.length > 0) {
      const persistedEnableResult = await supabase
        .from('calendar_sources')
        .update({ enabled: true, updated_at: now })
        .in('id', selectedPersistedIds);
      if (persistedEnableResult.error) throw persistedEnableResult.error;
    }

    const { data: savedSources, error: savedSourcesError } = await supabase
      .from('calendar_sources')
      .select('id, external_id, calendar_type, display_name, enabled, is_default')
      .eq('organization_id', organization.id)
      .eq('provider', provider);
    if (savedSourcesError) throw savedSourcesError;
    const persistedSources = (savedSources ?? []) as CalendarSourceRow[];

    await removeCalendarEvents({
      supabase,
      organizationId: organization.id,
      provider,
      disabledSourceIds: persistedSources.filter((source) => !source.enabled).map((source) => source.id),
    });

    let syncQueued = false;
    const warnings = [...discovered.warnings];
    if (selectedKeys.length > 0) {
      try {
        await inngest.send({
          name: INNGEST_EVENTS.CALENDAR_SYNC_REQUESTED,
          data: {
            organizationId: organization.id,
            provider,
            connectionId: connection.connectionId,
            reason: 'calendar_sources_updated',
          },
        });
        syncQueued = true;
      } catch {
        warnings.push('The calendars were saved, but the immediate refresh could not be queued. Canon will retry automatically.');
      }
    }

    return NextResponse.json({
      saved: true,
      syncQueued,
      sources: mergedSources(discovered.sources, persistedSources)
        .map(({ source, available }) => sourceOption(source, selectedKeySet, available)),
      warnings,
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Unable to save calendars',
      detail: errorMessage(error),
    }, { status: 500 });
  }
}
