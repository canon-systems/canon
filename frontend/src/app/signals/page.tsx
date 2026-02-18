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

  const primarySourceIds = signals
    .map((signal) => signal.primary_source_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const uniqueSourceIds = Array.from(new Set([...singleSourceIds, ...primarySourceIds]));

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
        const primarySourceId = signal.primary_source_id || null;
        const singleSourceId = sourceIds.length === 1 ? sourceIds[0] : null;
        const chosenSourceId = primarySourceId || singleSourceId;
        const sourceLabel = sourceLabelForId(chosenSourceId);

        return {
          id: signal.id,
          created_at: signal.created_at || null,
          title: signal.title,
          summary_line: signal.summary_line,
          severity: signal.severity,
          scope: { type: signal.scope_type, id: signal.scope_id || null },
          primary_source_id: signal.primary_source_id || null,
          metric_key: signal.metric_key,
          current_value: signal.current_value,
          baseline_value: signal.baseline_value,
          percent_change: signal.percent_change,
          window_start: signal.window_start,
          window_end: signal.window_end,
          scope_label_override: chosenSourceId ? sourceLabel : null,
        };
      })}
      windowDays={windowDays}
      selectedSeverity={selectedSeverity}
    />
  );
}
