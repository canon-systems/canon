import type { MetricComparison, SignalEvidenceRecord, SignalRecord, SignalSeverity, SignalType } from '@/lib/server/signals/types';

type SignalDraft = Omit<SignalRecord, 'id'>;

function severityFromChange(params: {
  percentChange: number;
  elevatedWhen: (value: number) => boolean;
  significantWhen: (value: number) => boolean;
}): SignalSeverity | null {
  const { percentChange, elevatedWhen, significantWhen } = params;
  if (!elevatedWhen(percentChange)) return null;
  if (significantWhen(percentChange)) return 'significant';
  return 'elevated';
}

function pct(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return `${value.toFixed(0)}%`;
  if (abs >= 10) return `${value.toFixed(1)}%`;
  return `${value.toFixed(2)}%`;
}

function ratio(value: number): string {
  if (!Number.isFinite(value)) return '0x';
  return `${value.toFixed(1)}x`;
}

function topDistributionEntry(distribution: Record<string, number>): { key: string; share: number } | null {
  let best: { key: string; share: number } | null = null;
  for (const [key, share] of Object.entries(distribution || {})) {
    if (!best || share > best.share) {
      best = { key, share };
    }
  }
  return best;
}

function baseEvidence(metricKey: string, detail: Record<string, unknown> = {}): SignalEvidenceRecord[] {
  return [
    {
      evidence_type: 'metric',
      evidence_id: metricKey,
      label: metricKey,
      rank: 1,
      payload: detail,
    },
  ];
}

function buildSignal(params: {
  type: SignalType;
  severity: SignalSeverity;
  metricKey: string;
  title: string;
  summary: string;
  currentValue: number;
  baselineValue: number;
  absoluteChange: number;
  percentChange: number;
  windowStart: string;
  windowEnd: string;
  baselineStart: string;
  baselineEnd: string;
  scopeType?: 'global' | 'repo';
  scopeId?: string | null;
  evidence?: SignalEvidenceRecord[];
  metadata?: Record<string, unknown>;
}): SignalDraft {
  return {
    type: params.type,
    severity: params.severity,
    scope_type: params.scopeType || 'global',
    scope_id: params.scopeId ?? null,
    metric_key: params.metricKey,
    window_start: params.windowStart,
    window_end: params.windowEnd,
    baseline_start: params.baselineStart,
    baseline_end: params.baselineEnd,
    current_value: params.currentValue,
    baseline_value: params.baselineValue,
    absolute_change: params.absoluteChange,
    percent_change: params.percentChange,
    title: params.title,
    summary_line: params.summary,
    metadata: params.metadata || {},
    evidence: params.evidence || [],
  };
}

export function evaluateSignalRules(comparison: MetricComparison): SignalDraft[] {
  const out: SignalDraft[] = [];
  const { window_current, window_baseline, metrics } = comparison;

  const regressionSeverity = severityFromChange({
    percentChange: metrics.regression_rate.percent_change,
    elevatedWhen: (value) => value >= 50,
    significantWhen: (value) => value >= 100,
  });
  if (regressionSeverity) {
    out.push(
      buildSignal({
        type: 'regression_spike',
        severity: regressionSeverity,
        metricKey: 'regression_rate',
        title: 'Regression rate increased',
        summary: `Regression rate is ${ratio(metrics.regression_rate.current_value / Math.max(metrics.regression_rate.baseline_value, 0.0001))} vs baseline (${pct(metrics.regression_rate.percent_change)}).`,
        currentValue: metrics.regression_rate.current_value,
        baselineValue: metrics.regression_rate.baseline_value,
        absoluteChange: metrics.regression_rate.absolute_change,
        percentChange: metrics.regression_rate.percent_change,
        windowStart: window_current.start,
        windowEnd: window_current.end,
        baselineStart: window_baseline.start,
        baselineEnd: window_baseline.end,
        evidence: baseEvidence('regression_rate', {
          tickets_regressed_current: metrics.tickets_regressed.current_value,
          tickets_regressed_baseline: metrics.tickets_regressed.baseline_value,
        }),
      })
    );
  }

  const throughputSeverity = severityFromChange({
    percentChange: metrics.tickets_completed.percent_change,
    elevatedWhen: (value) => value <= -30,
    significantWhen: (value) => value <= -50,
  });
  if (throughputSeverity) {
    out.push(
      buildSignal({
        type: 'throughput_drop',
        severity: throughputSeverity,
        metricKey: 'tickets_completed',
        title: 'Ticket throughput dropped',
        summary: `Tickets completed changed by ${pct(metrics.tickets_completed.percent_change)} vs baseline.`,
        currentValue: metrics.tickets_completed.current_value,
        baselineValue: metrics.tickets_completed.baseline_value,
        absoluteChange: metrics.tickets_completed.absolute_change,
        percentChange: metrics.tickets_completed.percent_change,
        windowStart: window_current.start,
        windowEnd: window_current.end,
        baselineStart: window_baseline.start,
        baselineEnd: window_baseline.end,
        evidence: baseEvidence('tickets_completed'),
      })
    );
  }

  const mergeSeverity = severityFromChange({
    percentChange: metrics.prs_merged.percent_change,
    elevatedWhen: (value) => value <= -30,
    significantWhen: (value) => value <= -50,
  });
  if (mergeSeverity) {
    out.push(
      buildSignal({
        type: 'merge_drop',
        severity: mergeSeverity,
        metricKey: 'prs_merged',
        title: 'Merge throughput dropped',
        summary: `PR merges changed by ${pct(metrics.prs_merged.percent_change)} vs baseline.`,
        currentValue: metrics.prs_merged.current_value,
        baselineValue: metrics.prs_merged.baseline_value,
        absoluteChange: metrics.prs_merged.absolute_change,
        percentChange: metrics.prs_merged.percent_change,
        windowStart: window_current.start,
        windowEnd: window_current.end,
        baselineStart: window_baseline.start,
        baselineEnd: window_baseline.end,
        evidence: baseEvidence('prs_merged'),
      })
    );
  }

  const topRepo = topDistributionEntry(comparison.repo_distribution.current);
  if (topRepo && topRepo.share > 0.6) {
    const severity: SignalSeverity = topRepo.share > 0.75 ? 'significant' : 'elevated';
    out.push(
      buildSignal({
        type: 'repo_concentration',
        severity,
        metricKey: 'repo_distribution',
        title: 'Repository concentration detected',
        summary: `${topRepo.key} accounts for ${(topRepo.share * 100).toFixed(1)}% of GitHub activity.`,
        currentValue: topRepo.share,
        baselineValue: comparison.repo_distribution.baseline[topRepo.key] || 0,
        absoluteChange: topRepo.share - (comparison.repo_distribution.baseline[topRepo.key] || 0),
        percentChange:
          ((topRepo.share - (comparison.repo_distribution.baseline[topRepo.key] || 0)) /
            Math.max(Math.abs(comparison.repo_distribution.baseline[topRepo.key] || 0), 0.0001)) *
          100,
        windowStart: window_current.start,
        windowEnd: window_current.end,
        baselineStart: window_baseline.start,
        baselineEnd: window_baseline.end,
        scopeType: 'repo',
        scopeId: topRepo.key,
        evidence: [
          {
            evidence_type: 'repo',
            evidence_id: topRepo.key,
            label: topRepo.key,
            rank: 1,
            payload: { share: topRepo.share },
          },
        ],
      })
    );
  }

  return out;
}
