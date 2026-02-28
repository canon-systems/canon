import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DateTime } from 'luxon';
import { getSession } from '@/lib/auth';
import { getWorkspaceSignalSettings } from '@/lib/server/signals/settings';
import { createClient } from '@/lib/supabase/server';
import { listSignals } from '@/lib/server/signals/engine';
import {
  normalizeTimeZone,
  parseSignalSeverityParam,
  parseTimeZoneParam,
} from '@/lib/server/signals/window';
import SignalsPageClient from './page-client';

export const dynamic = 'force-dynamic';
const TIME_ZONE_COOKIE = 'canon_tz';
const SIGNAL_METRIC_KEYS = [
  'regression_rate',
  'tickets_completed',
  'repo_distribution',
  'domain_distribution',
] as const;
type SignalMetricKey = (typeof SIGNAL_METRIC_KEYS)[number];

function parseMetricParam(value: string | string[] | undefined): SignalMetricKey | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return SIGNAL_METRIC_KEYS.includes(trimmed as SignalMetricKey) ? (trimmed as SignalMetricKey) : undefined;
}

function parseDateParam(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function localDayToUtcRange(day: string, timeZone: string): { start: string; end: string } | null {
  const localStart = DateTime.fromISO(day, { zone: timeZone }).startOf('day');
  if (!localStart.isValid) return null;
  const localEnd = localStart.plus({ days: 1 }).minus({ milliseconds: 1 });
  const start = localStart.toUTC().toISO({ suppressMilliseconds: false });
  const end = localEnd.toUTC().toISO({ suppressMilliseconds: false });
  if (!start || !end) return null;
  return { start, end };
}

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session, user } = await getSession();
  if (!session || !user) {
    redirect('/login');
  }

  const params = await searchParams;
  const startDateParam = parseDateParam(params.start);
  const endDateParam = parseDateParam(params.end);
  const severityParam = typeof params.severity === 'string' ? params.severity : undefined;
  const metricParam = parseMetricParam(params.metric) || parseMetricParam(params.metrc);
  const tzParam = typeof params.tz === 'string' ? params.tz : undefined;
  const severity = parseSignalSeverityParam(severityParam);
  const selectedSeverity = severity || 'all';
  const selectedMetric = metricParam || 'all';
  const scope = typeof params.scope === 'string' && params.scope.trim().length > 0 ? params.scope : undefined;
  const cookieStore = await cookies();
  const cookieTimeZone = parseTimeZoneParam(cookieStore.get(TIME_ZONE_COOKIE)?.value);
  const supabase = await createClient();
  const settings = await getWorkspaceSignalSettings({ supabase, userId: user.id });
  const settingsTimeZone = parseTimeZoneParam(settings.time_zone);
  const timeZone = normalizeTimeZone(parseTimeZoneParam(tzParam) || cookieTimeZone || settingsTimeZone);

  let selectedStartDate: string | null = null;
  let selectedEndDate: string | null = null;
  let detectedStart: string | undefined;
  let detectedEnd: string | undefined;

  if (startDateParam && endDateParam) {
    const [fromDay, toDay] = startDateParam <= endDateParam ? [startDateParam, endDateParam] : [endDateParam, startDateParam];
    const startRange = localDayToUtcRange(fromDay, timeZone);
    const endRange = localDayToUtcRange(toDay, timeZone);
    if (startRange && endRange) {
      selectedStartDate = fromDay;
      selectedEndDate = toDay;
      detectedStart = startRange.start;
      detectedEnd = endRange.end;
    }
  }

  const signals = await listSignals({
    supabase,
    userId: user.id,
    severity,
    metricKey: metricParam,
    scope,
    detectedStart,
    detectedEnd,
  });

  const runIds = signals
    .map((signal) => signal.signal_run_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const sourceIdsByRun = new Map<string, string[]>();
  if (runIds.length > 0) {
    const { data: runRows } = await supabase
      .from('signal_runs')
      .select('id, source_ids')
      .in('id', runIds);
    for (const run of runRows || []) {
      const ids = Array.isArray(run.source_ids) ? run.source_ids.filter((id: unknown): id is string => typeof id === 'string') : [];
      sourceIdsByRun.set(run.id, ids);
    }
  }

  const singleSourceIds = Array.from(sourceIdsByRun.values())
    .filter((ids) => ids.length === 1)
    .map((ids) => ids[0]);
  const uniqueSourceIds = Array.from(new Set(singleSourceIds));

  const sourceInfo = new Map<
    string,
    { provider: string | null; name: string | null; scope: Record<string, unknown> | null }
  >();
  if (uniqueSourceIds.length > 0) {
    const { data: sourceRows } = await supabase
      .from('workspace_sources')
      .select('id, provider, name, scope')
      .in('id', uniqueSourceIds);
    for (const src of sourceRows || []) {
      sourceInfo.set(src.id, {
        provider: src.provider || null,
        name: src.name || null,
        scope: (src.scope as Record<string, unknown> | null) || null,
      });
    }
  }

  const sourceLabelForId = (sourceId: string | null | undefined): string | null => {
    if (!sourceId) return null;
    const source = sourceInfo.get(sourceId);
    if (!source) return null;
    const name = typeof source.name === 'string' ? source.name.trim() : '';
    if (name) return name;
    return 'Source unavailable';
  };

  return (
    <SignalsPageClient
      signals={signals.map((signal) => {
        const sourceIds = signal.signal_run_id ? sourceIdsByRun.get(signal.signal_run_id) || [] : [];
        const singleSourceId = sourceIds.length === 1 ? sourceIds[0] : null;
        const chosenSourceId = singleSourceId;
        const sourceLabel = sourceLabelForId(chosenSourceId);

        return {
          id: signal.id,
          created_at: signal.created_at || null,
          title: signal.title,
          summary_line: signal.summary_line,
          severity: signal.severity,
          scope: { type: signal.scope_type, id: signal.scope_id || null },
          metric_key: signal.metric_key,
          current_value: signal.current_value,
          baseline_value: signal.baseline_value,
          percent_change: signal.percent_change,
          window_start: signal.window_start,
          window_end: signal.window_end,
          scope_label_override: chosenSourceId ? sourceLabel : null,
          risk_posture: signal.structural?.risk?.posture || null,
          structural_sentence: signal.structural?.sentence || null,
          confidence: signal.structural?.confidence || null,
        };
      })}
      selectedStartDate={selectedStartDate}
      selectedEndDate={selectedEndDate}
      selectedSeverity={selectedSeverity}
      selectedMetric={selectedMetric}
      timeZone={timeZone}
    />
  );
}
