import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { DateTime } from 'luxon';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { listSignals } from '@/lib/server/signals/engine';
import { getWorkspaceSignalSettings } from '@/lib/server/signals/settings';
import { normalizeTimeZone, parseSignalSeverityParam, parseTimeZoneParam, windowStartFromParam } from '@/lib/server/signals/window';

export const dynamic = 'force-dynamic';
const TIME_ZONE_COOKIE = 'canon_tz';

function parseDateParam(value: string | null): string | null {
  if (!value) return null;
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

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const severityParam = request.nextUrl.searchParams.get('severity');
    const severity = parseSignalSeverityParam(severityParam);

    const scope = request.nextUrl.searchParams.get('scope') || undefined;
    const limit = Number.parseInt(request.nextUrl.searchParams.get('limit') || '', 10);
    const tzParam = request.nextUrl.searchParams.get('tz');
    const cookieStore = await cookies();
    const cookieTimeZone = parseTimeZoneParam(cookieStore.get(TIME_ZONE_COOKIE)?.value);
    const settings = await getWorkspaceSignalSettings({ supabase, userId: user.id });
    const settingsTimeZone = parseTimeZoneParam(settings.time_zone);
    const timeZone = normalizeTimeZone(parseTimeZoneParam(tzParam) || cookieTimeZone || settingsTimeZone);
    const startDateParam = parseDateParam(request.nextUrl.searchParams.get('start'));
    const endDateParam = parseDateParam(request.nextUrl.searchParams.get('end'));
    let windowStart: string | undefined;
    let windowEnd: string | undefined;

    if (startDateParam && endDateParam) {
      const [fromDay, toDay] = startDateParam <= endDateParam ? [startDateParam, endDateParam] : [endDateParam, startDateParam];
      const startRange = localDayToUtcRange(fromDay, timeZone);
      const endRange = localDayToUtcRange(toDay, timeZone);
      if (startRange && endRange) {
        windowStart = startRange.start;
        windowEnd = endRange.end;
      }
    } else {
      windowStart = windowStartFromParam(request.nextUrl.searchParams.get('window'), new Date(), undefined, timeZone);
    }

    const signals = await listSignals({
      supabase,
      userId: user.id,
      severity,
      scope,
      limit,
      windowStart,
      windowEnd,
    });

    return NextResponse.json(
      {
        time_zone: timeZone,
        signals: signals.map((signal) => ({
          id: signal.id,
          title: signal.title,
          summary_line: signal.summary_line,
          severity: signal.severity,
          primary_source_id: signal.primary_source_id,
          scope: {
            type: signal.scope_type,
            id: signal.scope_id,
          },
          metric_key: signal.metric_key,
          current_value: signal.current_value,
          baseline_value: signal.baseline_value,
          absolute_change: signal.absolute_change,
          percent_change: signal.percent_change,
          window_start: signal.window_start,
          window_end: signal.window_end,
        })),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/signals] GET failed', error);
    return NextResponse.json({ error: 'Failed to load signals', detail: message }, { status: 500 });
  }
}
