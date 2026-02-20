import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { listSignals } from '@/lib/server/signals/engine';
import { getWorkspaceSignalSettings } from '@/lib/server/signals/settings';
import { normalizeTimeZone, parseSignalSeverityParam, parseTimeZoneParam, windowStartFromParam } from '@/lib/server/signals/window';

export const dynamic = 'force-dynamic';
const TIME_ZONE_COOKIE = 'canon_tz';

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
    const windowStart = windowStartFromParam(request.nextUrl.searchParams.get('window'), new Date(), undefined, timeZone);

    const signals = await listSignals({
      supabase,
      userId: user.id,
      severity,
      scope,
      limit,
      windowStart,
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
