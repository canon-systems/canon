import type { SupabaseClient } from '@supabase/supabase-js';
import {
  diffDelta,
  emptyCanonicalDiff,
  type DiffDelta,
} from '@/lib/server/diff/contracts';
import { runDiffForSourcesWithBreakdown } from '@/lib/server/diff/runDiffForSources';
import { computeAndCompareMetrics } from '@/lib/server/signals/baseline';
import { evaluateSignalRules } from '@/lib/server/signals/rules';
import { getWorkspaceSignalSettings, resolveSignalSourceIds } from '@/lib/server/signals/settings';
import type {
  MetricComparison,
  MetricWindow,
  SignalEvidenceRecord,
  SignalRecord,
  SignalRunResult,
  SignalRunTrigger,
  SignalSeverity,
} from '@/lib/server/signals/types';
import { getWindowForDays } from '@/lib/server/schedules/cadence';

type SignalRow = {
  id: string;
  type: string;
  severity: string;
  scope_type: string;
  scope_id: string | null;
  metric_key: string;
  window_start: string;
  window_end: string;
  baseline_start: string;
  baseline_end: string;
  current_value: number | null;
  baseline_value: number | null;
  absolute_change: number | null;
  percent_change: number | null;
  title: string;
  summary_line: string;
  metadata: Record<string, unknown> | null;
  created_at?: string;
  signal_run_id?: string | null;
};

type SignalEvidenceRow = {
  signal_id: string;
  evidence_type: string;
  evidence_id: string;
  label: string | null;
  rank: number;
  payload: Record<string, unknown> | null;
};

function toSignalRecord(row: SignalRow, evidence: SignalEvidenceRecord[]): SignalRecord {
  return {
    id: row.id,
    type: row.type as SignalRecord['type'],
    severity: row.severity as SignalSeverity,
    scope_type: row.scope_type as SignalRecord['scope_type'],
    scope_id: row.scope_id,
    metric_key: row.metric_key,
    window_start: row.window_start,
    window_end: row.window_end,
    baseline_start: row.baseline_start,
    baseline_end: row.baseline_end,
    current_value: Number(row.current_value || 0),
    baseline_value: Number(row.baseline_value || 0),
    absolute_change: Number(row.absolute_change || 0),
    percent_change: Number(row.percent_change || 0),
    title: row.title,
    summary_line: row.summary_line,
    metadata: row.metadata || {},
    evidence,
  };
}

function severityRank(severity: string): number {
  if (severity === 'significant') return 2;
  if (severity === 'elevated') return 1;
  return 0;
}

export function sortSignalsByPriority<T extends { severity: string; percent_change: number }>(signals: T[]): T[] {
  return [...signals].sort((a, b) => {
    const severityDiff = severityRank(b.severity) - severityRank(a.severity);
    if (severityDiff !== 0) return severityDiff;
    return Math.abs(b.percent_change) - Math.abs(a.percent_change);
  });
}

function defaultWindowForSettings(baselineDays: number): MetricWindow {
  const now = new Date();
  const window = getWindowForDays(Math.max(1, baselineDays || 7), now);
  return { start: window.start, end: window.end };
}

