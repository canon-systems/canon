import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ComputeMetricsInput,
  MetricComparison,
  MetricDelta,
  MetricSnapshot,
  MetricWindow,
  RobustBaselineStat,
  RobustSignalBaseline,
} from '@/lib/server/signals/types';
import { computeMetrics } from '@/lib/server/signals/metrics';
import { computeBaselineWindowForTimeZone, DEFAULT_SIGNAL_TIME_ZONE } from '@/lib/server/signals/window';

const ROBUST_Z_SCALE = 1.4826;
const DEFAULT_ROBUST_HISTORY_WINDOWS = 8;

function asDelta(metricKey: string, current: number, baseline: number): MetricDelta {
  const absoluteChange = current - baseline;
  let percentChange = 0;
  if (baseline === 0) {
    percentChange = current === 0 ? 0 : current > 0 ? 100 : -100;
  } else {
    percentChange = (absoluteChange / Math.abs(baseline)) * 100;
  }

  return {
    metric_key: metricKey,
    current_value: current,
    baseline_value: baseline,
    absolute_change: absoluteChange,
    percent_change: Number.isFinite(percentChange) ? percentChange : 0,
  };
}

export async function computeCurrentAndBaselineMetrics(params: {
  supabase: SupabaseClient;
  userId: string;
  sourceIds: string[];
  windowCurrent: MetricWindow;
  windowBaseline?: MetricWindow;
  timeZone?: string;
}): Promise<{ current: MetricSnapshot; baseline: MetricSnapshot; windowBaseline: MetricWindow }> {
  const { supabase, userId, sourceIds, windowCurrent, windowBaseline, timeZone } = params;
  const baselineWindow =
    windowBaseline || computeBaselineWindowForTimeZone(windowCurrent, timeZone || DEFAULT_SIGNAL_TIME_ZONE);

  const [current, baseline] = await Promise.all([
    computeMetrics({ supabase, userId, sourceIds, window: windowCurrent }),
    computeMetrics({ supabase, userId, sourceIds, window: baselineWindow }),
  ]);

  return { current, baseline, windowBaseline: baselineWindow };
}

export function compareMetrics(current: MetricSnapshot, baseline: MetricSnapshot): MetricComparison {
  return {
    window_current: current.window,
    window_baseline: baseline.window,
    metrics: {
      tickets_completed: asDelta('tickets_completed', current.tickets_completed, baseline.tickets_completed),
      tickets_regressed: asDelta('tickets_regressed', current.tickets_regressed, baseline.tickets_regressed),
      regression_rate: asDelta('regression_rate', current.regression_rate, baseline.regression_rate),
      prs_opened: asDelta('prs_opened', current.prs_opened, baseline.prs_opened),
      prs_merged: asDelta('prs_merged', current.prs_merged, baseline.prs_merged),
      repos_touched: asDelta('repos_touched', current.repos_touched, baseline.repos_touched),
    },
    repo_distribution: {
      current: current.repo_distribution,
      baseline: baseline.repo_distribution,
    },
    domain_distribution: {
      current: current.domain_distribution,
      baseline: baseline.domain_distribution,
    },
  };
}

export async function computeAndCompareMetrics(
  params: ComputeMetricsInput & {
    supabase: SupabaseClient;
    windowBaseline?: MetricWindow;
    timeZone?: string;
  }
): Promise<{ current: MetricSnapshot; baseline: MetricSnapshot; comparison: MetricComparison }> {
  const { supabase, userId, sourceIds, window, windowBaseline, timeZone } = params;
  const pair = await computeCurrentAndBaselineMetrics({
    supabase,
    userId,
    sourceIds,
    windowCurrent: window,
    windowBaseline,
    timeZone,
  });

  return {
    current: pair.current,
    baseline: pair.baseline,
    comparison: compareMetrics(pair.current, pair.baseline),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function toRobustStat(values: number[], sigmaFloor: number): RobustBaselineStat {
  if (values.length === 0) {
    return {
      median: 0,
      mad: 0,
      sigma: Math.max(0.0001, sigmaFloor),
      sample_size: 0,
    };
  }
  const center = median(values);
  const absDeviations = values.map((value) => Math.abs(value - center));
  const mad = median(absDeviations);
  const sigma = Math.max(mad * ROBUST_Z_SCALE, sigmaFloor, 0.0001);
  return {
    median: center,
    mad,
    sigma,
    sample_size: values.length,
  };
}

function topShare(distribution: Record<string, number>): number {
  let max = 0;
  for (const value of Object.values(distribution || {})) {
    if (value > max) max = value;
  }
  return max;
}

function buildHistoricalWindows(params: {
  currentWindow: MetricWindow;
  timeZone: string;
  count: number;
}): MetricWindow[] {
  const windows: MetricWindow[] = [];
  let cursor = params.currentWindow;
  for (let i = 0; i < params.count; i += 1) {
    const previous = computeBaselineWindowForTimeZone(cursor, params.timeZone);
    windows.push(previous);
    cursor = previous;
  }
  return windows;
}

export async function computeRobustSignalBaseline(params: {
  supabase: SupabaseClient;
  userId: string;
  sourceIds: string[];
  currentWindow: MetricWindow;
  timeZone?: string;
  historyWindowCount?: number;
}): Promise<RobustSignalBaseline> {
  const {
    supabase,
    userId,
    sourceIds,
    currentWindow,
    timeZone,
    historyWindowCount = DEFAULT_ROBUST_HISTORY_WINDOWS,
  } = params;
  const normalizedTimeZone = timeZone || DEFAULT_SIGNAL_TIME_ZONE;
  const count = Math.max(1, Math.floor(historyWindowCount));
  const historyWindows = buildHistoricalWindows({
    currentWindow,
    timeZone: normalizedTimeZone,
    count,
  });

  const snapshots = await Promise.all(
    historyWindows.map((window) =>
      computeMetrics({
        supabase,
        userId,
        sourceIds,
        window,
      })
    )
  );

  const ticketsCompletedSeries = snapshots.map((snapshot) => snapshot.tickets_completed);
  const ticketsRegressedSeries = snapshots.map((snapshot) => snapshot.tickets_regressed);
  const regressionRateSeries = snapshots.map((snapshot) => snapshot.regression_rate);
  const prsMergedSeries = snapshots.map((snapshot) => snapshot.prs_merged);
  const repoTopShareSeries = snapshots.map((snapshot) => topShare(snapshot.repo_distribution));
  const domainTopShareSeries = snapshots.map((snapshot) => topShare(snapshot.domain_distribution));

  const baselineWindow = {
    start: historyWindows[historyWindows.length - 1]?.start || currentWindow.start,
    end: historyWindows[0]?.end || currentWindow.end,
  };

  return {
    window_baseline: baselineWindow,
    history_windows: historyWindows,
    metrics: {
      tickets_completed: toRobustStat(ticketsCompletedSeries, 1),
      tickets_regressed: toRobustStat(ticketsRegressedSeries, 1),
      regression_rate: toRobustStat(regressionRateSeries, 0.02),
      prs_merged: toRobustStat(prsMergedSeries, 1),
    },
    repo_top_share: toRobustStat(repoTopShareSeries, 0.02),
    domain_top_share: toRobustStat(domainTopShareSeries, 0.02),
  };
}
