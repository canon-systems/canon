import type { SupabaseClient } from '@supabase/supabase-js';
import { computeBaselineWindow } from '@/lib/server/diff/contracts';
import type { ComputeMetricsInput, MetricComparison, MetricDelta, MetricSnapshot, MetricWindow } from '@/lib/server/signals/types';
import { computeMetrics } from '@/lib/server/signals/metrics';

function asDelta(metricKey: string, current: number, baseline: number): MetricDelta {
  const absoluteChange = current - baseline;
  const denominator = Math.max(Math.abs(baseline), 1);
  const percentChange = (absoluteChange / denominator) * 100;

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
}): Promise<{ current: MetricSnapshot; baseline: MetricSnapshot; windowBaseline: MetricWindow }> {
  const { supabase, userId, sourceIds, windowCurrent, windowBaseline } = params;
  const baselineWindow = windowBaseline || computeBaselineWindow(windowCurrent.start, windowCurrent.end);

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
  };
}

export async function computeAndCompareMetrics(
  params: ComputeMetricsInput & {
    supabase: SupabaseClient;
    windowBaseline?: MetricWindow;
  }
): Promise<{ current: MetricSnapshot; baseline: MetricSnapshot; comparison: MetricComparison }> {
  const { supabase, userId, sourceIds, window, windowBaseline } = params;
  const pair = await computeCurrentAndBaselineMetrics({
    supabase,
    userId,
    sourceIds,
    windowCurrent: window,
    windowBaseline,
  });

  return {
    current: pair.current,
    baseline: pair.baseline,
    comparison: compareMetrics(pair.current, pair.baseline),
  };
}
