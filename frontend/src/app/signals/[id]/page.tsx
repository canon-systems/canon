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

function formatChangeVsBaseline(signal: {
  metric_key: string;
  current_value: number;
  baseline_value: number;
  absolute_change: number;
  percent_change: number;
}): string {
  if (isRateMetric(signal.metric_key)) {
    const deltaPoints = signal.absolute_change * 100;
    const sign = deltaPoints > 0 ? '+' : '';
    if (signal.baseline_value === 0 && signal.current_value > 0) {
      return `${sign}${pct(deltaPoints)} pts (new from 0%)`;
    }
    return `${sign}${pct(deltaPoints)} pts`;
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

function changeVsBaselineTooltip(metricKey: string): string {
  return `How much ${metricReadableName(metricKey)} changed from your baseline period. Positive means up, negative means down.`;
}

function metricTooltip(metricKey: string): string {
  switch (metricKey) {
    case 'tickets_completed':
      return 'Number of tickets completed in this period. Higher usually means more output.';
    case 'tickets_regressed':
      return 'Number of tickets that moved backward in status. Lower is better.';
    case 'prs_merged':
      return 'Number of pull requests merged in this period.';
    case 'prs_opened':
      return 'Number of pull requests opened in this period.';
    case 'commits_default':
      return 'Number of commits to the default branch in this period.';
    case 'repos_touched':
      return 'Number of repositories with activity in this period.';
    case 'regression_rate':
      return 'Percent of completed tickets that regressed. Lower is better.';
    case 'domain_distribution':
      return 'How concentrated activity is in one domain compared to baseline.';
    default:
      return 'This metric compared with your baseline period.';
  }
}

function severityBadgeClass(severity: string): string {
  if (severity === 'significant') {
    return 'border-red-400/40 bg-red-500/12 text-red-100';
  }
  return 'border-yellow-400/40 bg-yellow-500/12 text-yellow-100';
}

function scopeBadgeLabel(scopeType: string, scopeId?: string | null): string {
  if (scopeType === 'repo' && scopeId) return `Affected source: ${scopeId}`;
  if (scopeType === 'ticketing') return `Affected source: ${scopeId || 'Ticketing workspace'}`;
  return 'Affected source: All connected sources';
}

export default async function SignalInvestigatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session, user } = await getSession();
  if (!session || !user) {
    redirect('/login');
  }

  const query = await searchParams;
  const requestedTimeZone = typeof query.tz === 'string' ? parseTimeZoneParam(query.tz) : null;
  const cookieStore = await cookies();
  const cookieTimeZone = parseTimeZoneParam(cookieStore.get(TIME_ZONE_COOKIE)?.value);

  const { id } = await params;
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-white">Signal Briefing</h1>
          <div className="flex items-center gap-2">
            <p className="text-sm text-white/70">{signal.title}</p>
            <Badge variant="outline" className={severityBadgeClass(signal.severity)}>
              {signal.severity === 'significant' ? 'Significant' : 'Elevated'}
            </Badge>
            <Badge variant="outline" className="border-white/20 bg-white/5 text-white/75">
              {scopeBadgeLabel(signal.scope_type, signal.scope_id)}
            </Badge>
          </div>
        </div>
        <Button asChild variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
          <Link href="/signals">Back to Signals</Link>
        </Button>
      </div>

      {payload.direction ? (
        <Card className="border-white/10 bg-zinc-900">
          <CardContent className="space-y-4 pt-6 text-sm text-white/80">
            <div className="rounded border border-white/10 bg-zinc-800 px-3 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-white/50">Baseline Context</p>
              <p className="mt-1 text-xs text-white/45">Time zone: {timeZone}</p>
              <div className="mt-2 space-y-1 text-sm">
                <p>
                  <MetricLabelTooltip
                    label="Metric"
                    tip="Main metric this signal is tracking."
                  />
                  :{' '}
                  <span className="text-white">{signal.metric_key}</span>
                </p>
                <p>
                  <MetricLabelTooltip label="Change vs baseline" tip={changeVsBaselineTooltip(signal.metric_key)} />:{' '}
                  <span className="text-white">{formatChangeVsBaseline(signal)}</span>
                </p>
                <p className="text-white/70">
                  Current: <span className="text-white">{formatMetricValue(signal.metric_key, signal.current_value)}</span>{' '}
                  · Baseline: <span className="text-white">{formatMetricValue(signal.metric_key, signal.baseline_value)}</span>
                </p>
                <p className="text-xs text-white/60">
                  Current range: {formatRange(signal.window_start, signal.window_end, timeZone)}
                </p>
                <p className="text-xs text-white/60">
                  Baseline range: {formatRange(signal.baseline_start, signal.baseline_end, timeZone)}
                </p>
              </div>
            </div>
            {payload.direction.movement ? (
              <div className="grid gap-2 md:grid-cols-2">
                {payload.direction.source_mix.has_jira ? (
                  <div className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                      <MetricLabelTooltip label="Completed Work" tip={metricTooltip('tickets_completed')} />
                    </p>
                    <p className="text-white">
                      {payload.direction.movement.tickets_completed.current} vs {payload.direction.movement.tickets_completed.baseline} ({signed(payload.direction.movement.tickets_completed.delta)})
                    </p>
                  </div>
                ) : null}
                {payload.direction.source_mix.has_jira ? (
                  <div className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                      <MetricLabelTooltip label="Regressions" tip={metricTooltip('tickets_regressed')} />
                    </p>
                    <p className="text-white">
                      {payload.direction.movement.tickets_regressed.current} vs {payload.direction.movement.tickets_regressed.baseline} ({signed(payload.direction.movement.tickets_regressed.delta)})
                    </p>
                  </div>
                ) : null}
                {payload.direction.source_mix.has_github ? (
                  <div className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                      <MetricLabelTooltip label="Merged PRs" tip={metricTooltip('prs_merged')} />
                    </p>
                    <p className="text-white">
                      {payload.direction.movement.prs_merged.current} vs {payload.direction.movement.prs_merged.baseline} ({signed(payload.direction.movement.prs_merged.delta)})
                    </p>
                  </div>
                ) : null}
                <div className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                    <MetricLabelTooltip label="Surface Breadth" tip={metricTooltip('repos_touched')} />
                  </p>
                  <p className="text-white">
                    {payload.direction.movement.repos_touched.current} vs {payload.direction.movement.repos_touched.baseline} ({signed(payload.direction.movement.repos_touched.delta)})
                  </p>
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                  <MetricLabelTooltip
                    label="Newly Active Surfaces"
                    tip="Repositories that had activity now but had none in baseline."
                  />
                </p>
                {payload.direction.focus.repos_added.length === 0 ? (
                  <p className="text-white/70">None</p>
                ) : (
                  <div className="space-y-1">
                    {payload.direction.focus.repos_added.map((repo) => (
                      <p key={repo} className="text-white">{repo}</p>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                  <MetricLabelTooltip
                    label="Reduced Surfaces"
                    tip="Repositories that had activity in baseline but not in this period."
                  />
                </p>
                {payload.direction.focus.repos_removed.length === 0 ? (
                  <p className="text-white/70">None</p>
                ) : (
                  <div className="space-y-1">
                    {payload.direction.focus.repos_removed.map((repo) => (
                      <p key={repo} className="text-white">{repo}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-white/50">Top Directional Movers</p>
              {payload.direction.source_shifts.length === 0 ? (
                <p className="text-white/70">No source-level directional change detected.</p>
              ) : (
                payload.direction.source_shifts.map((source) => (
                  <div key={source.source_id} className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
                    <p className="font-medium text-white">{source.source_name}</p>
                    <p className="text-xs text-white/60">{source.provider}</p>
                    <div className="mt-1 grid gap-1 text-xs text-white/75">
                      {source.metrics.map((metric) => (
                        <p key={`${source.source_id}-${metric.key}`}>
                          <MetricLabelTooltip label={metric.label} tip={metricTooltip(metric.key)} />:{' '}
                          {metric.current} vs {metric.baseline} ({signed(metric.delta)})
                        </p>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-white/10 bg-zinc-900">
          <CardContent className="space-y-2 pt-6 text-sm text-white/80">
            <p className="text-white/75">Directional data is still being prepared for this signal.</p>
            <p>
              <MetricLabelTooltip label="Change vs baseline" tip={changeVsBaselineTooltip(signal.metric_key)} />:{' '}
              <span className="text-white">{formatChangeVsBaseline(signal)}</span>
            </p>
            <p className="text-xs text-white/60">
              Current range: {formatRange(signal.window_start, signal.window_end, timeZone)}
            </p>
            <p className="text-xs text-white/60">
              Baseline range: {formatRange(signal.baseline_start, signal.baseline_end, timeZone)}
            </p>
          </CardContent>
        </Card>
      )}

      <EvidenceCards evidence={evidence} timeZone={timeZone} />
    </div>
  );
}
