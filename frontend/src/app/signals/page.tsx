import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { listSignals } from '@/lib/server/signals/engine';
import { getWindowForDays } from '@/lib/server/schedules/cadence';
import type { SignalSeverity } from '@/lib/server/signals/types';
import SignalsPageClient from './page-client';

export const dynamic = 'force-dynamic';

function parseWindowDays(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const parsed = Number.parseInt(String(raw ?? '').replace(/d$/i, ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 90);
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
  const windowDays = parseWindowDays(typeof params.window === 'string' ? params.window : undefined);
  const severityParam = typeof params.severity === 'string' ? params.severity : undefined;
  const severity: SignalSeverity | undefined =
    severityParam === 'elevated' || severityParam === 'significant' ? severityParam : undefined;
  const selectedSeverity = severity || 'all';
  const scope = typeof params.scope === 'string' && params.scope.trim().length > 0 ? params.scope : undefined;
  const windowStart = windowDays != null ? getWindowForDays(windowDays, new Date()).start : undefined;
  const supabase = await createClient();

  const signals = await listSignals({
    supabase,
    userId: user.id,
    severity,
    scope,
    limit: 7,
    windowStart,
  });

  return (
    <SignalsPageClient
      signals={signals.map((signal) => ({
        id: signal.id,
        title: signal.title,
        summary_line: signal.summary_line,
        severity: signal.severity,
        scope: { type: signal.scope_type, id: signal.scope_id || null },
        percent_change: signal.percent_change,
        window_start: signal.window_start,
        window_end: signal.window_end,
      }))}
      windowDays={windowDays}
      selectedSeverity={selectedSeverity}
    />
  );
}
