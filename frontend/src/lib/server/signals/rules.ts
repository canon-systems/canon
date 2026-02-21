import type {
  MetricComparison,
  MetricWindow,
  RobustBaselineStat,
  RobustSignalBaseline,
  SignalEvidenceRecord,
  SignalRecord,
  SignalSeverity,
  SignalType,
} from '@/lib/server/signals/types';

type SignalDraft = Omit<SignalRecord, 'id'>;
const MIN_ROBUST_SAMPLES = 4;
const ELEVATED_Z_SCORE = 2.5;
const SIGNIFICANT_Z_SCORE = 3.5;

function pct(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return `${value.toFixed(0)}%`;
  if (abs >= 10) return `${value.toFixed(1)}%`;
  return `${value.toFixed(2)}%`;
}

function points(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10) return `${value.toFixed(1)} pts`;
  return `${value.toFixed(2)} pts`;
}

function percentChange(current: number, baseline: number): number {
  const absolute = current - baseline;
  if (baseline === 0) {
    if (current === 0) return 0;
    return current > 0 ? 100 : -100;
  }
  return (absolute / Math.abs(baseline)) * 100;
}

function zScore(current: number, stats: RobustBaselineStat): number | null {
  if (stats.sample_size < MIN_ROBUST_SAMPLES) return null;
  if (!Number.isFinite(stats.sigma) || stats.sigma <= 0) return null;
  return (current - stats.median) / stats.sigma;
}

