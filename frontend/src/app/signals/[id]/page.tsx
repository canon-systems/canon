import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { DateTime } from 'luxon';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getSignalInvestigation } from '@/lib/server/signals/engine';
import { getWorkspaceSignalSettings } from '@/lib/server/signals/settings';
import { normalizeTimeZone, parseTimeZoneParam } from '@/lib/server/signals/window';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MetricLabelTooltip } from '@/components/metric-label-tooltip';
import { structuralSentenceForDisplay } from '../signal-card-helpers';
import EvidenceCards from './evidence-cards';

export const dynamic = 'force-dynamic';
const TIME_ZONE_COOKIE = 'canon_tz';

function pct(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  const abs = Math.abs(value);
  if (abs >= 100) return `${value.toFixed(0)}%`;
  if (abs >= 10) return `${value.toFixed(1)}%`;
  return `${value.toFixed(2)}%`;
}

function points(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs >= 100) return `${value.toFixed(0)}`;
  if (abs >= 10) return `${value.toFixed(1)}`;
  return `${value.toFixed(2)}`;
}

function signed(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function formatDay(value: string, timeZone: string): string {
  const parsed = DateTime.fromISO(value, { zone: 'utc' }).setZone(timeZone);
  if (!parsed.isValid) return value;
  return parsed.toFormat('MMM d, yyyy');
}

function formatRange(start: string, end: string, timeZone: string): string {
  const startLabel = formatDay(start, timeZone);
  const endLabel = formatDay(end, timeZone);
  if (startLabel === endLabel) return startLabel;
  return `${startLabel} to ${endLabel}`;
}

function isRateMetric(metricKey: string): boolean {
  return metricKey === 'regression_rate' || metricKey.includes('distribution');
}

function formatMetricValue(metricKey: string, value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (isRateMetric(metricKey)) return pct(value * 100);
  return `${value}`;
}

function formatDeltaVsReference(metricKey: string, value: number, referenceValue: number, label: string): string {
  const delta = value - referenceValue;
  if (isRateMetric(metricKey)) {
    const pointsDelta = delta * 100;
    const signedDelta = pointsDelta > 0 ? `+${points(pointsDelta)}` : points(pointsDelta);
    return `${signedDelta} pts vs ${label}`;
  }
  const percentDelta =
    referenceValue === 0
      ? value === 0
        ? 0
        : 100
      : ((value - referenceValue) / Math.abs(referenceValue)) * 100;
  return `${percentDelta > 0 ? '+' : ''}${pct(percentDelta)} vs ${label}`;
}

function formatStepDelta(metricKey: string, value: number, previousValue: number): string {
  const delta = value - previousValue;
  if (isRateMetric(metricKey)) {
    const pointsDelta = delta * 100;
    const signedDelta = pointsDelta > 0 ? `+${points(pointsDelta)}` : points(pointsDelta);
    return `${signedDelta} pts vs prior window`;
  }
  const percentDelta =
    previousValue === 0
      ? value === 0
        ? 0
        : 100
      : ((value - previousValue) / Math.abs(previousValue)) * 100;
  return `${percentDelta > 0 ? '+' : ''}${pct(percentDelta)} vs prior window`;
}

function formatChangeVsBaseline(signal: {
  metric_key: string;
  current_value: number;
  baseline_value: number;
  absolute_change: number;
  percent_change: number;
}): string {
  if (isRateMetric(signal.metric_key)) {
    const deltaPoints = signal.absolute_change * 100;
    if (signal.baseline_value === 0 && signal.current_value > 0) {
      return `${deltaPoints > 0 ? '+' : ''}${points(deltaPoints)} pts (new from 0%)`;
    }
    return `${deltaPoints > 0 ? '+' : ''}${points(deltaPoints)} pts`;
  }
  return pct(signal.percent_change);
}

function metricReadableName(metricKey: string): string {
  switch (metricKey) {
    case 'tickets_completed':
      return 'completed tickets';
    case 'tickets_regressed':
      return 'regressed tickets';
    case 'prs_merged':
      return 'merged pull requests';
    case 'prs_opened':
      return 'opened pull requests';
    case 'commits_default':
      return 'commits';
    case 'repos_touched':
      return 'active surfaces';
    case 'regression_rate':
      return 'regression rate';
    case 'domain_distribution':
      return 'domain concentration';
    default:
      return 'this metric';
  }
}

function metricDisplayLabel(metricKey: string): string {
  switch (metricKey) {
    case 'tickets_completed':
      return 'Completed Tickets';
    case 'tickets_regressed':
      return 'Regressed Tickets';
    case 'prs_merged':
      return 'Merged Pull Requests';
    case 'prs_opened':
      return 'Opened Pull Requests';
    case 'commits_default':
      return 'Commits';
    case 'repos_touched':
      return 'Active Surfaces';
    case 'regression_rate':
      return 'Regression Rate';
    case 'domain_distribution':
      return 'Domain Concentration';
    case 'repo_distribution':
      return 'Repository Concentration';
    default: {
      const label = metricKey.replace(/_/g, ' ').trim();
      if (!label) return 'Metric';
      return label.replace(/\b\w/g, (char) => char.toUpperCase());
    }
  }
}

function changeVsBaselineTooltip(metricKey: string): string {
  return `How much ${metricReadableName(metricKey)} changed from the onset window. Positive means up, negative means down.`;
}

function metricTooltip(metricKey: string): string {
  switch (metricKey) {
    case 'tickets_completed':
      return 'Number of tickets completed in this period. Higher usually means more output.';
    case 'tickets_regressed':
      return 'Number of tickets that moved from Done to Undone. Lower is better.';
    case 'prs_merged':
      return 'Number of pull requests merged in this period.';
    case 'prs_opened':
      return 'Number of pull requests opened in this period.';
    case 'commits_default':
      return 'Number of commits to the default branch in this period.';
    case 'repos_touched':
      return 'Number of surfaces with activity in this period.';
    case 'regression_rate':
      return 'Percent of ticket movement that regressed ((regressed / (completed + regressed)) * 100). Lower is better.';
    case 'domain_distribution':
      return 'How concentrated activity is in one domain compared to onset.';
    default:
      return 'This metric compared with the onset window.';
  }
}

function severityBadgeClass(severity: string): string {
  if (severity === 'significant') {
    return 'border-red-400/40 bg-red-500/12 text-red-100';
  }
  return 'border-yellow-400/40 bg-yellow-500/12 text-yellow-100';
}

function riskBadgeClass(posture: string): string {
  if (posture === 'critical') return 'border-red-300/45 bg-red-500/15 text-red-100';
  if (posture === 'high') return 'border-orange-300/45 bg-orange-500/15 text-orange-100';
  if (posture === 'elevated') return 'border-yellow-300/45 bg-yellow-500/15 text-yellow-100';
  return 'border-emerald-300/45 bg-emerald-500/15 text-emerald-100';
}

function postureLabel(posture: string): string {
  if (posture === 'critical') return 'Urgent';
  if (posture === 'high') return 'Attention';
  if (posture === 'elevated') return 'Watch';
  if (posture === 'low') return 'Stable';
  return posture;
}

function signalCategory(signalType: string): { label: string; description: string } {
  if (signalType === 'regression_spike') {
    return { label: 'Quality Drift', description: 'Stability and regression movement.' };
  }
  if (signalType === 'throughput_drop' || signalType === 'merge_drop') {
    return { label: 'Delivery Drift', description: 'Throughput and integration movement.' };
  }
  if (signalType === 'repo_concentration' || signalType === 'domain_concentration') {
    return { label: 'Focus Drift', description: 'Execution concentration and allocation movement.' };
  }
  return { label: 'Execution Drift', description: 'Detected structural movement.' };
}

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignalInvestigatePage(props: PageProps) {
  const [{ id }, query] = await Promise.all([props.params, props.searchParams]);
  const { session, user } = await getSession();
  if (!session || !user) {
    redirect('/login');
  }

  const requestedTimeZone = typeof query.tz === 'string' ? parseTimeZoneParam(query.tz) : null;
  const cookieStore = await cookies();
  const cookieTimeZone = parseTimeZoneParam(cookieStore.get(TIME_ZONE_COOKIE)?.value);
  const supabase = await createClient();
  const settings = await getWorkspaceSignalSettings({ supabase, userId: user.id });
  const settingsTimeZone = parseTimeZoneParam(settings.time_zone);
  const timeZone = normalizeTimeZone(requestedTimeZone || cookieTimeZone || settingsTimeZone);
  const payload = await getSignalInvestigation({
    supabase,
    userId: user.id,
    signalId: id,
  });

  if (!payload.signal) {
    notFound();
  }

  const { signal, evidence } = payload;
  const structuralDisplay = structuralSentenceForDisplay(payload.structural_sentence);
  const category = signalCategory(signal.type);
  const trendHistory = (payload.structural?.persistence?.metric_history || []).filter((entry) => !entry.is_baseline);
  const onsetValue = trendHistory[0]?.value ?? signal.current_value;
  const direction = payload.direction || {
    headline: 'Directional data is still being prepared for this signal.',
    summary: '',
    movement: null,
    focus: { repos_added: [], repos_removed: [] },
    source_mix: { has_jira: false, has_github: false },
    source_shifts: [],
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-white">Signal Briefing</h1>
          <p className="text-xs text-white/50">{category.label} · {category.description}</p>
          <div className="flex items-center gap-2">
            <p className="text-sm text-white/70">{signal.title}</p>
            <Badge variant="outline" className="border-white/20 bg-white/5 text-white/80">
              {category.label}
            </Badge>
            {payload.structural?.risk?.posture ? (
              <Badge variant="outline" className={riskBadgeClass(payload.structural.risk.posture)}>
                {postureLabel(String(payload.structural.risk.posture))}
              </Badge>
            ) : (
              <Badge variant="outline" className={severityBadgeClass(signal.severity)}>
                {signal.severity === 'significant' ? 'Significant' : 'Elevated'}
              </Badge>
            )}
          </div>
        </div>
        <Button asChild variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
          <Link href="/signals">Back to Signals</Link>
        </Button>
      </div>

      <Card className="border-white/10 bg-zinc-900">
        <CardContent className="space-y-4 pt-6 text-sm text-white/80">
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">Signal Overview + Execution Trend</p>
          {structuralDisplay ? (
            <div className="rounded border border-white/10 bg-zinc-900/70 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.14em] text-white/50">Pattern</p>
              <p className="mt-1 text-sm text-white/75">{structuralDisplay}</p>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2">
            <div className="rounded border border-white/10 bg-zinc-900/70 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.14em] text-white/50">
                <MetricLabelTooltip label="Metric" tip="Main metric this signal is tracking." />
              </p>
              <p className="mt-1 text-xs text-white">{metricDisplayLabel(signal.metric_key)}</p>
            </div>
            <div className="rounded border border-white/10 bg-zinc-900/70 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.14em] text-white/50">
                <MetricLabelTooltip label="Change vs onset" tip={changeVsBaselineTooltip(signal.metric_key)} />
              </p>
              <p className="mt-1 text-xs text-white">{formatChangeVsBaseline(signal)}</p>
            </div>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">Directional Evidence</p>
          <div className="grid gap-2 md:grid-cols-2">
            {direction.movement && direction.source_mix.has_jira ? (
              <div className="rounded border border-white/10 bg-zinc-900/70 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                  <MetricLabelTooltip label="Completed Work" tip={metricTooltip('tickets_completed')} />
                </p>
                <p className="text-white">
                  {direction.movement.tickets_completed.current} vs {direction.movement.tickets_completed.baseline} reference ({signed(direction.movement.tickets_completed.delta)})
                </p>
              </div>
            ) : null}
            {direction.movement && direction.source_mix.has_jira ? (
              <div className="rounded border border-white/10 bg-zinc-900/70 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                  <MetricLabelTooltip label="Regressions" tip={metricTooltip('tickets_regressed')} />
                </p>
                <p className="text-white">
                  {direction.movement.tickets_regressed.current} vs {direction.movement.tickets_regressed.baseline} reference ({signed(direction.movement.tickets_regressed.delta)})
                </p>
              </div>
            ) : null}
            {direction.movement && direction.source_mix.has_github ? (
              <div className="rounded border border-white/10 bg-zinc-900/70 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                  <MetricLabelTooltip label="Merged PRs" tip={metricTooltip('prs_merged')} />
                </p>
                <p className="text-white">
                  {direction.movement.prs_merged.current} vs {direction.movement.prs_merged.baseline} reference ({signed(direction.movement.prs_merged.delta)})
                </p>
              </div>
            ) : null}
            {direction.movement ? (
              <div className="rounded border border-white/10 bg-zinc-900/70 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                  <MetricLabelTooltip label="Surface Breadth" tip={metricTooltip('repos_touched')} />
                </p>
                <p className="text-white">
                  {direction.movement.repos_touched.current} vs {direction.movement.repos_touched.baseline} reference ({signed(direction.movement.repos_touched.delta)})
                </p>
              </div>
            ) : null}
            <div className="rounded border border-white/10 bg-zinc-900/70 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                <MetricLabelTooltip
                  label="Newly Active Surfaces"
                  tip="Surfaces that had activity now but had none in the reference window."
                />
              </p>
              {direction.focus.repos_added.length === 0 ? (
                <p className="text-white/70">None</p>
              ) : (
                <div className="space-y-1">
                  {direction.focus.repos_added.map((repo) => (
                    <p key={repo} className="text-white">{repo}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded border border-white/10 bg-zinc-900/70 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                <MetricLabelTooltip
                  label="Reduced Surfaces"
                  tip="Surfaces that had activity in the reference window but not in this period."
                />
              </p>
              {direction.focus.repos_removed.length === 0 ? (
                <p className="text-white/70">None</p>
              ) : (
                <div className="space-y-1">
                  {direction.focus.repos_removed.map((repo) => (
                    <p key={repo} className="text-white">{repo}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-white/50">Top Directional Movers</p>
            {direction.source_shifts.length === 0 ? (
              <p className="text-white/70">No source-level directional change detected.</p>
            ) : (
              direction.source_shifts.map((source) => (
                <div key={source.source_id} className="rounded border border-white/10 bg-zinc-900/70 px-3 py-2">
                  <p className="font-medium text-white">{source.source_name}</p>
                  <p className="text-xs text-white/60">{source.provider}</p>
                  <div className="mt-1 grid gap-1 text-xs text-white/75">
                    {source.metrics.map((metric) => (
                      <p key={`${source.source_id}-${metric.key}`}>
                        <MetricLabelTooltip label={metric.label} tip={metricTooltip(metric.key)} />:{' '}
                        {metric.current} vs {metric.baseline} reference ({signed(metric.delta)})
                      </p>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          {trendHistory.length > 1 ? (
            <div className="rounded border border-white/10 bg-zinc-900/70 px-3 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-white/50">Metric Progression by Window</p>
              <div className="mt-3 space-y-2">
                {trendHistory.map((entry, index) => {
                  const priorValue = index > 0 ? trendHistory[index - 1]?.value ?? onsetValue : onsetValue;
                  const timelineLabel =
                    index === 0 ? 'Onset Window' : index === trendHistory.length - 1 ? 'Latest Window' : `Window ${index}`;
                  return (
                    <div
                      key={`${entry.label}-${entry.window_start || ''}`}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded border border-white/10 bg-zinc-800/50 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-white">{timelineLabel}</span>
                        {entry.window_start && entry.window_end ? (
                          <span className="ml-1.5 text-white/60">{formatRange(entry.window_start, entry.window_end, timeZone)}</span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-baseline gap-3">
                        <span className="text-white">{formatMetricValue(signal.metric_key, entry.value)}</span>
                        {index === 0 ? (
                          <span className="text-white/60">Starting point</span>
                        ) : (
                          <>
                            <span className="text-white/60">{formatDeltaVsReference(signal.metric_key, entry.value, onsetValue, 'onset')}</span>
                            <span className="text-white/50">{formatStepDelta(signal.metric_key, entry.value, priorValue)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-white/60">
              Window progression appears once enough comparable windows are available.
            </p>
          )}
        </CardContent>
      </Card>

      <EvidenceCards evidence={evidence} timeZone={timeZone} />
    </div>
  );
}