async function insertSignalWithEvidence(params: {
  supabase: SupabaseClient;
  userId: string;
  signalRunId: string;
  signal: Omit<SignalRecord, 'id'>;
}): Promise<SignalRecord> {
  const { supabase, userId, signalRunId, signal } = params;

  const { data: inserted, error: signalErr } = (await supabase
    .from('signals')
    .insert({
      user_id: userId,
      signal_run_id: signalRunId,
      type: signal.type,
      severity: signal.severity,
      scope_type: signal.scope_type,
      scope_id: signal.scope_id,
      metric_key: signal.metric_key,
      window_start: signal.window_start,
      window_end: signal.window_end,
      baseline_start: signal.baseline_start,
      baseline_end: signal.baseline_end,
      current_value: signal.current_value,
      baseline_value: signal.baseline_value,
      absolute_change: signal.absolute_change,
      percent_change: signal.percent_change,
      title: signal.title,
      summary_line: signal.summary_line,
      metadata: signal.metadata || {},
      updated_at: new Date().toISOString(),
    })
    .select(
      'id, type, severity, scope_type, scope_id, metric_key, window_start, window_end, baseline_start, baseline_end, current_value, baseline_value, absolute_change, percent_change, title, summary_line, metadata'
    )
    .single()) as { data: SignalRow | null; error: { message: string } | null };

  if (signalErr || !inserted?.id) {
    throw new Error(signalErr?.message || 'Failed to insert signal row');
  }

  const signalId = inserted.id;
  const evidenceRows = signal.evidence.map((e) => ({
    user_id: userId,
    signal_id: signalId,
    evidence_type: e.evidence_type,
    evidence_id: e.evidence_id,
    label: e.label || null,
    rank: e.rank,
    payload: e.payload || {},
  }));

  if (evidenceRows.length > 0) {
    const { error: evidenceErr } = await supabase.from('signal_evidence').insert(evidenceRows);
    if (evidenceErr) {
      throw new Error(evidenceErr.message || 'Failed to insert signal evidence');
    }
  }

  return toSignalRecord(inserted, signal.evidence);
}

