import type { SupabaseClient } from '@supabase/supabase-js';
import {
  diffDelta,
  emptyCanonicalDiff,
  type DiffDelta,
} from '@/lib/server/diff/contracts';
import { runDiffForSourcesWithBreakdown } from '@/lib/server/diff/runDiffForSources';
import { computeAndCompareMetrics } from '@/lib/server/signals/baseline';
import { computeWeightedEffort } from '@/lib/server/signals/effortWeights';
import { evaluateSignalRules } from '@/lib/server/signals/rules';
import { getWorkspaceSignalSettings, resolveSignalSourceIds } from '@/lib/server/signals/settings';
import type {
  MetricComparison,
  MetricWindow,
  SignalEvidenceRecord,
  SignalRecord,
  SignalRunResult,
  SignalSeverity,
} from '@/lib/server/signals/types';
import { getNormalizedWindowForDays } from '@/lib/server/signals/window';

type SignalRow = {
  id: string;
  type: string;
  severity: string;
  signal_run_id?: string | null;
  primary_source_id?: string | null;
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
};

type SignalEvidenceRow = {
  signal_id: string;
  evidence_type: string;
  evidence_id: string;
  label: string | null;
  rank: number;
  payload: Record<string, unknown> | null;
};

const SIGNAL_FINGERPRINT_CONFLICT_COLUMNS = [
  'user_id',
  'type',
  'scope_type',
  'scope_id',
  'metric_key',
  'window_start',
  'window_end',
  'baseline_start',
  'baseline_end',
].join(',');

function signalFingerprintKey(row: {
  type: string;
  scope_type: string;
  scope_id: string | null;
  metric_key: string;
  window_start: string;
  window_end: string;
  baseline_start: string;
  baseline_end: string;
}): string {
  return [
    row.type,
    row.scope_type,
    row.scope_id || '',
    row.metric_key,
    row.window_start,
    row.window_end,
    row.baseline_start,
    row.baseline_end,
  ].join('|');
}

