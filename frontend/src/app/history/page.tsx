import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DateTime } from 'luxon';
import { getSession } from '@/lib/auth';
import { computeDiffComparison, type CompareResponse, type WorkspaceSourceRow } from '@/lib/server/diff/compare';
import { DIFF_SOURCE_PROVIDERS } from '@/lib/server/sources/providers';
import { getWorkspaceSignalSettings } from '@/lib/server/signals/settings';
import {
  computeBaselineWindowForTimeZone,
  normalizeTimeZone,
  parseTimeZoneParam,
} from '@/lib/server/signals/window';
import { createClient } from '@/lib/supabase/server';
import HistoryPageClient from './page-client';

const TIME_ZONE_COOKIE = 'canon_tz';

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session, user } = await getSession();

  if (!session || !user) {
    redirect('/login');
  }

  const params = await searchParams;
  const requestedTimeZone = typeof params.tz === 'string' ? parseTimeZoneParam(params.tz) : null;
  const cookieStore = await cookies();
  const cookieTimeZone = parseTimeZoneParam(cookieStore.get(TIME_ZONE_COOKIE)?.value);

  const supabase = await createClient();
  const settings = await getWorkspaceSignalSettings({ supabase, userId: user.id });
  const settingsTimeZone = parseTimeZoneParam(settings.time_zone);
  const timeZone = normalizeTimeZone(requestedTimeZone || cookieTimeZone || settingsTimeZone);

  const { data: sourceRows, error } = await supabase
    .from('workspace_sources')
    .select('id, name, provider, scope')
    .eq('user_id', user.id)
    .in('provider', [...DIFF_SOURCE_PROVIDERS])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load sources for history:', error);
  }

  const resolvedSourceRows = (sourceRows || []) as WorkspaceSourceRow[];
  const sources = resolvedSourceRows.map((source) => ({
    id: source.id,
    name: source.name,
    provider: source.provider,
    scope: source.scope || null,
  }));

  let initialData: CompareResponse | null = null;
  let initialError: string | null = null;
  let initialLastUpdatedAt: string | null = null;
  const todayLocal = DateTime.now().setZone(timeZone).startOf('day');
  const primaryWindow = {
    start: todayLocal.toUTC().toISO({ suppressMilliseconds: false }) ?? new Date(todayLocal.toMillis()).toISOString(),
    end:
      todayLocal
        .plus({ days: 1 })
        .minus({ milliseconds: 1 })
        .toUTC()
        .toISO({ suppressMilliseconds: false }) ?? new Date(todayLocal.toMillis()).toISOString(),
  };
  const baselineWindow = computeBaselineWindowForTimeZone(primaryWindow, timeZone);

  if (resolvedSourceRows.length > 0) {
    try {
      initialData = await computeDiffComparison({
        userId: user.id,
        sourceIds: resolvedSourceRows.map((source) => source.id),
        startTimestamp: primaryWindow.start,
        endTimestamp: primaryWindow.end,
        compareStartTimestamp: baselineWindow.start,
        compareEndTimestamp: baselineWindow.end,
        sourceRows: resolvedSourceRows,
      });
      initialLastUpdatedAt = new Date().toISOString();
    } catch (compareError) {
      console.error('Failed to load compare data for history:', compareError);
      initialError = compareError instanceof Error ? compareError.message : 'Failed to load Canon History';
    }
  }

  return (
    <HistoryPageClient
      sources={sources}
      initialData={initialData}
      initialError={initialError}
      initialLastUpdatedAt={initialLastUpdatedAt}
      primaryWindow={primaryWindow}
      baselineWindow={baselineWindow}
      timeZone={timeZone}
    />
  );
}