function severityFromZScore(z: number, direction: 'increase' | 'decrease'): SignalSeverity | null {
  if (direction === 'increase') {
    if (z >= SIGNIFICANT_Z_SCORE) return 'significant';
    if (z >= ELEVATED_Z_SCORE) return 'elevated';
    return null;
  }
  if (z <= -SIGNIFICANT_Z_SCORE) return 'significant';
  if (z <= -ELEVATED_Z_SCORE) return 'elevated';
  return null;
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

export function evaluateSignalRules(params: {
  comparison: MetricComparison;
  robustBaseline: RobustSignalBaseline;
  baselineWindow?: MetricWindow;
}): SignalDraft[] {
  const { comparison, robustBaseline, baselineWindow } = params;
  const out: SignalDraft[] = [];
  const { window_current, metrics } = comparison;
  const window_baseline = baselineWindow || robustBaseline.window_baseline;

  const regressionZ = zScore(metrics.regression_rate.current_value, robustBaseline.metrics.regression_rate);
  const regressionSeverity = regressionZ == null ? null : severityFromZScore(regressionZ, 'increase');
  if (regressionSeverity && regressionZ != null) {
    const baselineValue = robustBaseline.metrics.regression_rate.median;
    const absoluteChange = metrics.regression_rate.current_value - baselineValue;
    const relativeChange = percentChange(metrics.regression_rate.current_value, baselineValue);
    out.push(
      buildSignal({
        type: 'regression_spike',
        severity: regressionSeverity,
        metricKey: 'regression_rate',
        title: 'Regression rate increased',
        summary: `Regression rate is ${pct(metrics.regression_rate.current_value * 100)} vs robust median ${pct(baselineValue * 100)} (${points(absoluteChange * 100)}, z=${regressionZ.toFixed(2)}).`,
        currentValue: metrics.regression_rate.current_value,
        baselineValue,
        absoluteChange,
        percentChange: relativeChange,
        windowStart: window_current.start,
        windowEnd: window_current.end,
        baselineStart: window_baseline.start,
        baselineEnd: window_baseline.end,
        evidence: baseEvidence('regression_rate', {
          tickets_regressed_current: metrics.tickets_regressed.current_value,
          tickets_regressed_baseline_median: robustBaseline.metrics.tickets_regressed.median,
          detector: 'robust_mad_zscore',
          z_score: regressionZ,
          sample_size: robustBaseline.metrics.regression_rate.sample_size,
          mad: robustBaseline.metrics.regression_rate.mad,
          sigma: robustBaseline.metrics.regression_rate.sigma,
        }),
      })
    );
  }

  const throughputZ = zScore(metrics.tickets_completed.current_value, robustBaseline.metrics.tickets_completed);
  const throughputSeverity = throughputZ == null ? null : severityFromZScore(throughputZ, 'decrease');
  if (throughputSeverity && throughputZ != null) {
    const baselineValue = robustBaseline.metrics.tickets_completed.median;
    const absoluteChange = metrics.tickets_completed.current_value - baselineValue;
    const relativeChange = percentChange(metrics.tickets_completed.current_value, baselineValue);
    out.push(
      buildSignal({
        type: 'throughput_drop',
        severity: throughputSeverity,
        metricKey: 'tickets_completed',
        title: 'Ticket throughput dropped',
        summary: `Tickets completed are ${metrics.tickets_completed.current_value.toFixed(0)} vs robust median ${baselineValue.toFixed(0)} (z=${throughputZ.toFixed(2)}).`,
        currentValue: metrics.tickets_completed.current_value,
        baselineValue,
        absoluteChange,
        percentChange: relativeChange,
        windowStart: window_current.start,
        windowEnd: window_current.end,
        baselineStart: window_baseline.start,
        baselineEnd: window_baseline.end,
        evidence: baseEvidence('tickets_completed', {
          detector: 'robust_mad_zscore',
          z_score: throughputZ,
          sample_size: robustBaseline.metrics.tickets_completed.sample_size,
          mad: robustBaseline.metrics.tickets_completed.mad,
          sigma: robustBaseline.metrics.tickets_completed.sigma,
        }),
      })
    );
  }

  const mergeZ = zScore(metrics.prs_merged.current_value, robustBaseline.metrics.prs_merged);
  const mergeSeverity = mergeZ == null ? null : severityFromZScore(mergeZ, 'decrease');
  if (mergeSeverity && mergeZ != null) {
    const baselineValue = robustBaseline.metrics.prs_merged.median;
    const absoluteChange = metrics.prs_merged.current_value - baselineValue;
    const relativeChange = percentChange(metrics.prs_merged.current_value, baselineValue);
    out.push(
      buildSignal({
        type: 'merge_drop',
        severity: mergeSeverity,
        metricKey: 'prs_merged',
        title: 'Merge throughput dropped',
        summary: `Merged PRs are ${metrics.prs_merged.current_value.toFixed(0)} vs robust median ${baselineValue.toFixed(0)} (z=${mergeZ.toFixed(2)}).`,
        currentValue: metrics.prs_merged.current_value,
        baselineValue,
        absoluteChange,
        percentChange: relativeChange,
        windowStart: window_current.start,
        windowEnd: window_current.end,
        baselineStart: window_baseline.start,
        baselineEnd: window_baseline.end,
        evidence: baseEvidence('prs_merged', {
          detector: 'robust_mad_zscore',
          z_score: mergeZ,
          sample_size: robustBaseline.metrics.prs_merged.sample_size,
          mad: robustBaseline.metrics.prs_merged.mad,
          sigma: robustBaseline.metrics.prs_merged.sigma,
        }),
      })
    );
  }

  const topRepo = topDistributionEntry(comparison.repo_distribution.current);
  const topRepoZ = topRepo ? zScore(topRepo.share, robustBaseline.repo_top_share) : null;
  const topRepoSeverity = topRepoZ == null ? null : severityFromZScore(topRepoZ, 'increase');
  if (topRepo && topRepoSeverity && topRepoZ != null) {
    const baselineValue = robustBaseline.repo_top_share.median;
    const absoluteChange = topRepo.share - baselineValue;
    out.push(
      buildSignal({
        type: 'repo_concentration',
        severity: topRepoSeverity,
        metricKey: 'repo_distribution',
        title: 'Repository concentration detected',
        summary: `${topRepo.key} accounts for ${(topRepo.share * 100).toFixed(1)}% of GitHub activity (robust median ${(baselineValue * 100).toFixed(1)}%, z=${topRepoZ.toFixed(2)}).`,
        currentValue: topRepo.share,
        baselineValue,
        absoluteChange,
        percentChange: percentChange(topRepo.share, baselineValue),
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
            payload: {
              share: topRepo.share,
              detector: 'robust_mad_zscore',
              z_score: topRepoZ,
              sample_size: robustBaseline.repo_top_share.sample_size,
              mad: robustBaseline.repo_top_share.mad,
              sigma: robustBaseline.repo_top_share.sigma,
            },
          },
        ],
      })
    );
  }

  const topDomain = topDistributionEntry(comparison.domain_distribution.current);
  const topDomainZ = topDomain ? zScore(topDomain.share, robustBaseline.domain_top_share) : null;
  const topDomainSeverity = topDomainZ == null ? null : severityFromZScore(topDomainZ, 'increase');
  if (topDomain && topDomainSeverity && topDomainZ != null) {
    const baselineValue = robustBaseline.domain_top_share.median;
    const absoluteChange = topDomain.share - baselineValue;
    out.push(
      buildSignal({
        type: 'domain_concentration',
        severity: topDomainSeverity,
        metricKey: 'domain_distribution',
        title: 'Domain focus shifted',
        summary: `${topDomain.key} accounts for ${(topDomain.share * 100).toFixed(1)}% of weighted activity (robust median ${(baselineValue * 100).toFixed(1)}%, z=${topDomainZ.toFixed(2)}).`,
        currentValue: topDomain.share,
        baselineValue,
        absoluteChange,
        percentChange: percentChange(topDomain.share, baselineValue),
        windowStart: window_current.start,
        windowEnd: window_current.end,
        baselineStart: window_baseline.start,
        baselineEnd: window_baseline.end,
        evidence: [
          {
            evidence_type: 'metric',
            evidence_id: `domain:${topDomain.key}`,
            label: topDomain.key,
            rank: 1,
            payload: {
              domain: topDomain.key,
              current_share: topDomain.share,
              baseline_share: baselineValue,
              detector: 'robust_mad_zscore',
              z_score: topDomainZ,
              sample_size: robustBaseline.domain_top_share.sample_size,
              mad: robustBaseline.domain_top_share.mad,
              sigma: robustBaseline.domain_top_share.sigma,
            },
          },
        ],
      })
    );
  }

  return out;
}