function toSignalRecord(row: SignalRow, evidence: SignalEvidenceRecord[]): SignalRecord {
  return {
    id: row.id,
    created_at: row.created_at,
    type: row.type as SignalRecord['type'],
    severity: row.severity as SignalSeverity,
    signal_run_id: row.signal_run_id,
    primary_source_id: row.primary_source_id,
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

function toExternalBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function resolveJiraSiteUrl(scope: Record<string, unknown> | null | undefined): string | null {
  if (!scope) return null;
  return (
    toExternalBaseUrl(scope.jira_site_url) ||
    toExternalBaseUrl(scope.jiraSiteUrl) ||
    toExternalBaseUrl(scope.site_url) ||
    toExternalBaseUrl(scope.siteUrl) ||
    toExternalBaseUrl(scope.url)
  );
}

function projectFromIssueKey(issueKey: string | null | undefined): string | null {
  if (typeof issueKey !== 'string') return null;
  const trimmed = issueKey.trim();
  const dash = trimmed.indexOf('-');
  if (dash <= 0) return null;
  return trimmed.slice(0, dash).toUpperCase();
}

function normalizeGitHubRepo(repo: string | null | undefined): string | null {
  if (typeof repo !== 'string') return null;
  const trimmed = repo.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (sshMatch) return sshMatch[1];

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.hostname.toLowerCase() === 'github.com') {
      const path = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
      if (path) return path.replace(/\.git$/i, '');
    }
  } catch {
    // fall through to plain owner/repo parsing
  }

  const plain = trimmed
    .replace(/^github\.com\//i, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const segments = plain.split('/');
  if (segments.length < 2) return null;
  const owner = segments[0];
  const name = segments[1];
  if (!owner || !name) return null;
  return `${owner}/${name}`;
}

function splitRepo(repo: string): { owner: string; name: string } | null {
  const [owner, name] = repo.split('/');
  if (!owner || !name) return null;
  return { owner, name };
}

function githubPullRequestUrl(repo: string | null | undefined, id: string | null | undefined): string | null {
  const normalizedRepo = normalizeGitHubRepo(repo);
  const normalizedId = typeof id === 'string' ? id.trim() : '';
  if (!normalizedRepo || !normalizedId) return null;
  const parts = splitRepo(normalizedRepo);
  if (!parts) return null;
  return `https://github.com/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.name)}/pull/${encodeURIComponent(normalizedId)}`;
}

function jiraIssueUrl(issueKey: string | null | undefined, jiraBrowseBaseByProject: Map<string, string>): string | null {
  const project = projectFromIssueKey(issueKey);
  if (!project || !issueKey) return null;
  const browseBase = jiraBrowseBaseByProject.get(project);
  if (!browseBase) return null;
  return `${browseBase}/browse/${issueKey}`;
}

export function sortSignalsByPriority<T extends { severity: string; percent_change: number }>(signals: T[]): T[] {
  return [...signals].sort((a, b) => {
    const severityDiff = severityRank(b.severity) - severityRank(a.severity);
    if (severityDiff !== 0) return severityDiff;
    return Math.abs(b.percent_change) - Math.abs(a.percent_change);
  });
}

function defaultWindowForSettings(baselineDays: number, timeZone: string): MetricWindow {
  const window = getNormalizedWindowForDays(baselineDays, new Date(), undefined, timeZone);
  return { start: window.start, end: window.end };
}

async function insertSignalWithEvidence(params: {
  supabase: SupabaseClient;
  userId: string;
  signalRunId: string;
  primarySourceId: string | null;
  signal: Omit<SignalRecord, 'id' | 'created_at'>;
}): Promise<SignalRecord> {
  const { supabase, userId, signalRunId, primarySourceId, signal } = params;
  const upsertPayload = {
    user_id: userId,
    signal_run_id: signalRunId,
    primary_source_id: primarySourceId,
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
  };

  const { data: inserted, error: signalErr } = (await supabase
    .from('signals')
    .upsert(upsertPayload, { onConflict: SIGNAL_FINGERPRINT_CONFLICT_COLUMNS })
    .select(
      'id, type, severity, signal_run_id, primary_source_id, scope_type, scope_id, metric_key, window_start, window_end, baseline_start, baseline_end, current_value, baseline_value, absolute_change, percent_change, title, summary_line, metadata, created_at'
    )
    .single()) as { data: SignalRow | null; error: { message: string } | null };

  if (signalErr || !inserted?.id) {
    throw new Error(signalErr?.message || 'Failed to insert signal row');
  }

  const signalId = inserted.id;
  const { error: clearEvidenceErr } = await supabase
    .from('signal_evidence')
    .delete()
    .eq('user_id', userId)
    .eq('signal_id', signalId);
  if (clearEvidenceErr) {
    throw new Error(clearEvidenceErr.message || 'Failed to clear prior signal evidence');
  }

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
}): Promise<SignalRunResult> {
  const { supabase, userId } = params;

  const settings = await getWorkspaceSignalSettings({ supabase, userId });
  const sourceIds = await resolveSignalSourceIds({ supabase, userId, sourceIds: params.sourceIds });
  const window = defaultWindowForSettings(settings.baseline_window_days, settings.time_zone);

  const { data: sourceRows } = sourceIds.length
    ? await supabase
        .from('workspace_sources')
        .select('id, provider, name, scope')
        .in('id', sourceIds)
    : { data: [] };
  const sources = (sourceRows || []).map((row) => ({
    id: row.id as string,
    provider: String(row.provider || '').toLowerCase(),
    name: typeof row.name === 'string' ? row.name : null,
    scope: (row.scope as Record<string, unknown> | null) || null,
  }));

  const { current, baseline, comparison } = await computeAndCompareMetrics({
    supabase,
    userId,
    sourceIds,
    window,
    timeZone: settings.time_zone,
  });

  const rawSignalDrafts = evaluateSignalRules(comparison);

  const ticketingProviders = new Set(['jira', 'asana', 'linear']);
  const ticketingSources = sources.filter((source) => ticketingProviders.has(source.provider));
  const allSourcesTicketing = sources.length > 0 && ticketingSources.length === sources.length;
  const singleTicketingSource = sources.length === 1 && ticketingSources.length === 1;

  const ticketingLabel = (source: (typeof sources)[number]): string => {
    const name = typeof source.name === 'string' ? source.name.trim() : '';
    if (name) return name;
    const projectValue =
      source.scope && typeof (source.scope as Record<string, unknown>).project === 'string'
        ? ((source.scope as Record<string, unknown>).project as string).trim()
        : null;
    if (projectValue) return projectValue;
    const providerLabel = source.provider ? `${source.provider[0].toUpperCase()}${source.provider.slice(1)}` : 'Ticketing';
    return providerLabel;
  };

  const signalDrafts = rawSignalDrafts.map((signal) => {
    if (signal.scope_type !== 'global') return signal;

    if (singleTicketingSource) {
      const src = ticketingSources[0];
      return { ...signal, scope_type: 'ticketing' as const, scope_id: ticketingLabel(src) };
    }

    if (allSourcesTicketing) {
      const label =
        ticketingSources.length === 1
          ? ticketingLabel(ticketingSources[0])
          : 'Multiple ticketing workspaces';
      return { ...signal, scope_type: 'ticketing' as const, scope_id: label };
    }

    return signal;
  });

  const { data: runRow } = (await supabase
    .from('signal_runs')
    .insert({
      user_id: userId,
      source_ids: sourceIds,
      window_start: current.window.start,
      window_end: current.window.end,
      baseline_start: baseline.window.start,
      baseline_end: baseline.window.end,
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
      primarySourceId: sourceIds[0] || null,
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
  const fetchLimit = Math.max(30, limit * 20);

  let query = supabase
    .from('signals')
    .select(
      'id, type, severity, signal_run_id, primary_source_id, scope_type, scope_id, metric_key, window_start, window_end, baseline_start, baseline_end, current_value, baseline_value, absolute_change, percent_change, title, summary_line, metadata, created_at'
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

  const dedupedRows: SignalRow[] = [];
  const seenFingerprints = new Set<string>();
  for (const row of rows) {
    const fingerprint = signalFingerprintKey(row);
    if (seenFingerprints.has(fingerprint)) continue;
    seenFingerprints.add(fingerprint);
    dedupedRows.push(row);
    if (dedupedRows.length >= limit) break;
  }
  if (dedupedRows.length === 0) return [];

  const signalIds = dedupedRows.map((row) => row.id);
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

  return dedupedRows.map((row) => toSignalRecord(row, evidenceBySignal.get(row.id) || []));
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
  if (signal.type === 'domain_concentration') return 'Domain focus shifted';
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
  if (signal.type === 'repo_concentration') {
    return `Execution touched ${signed(delta.repos_added.length - delta.repos_removed.length)} net surfaces versus baseline.`;
  }
  if (signal.type === 'domain_concentration') {
    return signal.summary_line;
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
  const weightedCounts: {
    prs_merged: number;
    prs_opened: number;
    tickets_completed: number;
    tickets_regressed: number;
    commits_default: number;
  } = {
    prs_merged: 0,
    prs_opened: 0,
    tickets_completed: 0,
    tickets_regressed: 0,
    commits_default: 0,
  };

  for (const metric of metrics) {
    const magnitude = Math.abs(metric.delta);
    if (metric.key === 'prs_merged') weightedCounts.prs_merged = magnitude;
    if (metric.key === 'prs_opened') weightedCounts.prs_opened = magnitude;
    if (metric.key === 'tickets_completed') weightedCounts.tickets_completed = magnitude;
    if (metric.key === 'tickets_regressed') weightedCounts.tickets_regressed = magnitude;
    if (metric.key === 'commits_default') weightedCounts.commits_default = magnitude;
  }

  return computeWeightedEffort(weightedCounts);
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
    tickets: Array<{ id: string; summary: string | null; occurred_at: string | null; url: string | null }>;
    prs: Array<{ id: string; repo: string | null; occurred_at: string | null; kind: string | null; url: string | null }>;
    repos: Array<{ id: string; activity: number }>;
  };
}> {
  const { supabase, userId, signalId } = params;
  const signal = await getSignalDetail({ supabase, userId, signalId });
  if (!signal) {
    return {
      signal: null,
      baseline_panel: null,
      direction: null,
      evidence: { tickets: [], prs: [], repos: [] },
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

  const tickets: Array<{ id: string; summary: string | null; occurred_at: string | null; url: string | null }> = [];
  const prs: Array<{ id: string; repo: string | null; occurred_at: string | null; kind: string | null; url: string | null }> = [];
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
    const jiraBrowseBaseByProject = new Map<string, string>();
    const { data: sourceRows } = await supabase
      .from('workspace_sources')
      .select('provider, scope')
      .eq('user_id', userId)
      .in('id', sourceIds);
    for (const row of sourceRows || []) {
      const provider = typeof row.provider === 'string' ? row.provider.toLowerCase() : '';
      if (provider !== 'jira') continue;
      const scope = (row.scope as Record<string, unknown> | null) || null;
      const project = typeof scope?.project === 'string' ? scope.project.trim().toUpperCase() : '';
      const siteUrl = resolveJiraSiteUrl(scope);
      if (!project || !siteUrl) continue;
      if (!jiraBrowseBaseByProject.has(project)) {
        jiraBrowseBaseByProject.set(project, siteUrl);
      }
    }

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
          tickets.push({
            id: entityId,
            summary,
            occurred_at: event.occurred_at,
            url: jiraIssueUrl(entityId, jiraBrowseBaseByProject),
          });
        }
      }

      if (provider === 'github' && entityId && kind && kind.startsWith('pr_')) {
        prs.push({
          id: entityId,
          repo,
          occurred_at: event.occurred_at,
          kind,
          url: githubPullRequestUrl(repo, entityId),
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
  const targetWindow = window || defaultWindowForSettings(settings.baseline_window_days, settings.time_zone);
  const { comparison } = await computeAndCompareMetrics({
    supabase,
    userId,
    sourceIds: resolvedSourceIds,
    window: targetWindow,
    timeZone: settings.time_zone,
  });
  return comparison;
}
