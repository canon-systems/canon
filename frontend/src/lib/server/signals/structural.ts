import type { RiskPosture, SignalRecord, SignalStructuralMetadata, StructuralConfidence } from '@/lib/server/signals/types';

type RiskEvaluationInput = {
  severity: SignalRecord['severity'];
  signalType: SignalRecord['type'];
  isSustained: boolean;
  zScore: number | null;
};

type DomainSeries = {
  domain: string;
  values: number[];
  currentShare: number;
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

export function confidenceFromHistory(historyWindowCount: number): StructuralConfidence {
  if (historyWindowCount < 3) return 'early';
  if (historyWindowCount <= 5) return 'building';
  return 'mature';
}

export function extractZScore(signal: Pick<SignalRecord, 'evidence'>): number | null {
  for (const evidence of signal.evidence) {
    const raw = evidence.payload?.z_score;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  }
  return null;
}

export function evaluateRiskPosture(input: RiskEvaluationInput): { posture: RiskPosture; score: number; drivers: string[] } {
  const { severity, signalType, isSustained, zScore } = input;
  const drivers: string[] = [];
  let score = severity === 'significant' ? 3 : 2;

  if (severity === 'significant') drivers.push('significant severity');
  if (severity === 'elevated') drivers.push('elevated severity');
  if (isSustained) {
    score += 2;
    drivers.push('sustained pattern');
  }

  const magnitude = zScore == null ? 0 : Math.abs(zScore);
  if (magnitude >= 4) {
    score += 2;
    drivers.push('extreme magnitude');
  } else if (magnitude >= 3) {
    score += 1;
    drivers.push('high magnitude');
  }

  if (signalType === 'regression_spike') drivers.push('quality risk direction');
  if (signalType === 'throughput_drop' || signalType === 'merge_drop') drivers.push('delivery slowdown direction');
  if (signalType === 'domain_concentration' || signalType === 'repo_concentration') drivers.push('focus concentration direction');

  let posture: RiskPosture = 'low';
  const highMagnitude = magnitude >= 3;

  if (severity === 'significant' && isSustained && highMagnitude) {
    posture = 'critical';
  } else if ((severity === 'significant' && isSustained) || (severity === 'elevated' && isSustained && highMagnitude)) {
    posture = 'high';
  } else if (severity === 'elevated' || severity === 'significant') {
    posture = 'elevated';
  }

  return { posture, score, drivers };
}

export function evaluatePersistenceFromBreaches(params: {
  breaches: boolean[];
  minimumLookback?: number;
  requiredBreaches?: number;
}): {
  lookback_windows: number;
  breach_windows: number;
  is_sustained: boolean;
  current_streak: number;
} {
  const minimumLookback = params.minimumLookback ?? 3;
  const requiredBreaches = params.requiredBreaches ?? 2;
  const breaches = params.breaches || [];
  const breachWindows = breaches.filter(Boolean).length;
  let streak = 0;
  for (const breached of breaches) {
    if (!breached) break;
    streak += 1;
  }
  return {
    lookback_windows: breaches.length,
    breach_windows: breachWindows,
    is_sustained: breaches.length >= minimumLookback && breachWindows >= requiredBreaches,
    current_streak: streak,
  };
}

export function computeDomainVolatility(params: {
  historical: Record<string, number>[];
  current: Record<string, number>;
}): SignalStructuralMetadata['volatility'] {
  const domains = new Set<string>();
  for (const item of params.historical) {
    Object.keys(item || {}).forEach((domain) => domains.add(domain));
  }
  Object.keys(params.current || {}).forEach((domain) => domains.add(domain));

  const series: DomainSeries[] = Array.from(domains).map((domain) => {
    const values = params.historical.map((distribution) => Number(distribution?.[domain] || 0));
    const currentShare = Number(params.current?.[domain] || 0);
    values.push(currentShare);
    return { domain, values, currentShare };
  });

  const scores = series
    .map((item) => {
      const std = standardDeviation(item.values);
      const avg = mean(item.values);
      const score = avg <= 0 ? std : std / Math.max(avg, 0.01);
      const firstHalf = mean(item.values.slice(0, Math.max(1, Math.floor(item.values.length / 2))));
      const secondHalf = mean(item.values.slice(Math.floor(item.values.length / 2)));
      const delta = secondHalf - firstHalf;
      const trend: 'rising' | 'flat' | 'falling' = delta > 0.03 ? 'rising' : delta < -0.03 ? 'falling' : 'flat';

      return {
        domain: item.domain,
        score,
        trend,
        current_share: item.currentShare,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const primary = Object.entries(params.current || {}).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] || null;
  return {
    primary_domain: primary,
    domain_scores: scores,
  };
}

export function buildStructuralSentence(params: {
  signal: Pick<SignalRecord, 'type' | 'title' | 'severity'>;
  structural: SignalStructuralMetadata;
}): string {
  const persistence = params.structural.persistence;
  const volatility = params.structural.volatility;
  const confidence = params.structural.confidence || 'early';

  const parts: string[] = [];
  if (persistence) {
    parts.push(
      persistence.is_sustained
        ? `This pattern has repeated in ${persistence.breach_windows} of the last ${persistence.lookback_windows} windows.`
        : `This appears in ${persistence.breach_windows} of the last ${persistence.lookback_windows} windows so far.`
    );
  }
  const trend = params.structural.trend;
  if (trend) {
    const directionLabel =
      trend.dominant_direction === 'increase'
        ? 'increasing'
        : trend.dominant_direction === 'decrease'
          ? 'decreasing'
          : trend.dominant_direction === 'mixed'
            ? 'mixed'
            : 'flat';
    const consistencyPct = Math.round(trend.consistency_ratio * 100);
    if (trend.is_consistent) {
      parts.push(`Trend is ${directionLabel} with ${consistencyPct}% directional consistency from onset.`);
    } else if (trend.is_mixed) {
      parts.push(`Trend shows mixed movement (${consistencyPct}% directional consistency), monitor closely.`);
    } else {
      parts.push(`Trend is not yet consistent (${consistencyPct}% directional consistency).`);
    }
  }
  const topDomain = volatility?.domain_scores?.[0];
  if (topDomain && confidence !== 'early' && topDomain.score >= 0.45) {
    parts.push(
      `${topDomain.domain} activity is showing higher-than-usual variation (${topDomain.trend}).`
    );
  }
  if (topDomain && topDomain.current_share >= 0.65) {
    parts.push(`${topDomain.domain} is currently taking ${(topDomain.current_share * 100).toFixed(1)}% of execution focus.`);
  }

  if (parts.length === 0) {
    parts.push(`${params.signal.title}.`);
  }

  return parts.join(' ');
}