export async function runSignalEngine(params: {
  supabase: SupabaseClient;
  userId: string;
  sourceIds?: string[];
  window?: MetricWindow;
  baselineWindow?: MetricWindow;
  triggerType?: SignalRunTrigger;
}): Promise<SignalRunResult> {
  const { supabase, userId, triggerType = 'manual' } = params;

  const settings = await getWorkspaceSignalSettings({ supabase, userId });
  const sourceIds = await resolveSignalSourceIds({ supabase, userId, sourceIds: params.sourceIds });
  const window = params.window || defaultWindowForSettings(settings.baseline_window_days);

  const { current, baseline, comparison } = await computeAndCompareMetrics({
    supabase,
    userId,
    sourceIds,
    window,
    windowBaseline: params.baselineWindow,
  });

  const signalDrafts = evaluateSignalRules(comparison);

  const { data: runRow } = (await supabase
    .from('signal_runs')
    .insert({
      user_id: userId,
      trigger_type: triggerType,
      source_ids: sourceIds,
      window_start: current.window.start,
      window_end: current.window.end,
      baseline_start: baseline.window.start,
      baseline_end: baseline.window.end,
      signals_count: signalDrafts.length,
      summary: {
        tickets_completed: current.tickets_completed,
        tickets_regressed: current.tickets_regressed,
        regression_rate: current.regression_rate,
        prs_opened: current.prs_opened,
        prs_merged: current.prs_merged,
        repos_touched: current.repos_touched,
      },
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: { message: string } | null };

  if (!runRow?.id) {
    throw new Error('Failed to persist signal run');
  }

  const runId = runRow.id;

  const persistedSignals: SignalRecord[] = [];
  for (const signal of signalDrafts) {
    const inserted = await insertSignalWithEvidence({
      supabase,
      userId,
      signalRunId: runId,
      signal,
    });
    persistedSignals.push(inserted);
  }

  return {
    runId,
    signals: persistedSignals,
    comparison,
  };
}

export async function listSignals(params: {
  supabase: SupabaseClient;
  userId: string;
  severity?: SignalSeverity;
  scope?: string;
  limit?: number;
  windowStart?: string;
  windowEnd?: string;
}): Promise<SignalRecord[]> {
  const { supabase, userId, severity, scope, windowStart, windowEnd } = params;
  const limit = Math.min(7, Math.max(1, params.limit || 7));
  const fetchLimit = Math.max(12, limit * 5);

  let query = supabase
    .from('signals')
    .select(
      'id, type, severity, scope_type, scope_id, metric_key, window_start, window_end, baseline_start, baseline_end, current_value, baseline_value, absolute_change, percent_change, title, summary_line, metadata, created_at'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(fetchLimit);

  if (severity) query = query.eq('severity', severity);
  if (scope) query = query.or(`scope_type.eq.${scope},scope_id.eq.${scope}`);
  if (windowStart) query = query.gte('window_start', windowStart);
  if (windowEnd) query = query.lte('window_end', windowEnd);

  const { data: rows } = (await query) as { data: SignalRow[] | null };
  if (!rows || rows.length === 0) return [];

  const signalIds = rows.map((row) => row.id);
  const { data: evidenceRows } = (await supabase
    .from('signal_evidence')
    .select('signal_id, evidence_type, evidence_id, label, rank, payload')
    .eq('user_id', userId)
    .in('signal_id', signalIds)
    .order('rank', { ascending: true })) as { data: SignalEvidenceRow[] | null };

  const evidenceBySignal = new Map<string, SignalEvidenceRecord[]>();
  for (const row of evidenceRows || []) {
    const list = evidenceBySignal.get(row.signal_id) || [];
    list.push({
      evidence_type: row.evidence_type as SignalEvidenceRecord['evidence_type'],
      evidence_id: row.evidence_id,
      label: row.label || undefined,
      rank: Number(row.rank || 0),
      payload: row.payload || {},
    });
    evidenceBySignal.set(row.signal_id, list);
  }

  return sortSignalsByPriority(rows.map((row) => toSignalRecord(row, evidenceBySignal.get(row.id) || []))).slice(0, limit);
}

export async function getSignalDetail(params: {
  supabase: SupabaseClient;
  userId: string;
  signalId: string;
}): Promise<SignalRecord | null> {
  const { supabase, userId, signalId } = params;
  const { data: row } = (await supabase
    .from('signals')
    .select(
      'id, type, severity, scope_type, scope_id, metric_key, window_start, window_end, baseline_start, baseline_end, current_value, baseline_value, absolute_change, percent_change, title, summary_line, metadata'
    )
    .eq('user_id', userId)
    .eq('id', signalId)
    .maybeSingle()) as { data: SignalRow | null };

  if (!row) return null;

  const { data: evidenceRows } = (await supabase
    .from('signal_evidence')
    .select('signal_id, evidence_type, evidence_id, label, rank, payload')
    .eq('user_id', userId)
    .eq('signal_id', signalId)
    .order('rank', { ascending: true })) as { data: SignalEvidenceRow[] | null };

  const evidence = (evidenceRows || []).map((item) => ({
    evidence_type: item.evidence_type as SignalEvidenceRecord['evidence_type'],
    evidence_id: item.evidence_id,
    label: item.label || undefined,
    rank: Number(item.rank || 0),
    payload: item.payload || {},
  }));

  return toSignalRecord(row, evidence);
}

type CanonicalEventRow = {
  provider: string | null;
  event_kind: string | null;
  entity_id: string | null;
  repo_full_name: string | null;
  occurred_at: string | null;
  metadata: Record<string, unknown> | null;
};

function directionHeadlineForSignal(signal: SignalRecord): string {
  if (signal.type === 'regression_spike') return 'System quality risk increased';
  if (signal.type === 'throughput_drop') return 'Delivery velocity slowed';
  if (signal.type === 'merge_drop') return 'Integration throughput slowed';
  if (signal.type === 'repo_concentration') return 'Execution focus narrowed';
  if (signal.type === 'aku_concentration') return 'Capability focus narrowed';
  return 'System direction shifted';
}

function signed(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function directionSummary(signal: SignalRecord, delta: DiffDelta): string {
  if (signal.type === 'regression_spike') {
    return `Regressions moved ${signed(delta.tickets_regressed)} while completed work moved ${signed(delta.tickets_completed)} against baseline.`;
  }
  if (signal.type === 'throughput_drop') {
    return `Completed work moved ${signed(delta.tickets_completed)} and merged PRs moved ${signed(delta.prs_merged)} against baseline.`;
  }
  if (signal.type === 'merge_drop') {
    return `Merged PRs moved ${signed(delta.prs_merged)} and commits moved ${signed(delta.commits_default)} against baseline.`;
  }
  if (signal.type === 'repo_concentration' || signal.type === 'aku_concentration') {
    return `Execution touched ${signed(delta.repos_added.length - delta.repos_removed.length)} net surfaces versus baseline.`;
  }
  return signal.summary_line;
}

type SourceShiftMetricKey =
  | 'tickets_completed'
  | 'tickets_regressed'
  | 'prs_merged'
  | 'prs_opened'
  | 'commits_default';

type SourceShiftMetric = {
  key: SourceShiftMetricKey;
  label: string;
  current: number;
  baseline: number;
  delta: number;
};

function buildSourceShiftMetrics(params: {
  provider: string;
  current: ReturnType<typeof emptyCanonicalDiff>;
  baseline: ReturnType<typeof emptyCanonicalDiff>;
  delta: DiffDelta;
}): SourceShiftMetric[] {
  const { provider, current, baseline, delta } = params;
  const normalized = provider.toLowerCase();

  if (normalized === 'jira') {
    return [
      {
        key: 'tickets_completed',
        label: 'Completed tickets',
        current: current.tickets_completed,
        baseline: baseline.tickets_completed,
        delta: delta.tickets_completed,
      },
      {
        key: 'tickets_regressed',
        label: 'Regressed tickets',
        current: current.tickets_regressed,
        baseline: baseline.tickets_regressed,
        delta: delta.tickets_regressed,
      },
    ];
  }

  if (normalized === 'github') {
    return [
      {
        key: 'prs_merged',
        label: 'Merged PRs',
        current: current.prs_merged,
        baseline: baseline.prs_merged,
        delta: delta.prs_merged,
      },
      {
        key: 'prs_opened',
        label: 'Opened PRs',
        current: current.prs_opened,
        baseline: baseline.prs_opened,
        delta: delta.prs_opened,
      },
      {
        key: 'commits_default',
        label: 'Commits',
        current: current.commits_default,
        baseline: baseline.commits_default,
        delta: delta.commits_default,
      },
    ];
  }

  return [
    {
      key: 'tickets_completed',
      label: 'Completed tickets',
      current: current.tickets_completed,
      baseline: baseline.tickets_completed,
      delta: delta.tickets_completed,
    },
    {
      key: 'tickets_regressed',
      label: 'Regressed tickets',
      current: current.tickets_regressed,
      baseline: baseline.tickets_regressed,
      delta: delta.tickets_regressed,
    },
    {
      key: 'prs_merged',
      label: 'Merged PRs',
      current: current.prs_merged,
      baseline: baseline.prs_merged,
      delta: delta.prs_merged,
    },
  ];
}

function sourceMovementScore(metrics: SourceShiftMetric[]): number {
  return metrics.reduce((total, metric) => total + Math.abs(metric.delta), 0);
}

export async function getSignalInvestigation(params: {
  supabase: SupabaseClient;
  userId: string;
  signalId: string;
}): Promise<{
  signal: SignalRecord | null;
  baseline_panel: {
    metric_key: string;
    current_value: number;
    baseline_value: number;
    absolute_change: number;
    percent_change: number;
    window_start: string;
    window_end: string;
    baseline_start: string;
    baseline_end: string;
  } | null;
  direction: {
    headline: string;
    summary: string;
    movement: {
      tickets_completed: { current: number; baseline: number; delta: number };
      tickets_regressed: { current: number; baseline: number; delta: number };
      prs_merged: { current: number; baseline: number; delta: number };
      repos_touched: { current: number; baseline: number; delta: number };
    } | null;
    focus: {
      repos_added: string[];
      repos_removed: string[];
    };
    source_mix: {
      has_jira: boolean;
      has_github: boolean;
    };
    source_shifts: Array<{
      source_id: string;
      source_name: string;
      provider: string;
      movement_score: number;
      metrics: SourceShiftMetric[];
    }>;
  } | null;
  evidence: {
    tickets: Array<{ id: string; summary: string | null; occurred_at: string | null }>;
    prs: Array<{ id: string; repo: string | null; occurred_at: string | null; kind: string | null }>;
    repos: Array<{ id: string; activity: number }>;
    akus: Array<{ id: string; label: string | null }>;
  };
}> {
  const { supabase, userId, signalId } = params;
  const signal = await getSignalDetail({ supabase, userId, signalId });
  if (!signal) {
    return {
      signal: null,
      baseline_panel: null,
      direction: null,
      evidence: { tickets: [], prs: [], repos: [], akus: [] },
    };
  }

  let sourceIds: string[] = [];
  const { data: signalRunRow } = (await supabase
    .from('signals')
    .select('signal_run_id')
    .eq('user_id', userId)
    .eq('id', signalId)
    .maybeSingle()) as { data: { signal_run_id?: string | null } | null };
  if (signalRunRow?.signal_run_id) {
    const { data: run } = (await supabase
      .from('signal_runs')
      .select('source_ids')
      .eq('id', signalRunRow.signal_run_id)
      .maybeSingle()) as { data: { source_ids?: string[] } | null };
    sourceIds = Array.isArray(run?.source_ids) ? run.source_ids.filter((id): id is string => typeof id === 'string') : [];
  }

  const tickets: Array<{ id: string; summary: string | null; occurred_at: string | null }> = [];
  const prs: Array<{ id: string; repo: string | null; occurred_at: string | null; kind: string | null }> = [];
  const repoCounts = new Map<string, number>();
  let direction: {
    headline: string;
    summary: string;
    movement: {
      tickets_completed: { current: number; baseline: number; delta: number };
      tickets_regressed: { current: number; baseline: number; delta: number };
      prs_merged: { current: number; baseline: number; delta: number };
      repos_touched: { current: number; baseline: number; delta: number };
    } | null;
    focus: {
      repos_added: string[];
      repos_removed: string[];
    };
    source_mix: {
      has_jira: boolean;
      has_github: boolean;
    };
    source_shifts: Array<{
      source_id: string;
      source_name: string;
      provider: string;
      movement_score: number;
      metrics: SourceShiftMetric[];
    }>;
  } | null = null;

  if (sourceIds.length > 0) {
    const currentWindow = {
      start: signal.window_start,
      end: signal.window_end,
    };
    const baselineWindow = {
      start: signal.baseline_start,
      end: signal.baseline_end,
    };

    const [currentDiff, baselineDiff, eventsResult] = await Promise.all([
      runDiffForSourcesWithBreakdown(userId, sourceIds, currentWindow, supabase),
      runDiffForSourcesWithBreakdown(userId, sourceIds, baselineWindow, supabase),
      supabase
        .from('diff_event_canonical')
        .select('provider, event_kind, entity_id, repo_full_name, occurred_at, metadata')
        .in('source_id', sourceIds)
        .gte('occurred_at', signal.window_start)
        .lte('occurred_at', signal.window_end)
        .order('occurred_at', { ascending: false })
        .limit(250),
    ]);

    const aggregateDelta = diffDelta(currentDiff.aggregate, baselineDiff.aggregate);
    const sourceIndex = new Map(
      currentDiff.sources
        .concat(baselineDiff.sources)
        .map((source) => [source.id, source] as const)
    );
    const sourceList = Array.from(sourceIndex.values());
    const sourceShifts = sourceList
      .map((source) => {
        const current = currentDiff.bySource[source.id] || emptyCanonicalDiff(currentWindow);
        const baseline = baselineDiff.bySource[source.id] || emptyCanonicalDiff(baselineWindow);
        const delta = diffDelta(current, baseline);
        const metrics = buildSourceShiftMetrics({
          provider: source.provider,
          current,
          baseline,
          delta,
        });
        const score = sourceMovementScore(metrics);

        return {
          source_id: source.id,
          source_name: source.display_name,
          provider: source.provider,
          movement_score: score,
          metrics,
        };
      })
      .filter((item) => item.movement_score > 0)
      .sort((a, b) => b.movement_score - a.movement_score)
      .slice(0, 6);

    direction = {
      headline: directionHeadlineForSignal(signal),
      summary: directionSummary(signal, aggregateDelta),
      movement: {
        tickets_completed: {
          current: currentDiff.aggregate.tickets_completed,
          baseline: baselineDiff.aggregate.tickets_completed,
          delta: aggregateDelta.tickets_completed,
        },
        tickets_regressed: {
          current: currentDiff.aggregate.tickets_regressed,
          baseline: baselineDiff.aggregate.tickets_regressed,
          delta: aggregateDelta.tickets_regressed,
        },
        prs_merged: {
          current: currentDiff.aggregate.prs_merged,
          baseline: baselineDiff.aggregate.prs_merged,
          delta: aggregateDelta.prs_merged,
        },
        repos_touched: {
          current: currentDiff.aggregate.repos_touched.length,
          baseline: baselineDiff.aggregate.repos_touched.length,
          delta: currentDiff.aggregate.repos_touched.length - baselineDiff.aggregate.repos_touched.length,
        },
      },
      focus: {
        repos_added: aggregateDelta.repos_added.slice(0, 6),
        repos_removed: aggregateDelta.repos_removed.slice(0, 6),
      },
      source_mix: {
        has_jira: sourceList.some((item) => item.provider.toLowerCase() === 'jira'),
        has_github: sourceList.some((item) => item.provider.toLowerCase() === 'github'),
      },
      source_shifts: sourceShifts,
    };

    const events = eventsResult.data as CanonicalEventRow[] | null;

    for (const event of events || []) {
      const provider = (event.provider || '').toLowerCase();
      const kind = event.event_kind || null;
      const entityId = event.entity_id || null;
      const repo = event.repo_full_name || null;
      const metadata = (event.metadata || {}) as Record<string, unknown>;

      if (provider === 'jira' && entityId && kind && kind.startsWith('ticket_')) {
        const summary =
          typeof metadata.summary === 'string'
            ? metadata.summary
            : typeof metadata.title === 'string'
              ? metadata.title
              : null;
        if (!tickets.some((t) => t.id === entityId && t.occurred_at === event.occurred_at)) {
          tickets.push({ id: entityId, summary, occurred_at: event.occurred_at });
        }
      }

      if (provider === 'github' && entityId && kind && kind.startsWith('pr_')) {
        prs.push({
          id: entityId,
          repo,
          occurred_at: event.occurred_at,
          kind,
        });
      }

      if (repo) {
        repoCounts.set(repo, (repoCounts.get(repo) || 0) + 1);
      }
    }
  }

  const repos = Array.from(repoCounts.entries())
    .map(([id, activity]) => ({ id, activity }))
    .sort((a, b) => b.activity - a.activity)
    .slice(0, 10);

  const akus = signal.evidence
    .filter((item) => item.evidence_type === 'aku')
    .map((item) => ({ id: item.evidence_id, label: item.label || null }));

  return {
    signal,
    baseline_panel: {
      metric_key: signal.metric_key,
      current_value: signal.current_value,
      baseline_value: signal.baseline_value,
      absolute_change: signal.absolute_change,
      percent_change: signal.percent_change,
      window_start: signal.window_start,
      window_end: signal.window_end,
      baseline_start: signal.baseline_start,
      baseline_end: signal.baseline_end,
    },
    evidence: {
      tickets: tickets.slice(0, 25),
      prs: prs.slice(0, 25),
      repos,
      akus,
    },
    direction,
  };
}

export async function getTopSignalsForWindow(params: {
  supabase: SupabaseClient;
  userId: string;
  window?: MetricWindow;
  limit?: number;
}): Promise<SignalRecord[]> {
  const { supabase, userId, window, limit = 3 } = params;
  const signals = await listSignals({
    supabase,
    userId,
    limit: Math.min(7, Math.max(1, limit)),
    windowStart: window?.start,
    windowEnd: window?.end,
  });

  return sortSignalsByPriority(signals).slice(0, limit);
}

export async function getLatestComparison(params: {
  supabase: SupabaseClient;
  userId: string;
  sourceIds?: string[];
  window?: MetricWindow;
}): Promise<MetricComparison> {
  const { supabase, userId, sourceIds, window } = params;
  const settings = await getWorkspaceSignalSettings({ supabase, userId });
  const resolvedSourceIds = await resolveSignalSourceIds({ supabase, userId, sourceIds });
  const targetWindow = window || defaultWindowForSettings(settings.baseline_window_days);
  const { comparison } = await computeAndCompareMetrics({
    supabase,
    userId,
    sourceIds: resolvedSourceIds,
    window: targetWindow,
  });
  return comparison;
}
