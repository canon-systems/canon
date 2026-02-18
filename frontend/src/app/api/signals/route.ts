import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { listSignals } from '@/lib/server/signals/engine';
import { getWindowForDays } from '@/lib/server/schedules/cadence';
import type { SignalSeverity } from '@/lib/server/signals/types';

export const dynamic = 'force-dynamic';

function parseWindowStart(request: NextRequest): string | undefined {
  const raw = request.nextUrl.searchParams.get('window');
  if (!raw) return undefined;

  const normalized = raw.trim().toLowerCase();
  const numeric = normalized.endsWith('d') ? normalized.slice(0, -1) : normalized;
  const days = Number.parseInt(numeric, 10);
  if (!Number.isFinite(days) || days <= 0) return undefined;

  const window = getWindowForDays(days, new Date());
  return window.start;
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const severityParam = request.nextUrl.searchParams.get('severity');
    const severity: SignalSeverity | undefined =
      severityParam === 'elevated' || severityParam === 'significant' ? severityParam : undefined;

    const scope = request.nextUrl.searchParams.get('scope') || undefined;
    const limitRaw = Number.parseInt(request.nextUrl.searchParams.get('limit') || '7', 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 7)) : 7;
    const windowStart = parseWindowStart(request);

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
