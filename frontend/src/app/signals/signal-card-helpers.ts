export type SignalRiskPosture = 'low' | 'elevated' | 'high' | 'critical' | null;

export function postureLabel(posture: SignalRiskPosture): string {
  if (posture === 'critical') return 'Urgent';
  if (posture === 'high') return 'Attention';
  if (posture === 'elevated') return 'Watch';
  if (posture === 'low') return 'Stable';
  return '';
}

export function shouldRenderMetricSummary(metricKey: string): boolean {
  return metricKey !== 'repo_distribution' && metricKey !== 'domain_distribution';
}

/** Removes execution posture from structural sentence for display (handles legacy stored text). */
export function structuralSentenceForDisplay(sentence: string | null): string | null {
  if (!sentence) return null;
  const withoutPosture = sentence.replace(/\s*Execution posture:\s*[^.]+\.?\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  return withoutPosture || null;
}
