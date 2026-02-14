import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getSignalInvestigation } from '@/lib/server/signals/engine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MetricLabelTooltip } from '@/components/metric-label-tooltip';

export const dynamic = 'force-dynamic';

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

function formatDay(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRange(start: string, end: string): string {
  const startLabel = formatDay(start);
  const endLabel = formatDay(end);
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

function baselineCoveragePercent(current: number, baseline: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return '0%';
  return pct((current / baseline) * 100);
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
    default:
      return 'this metric';
  }
}

function changeVsBaselineTooltip(metricKey: string): string {
  return `Shows how much ${metricReadableName(metricKey)} moved compared to the baseline period. Positive means it increased, negative means it decreased.`;
}

function currentLevelVsBaselineTooltip(metricKey: string): string {
  return `Shows the current level of ${metricReadableName(metricKey)} compared to the baseline level. 100% means about the same as baseline; above 100% means higher; below 100% means lower.`;
}

function metricTooltip(metricKey: string): string {
  switch (metricKey) {
    case 'tickets_completed':
      return 'Tickets completed during the current range compared with the baseline range. Higher is more throughput.';
    case 'tickets_regressed':
      return 'Tickets that moved backward in workflow during the range. Higher indicates more instability.';
    case 'prs_merged':
      return 'Pull requests merged during the range. Higher indicates stronger code integration throughput.';
    case 'prs_opened':
      return 'Pull requests opened during the range. Indicates incoming change volume.';
    case 'commits_default':
      return 'Commits on the default branch during the range. Indicates direct code movement.';
    case 'repos_touched':
      return 'Number of repositories or tracked surfaces touched during the range.';
    case 'regression_rate':
      return 'Share of completed tickets that regressed. Lower is healthier.';
    default:
      return 'Current range compared with baseline range for this metric.';
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
  if (scopeType === 'aku' && scopeId) return `Affected source: ${scopeId}`;
  return 'Affected source: All connected sources';
}

export default async function SignalInvestigatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session, user } = await getSession();
  if (!session || !user) {
    redirect('/login');
  }

  const { id } = await params;
  const supabase = await createClient();
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
        <Card className="border-white/10 bg-white/5">
          <CardContent className="space-y-4 pt-6 text-sm text-white/80">
            <div className="rounded border border-white/10 bg-black/30 px-3 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-white/50">Baseline Context</p>
              <div className="mt-2 space-y-1 text-sm">
                <p>
                  <MetricLabelTooltip
                    label="Metric"
                    tip="The primary signal metric used for this investigation."
                  />
                  :{' '}
                  <span className="text-white">{signal.metric_key}</span>
                </p>
                <p>
                  <MetricLabelTooltip label="Change vs baseline" tip={changeVsBaselineTooltip(signal.metric_key)} />:{' '}
                  <span className="text-white">{pct(signal.percent_change)}</span>
                </p>
                <p>
                  <MetricLabelTooltip label="Current level vs baseline" tip={currentLevelVsBaselineTooltip(signal.metric_key)} />:{' '}
                  <span className="text-white">{baselineCoveragePercent(signal.current_value, signal.baseline_value)}</span>
                </p>
                <p className="text-white/70">
                  Current: <span className="text-white">{formatMetricValue(signal.metric_key, signal.current_value)}</span>{' '}
                  · Baseline: <span className="text-white">{formatMetricValue(signal.metric_key, signal.baseline_value)}</span>
                </p>
                <p className="text-xs text-white/60">
                  Current range: {formatRange(signal.window_start, signal.window_end)}
                </p>
                <p className="text-xs text-white/60">
                  Baseline range: {formatRange(signal.baseline_start, signal.baseline_end)}
                </p>
              </div>
            </div>
            {payload.direction.movement ? (
              <div className="grid gap-2 md:grid-cols-2">
                {payload.direction.source_mix.has_jira ? (
                  <div className="rounded border border-white/10 bg-black/30 px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                      <MetricLabelTooltip label="Completed Work" tip={metricTooltip('tickets_completed')} />
                    </p>
                    <p className="text-white">
                      {payload.direction.movement.tickets_completed.current} vs {payload.direction.movement.tickets_completed.baseline} ({signed(payload.direction.movement.tickets_completed.delta)})
                    </p>
                  </div>
                ) : null}
                {payload.direction.source_mix.has_jira ? (
                  <div className="rounded border border-white/10 bg-black/30 px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                      <MetricLabelTooltip label="Regressions" tip={metricTooltip('tickets_regressed')} />
                    </p>
                    <p className="text-white">
                      {payload.direction.movement.tickets_regressed.current} vs {payload.direction.movement.tickets_regressed.baseline} ({signed(payload.direction.movement.tickets_regressed.delta)})
                    </p>
                  </div>
                ) : null}
                {payload.direction.source_mix.has_github ? (
                  <div className="rounded border border-white/10 bg-black/30 px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                      <MetricLabelTooltip label="Merged PRs" tip={metricTooltip('prs_merged')} />
                    </p>
                    <p className="text-white">
                      {payload.direction.movement.prs_merged.current} vs {payload.direction.movement.prs_merged.baseline} ({signed(payload.direction.movement.prs_merged.delta)})
                    </p>
                  </div>
                ) : null}
                <div className="rounded border border-white/10 bg-black/30 px-3 py-2">
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
              <div className="rounded border border-white/10 bg-black/30 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                  <MetricLabelTooltip
                    label="Newly Active Surfaces"
                    tip="Repositories or tracked execution surfaces that appeared in the current range but not in baseline."
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
              <div className="rounded border border-white/10 bg-black/30 px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                  <MetricLabelTooltip
                    label="Reduced Surfaces"
                    tip="Repositories or tracked execution surfaces that were present in baseline but not in the current range."
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
                  <div key={source.source_id} className="rounded border border-white/10 bg-black/30 px-3 py-2">
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
        <Card className="border-white/10 bg-white/5">
          <CardContent className="space-y-2 pt-6 text-sm text-white/80">
            <p className="text-white/75">Directional data is still being prepared for this signal.</p>
            <p>
              <MetricLabelTooltip label="Change vs baseline" tip={changeVsBaselineTooltip(signal.metric_key)} />:{' '}
              <span className="text-white">{pct(signal.percent_change)}</span>
            </p>
            <p>
              <MetricLabelTooltip label="Current level vs baseline" tip={currentLevelVsBaselineTooltip(signal.metric_key)} />:{' '}
              <span className="text-white">{baselineCoveragePercent(signal.current_value, signal.baseline_value)}</span>
            </p>
            <p className="text-xs text-white/60">
              Current range: {formatRange(signal.window_start, signal.window_end)}
            </p>
            <p className="text-xs text-white/60">
              Baseline range: {formatRange(signal.baseline_start, signal.baseline_end)}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-white/10 bg-black/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white">
              <MetricLabelTooltip
                label="Execution Tickets"
                tip="Ticket evidence linked to this signal window; use this to inspect delivery and quality movement."
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-white/80">
            {evidence.tickets.length === 0 ? <p>No ticket evidence in this signal window.</p> : null}
            {evidence.tickets.map((ticket) => (
              <div key={`${ticket.id}-${ticket.occurred_at}`} className="rounded border border-white/10 bg-white/5 px-3 py-2">
                <div className="font-medium text-white">{ticket.id}</div>
                <div className="text-white/70">{ticket.summary || 'No summary'}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white">
              <MetricLabelTooltip
                label="Code Integration"
                tip="PR evidence linked to this signal window; use this to inspect merge and integration behavior."
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-white/80">
            {evidence.prs.length === 0 ? <p>No PR evidence in this signal window.</p> : null}
            {evidence.prs.map((pr) => (
              <div key={`${pr.id}-${pr.occurred_at}-${pr.kind}`} className="rounded border border-white/10 bg-white/5 px-3 py-2">
                <div className="font-medium text-white">PR {pr.id}</div>
                <div className="text-white/70">{pr.repo || 'Unknown repo'} · {pr.kind || 'event'}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white">
              <MetricLabelTooltip
                label="Active Surfaces"
                tip="Repositories or engineering surfaces with meaningful activity in the current signal window."
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-white/80">
            {evidence.repos.length === 0 ? <p>No active surface evidence in this signal window.</p> : null}
            {evidence.repos.map((repo) => (
              <div key={repo.id} className="flex items-center justify-between rounded border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-white">{repo.id}</span>
                <span className="text-white/70">{repo.activity}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white">
              <MetricLabelTooltip
                label="Capability Clusters"
                tip="AKU clusters associated with this signal; these represent capability areas where activity concentrated."
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-white/80">
            {evidence.akus.length === 0 ? <p>No cluster evidence in this signal window.</p> : null}
            {evidence.akus.map((aku) => (
              <div key={aku.id} className="rounded border border-white/10 bg-white/5 px-3 py-2">
                <div className="font-medium text-white">{aku.label || aku.id}</div>
                <div className="text-xs text-white/60">{aku.id}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
