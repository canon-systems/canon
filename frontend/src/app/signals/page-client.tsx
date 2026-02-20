'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type SignalCard = {
  id: string;
  created_at: string | null;
  title: string;
  summary_line: string;
  severity: 'elevated' | 'significant';
  scope: { type: 'global' | 'repo' | 'ticketing'; id: string | null };
  primary_source_id?: string | null;
  scope_label_override?: string | null;
  metric_key: string;
  current_value: number;
  baseline_value: number;
  percent_change: number;
  feature_top?: Array<{ key: string; name: string; share: number }>;
  window_start: string;
  window_end: string;
};

function severityLabel(severity: SignalCard['severity']): string {
  return severity === 'significant' ? 'Significant' : 'Elevated';
}

function severityClass(severity: SignalCard['severity']): string {
  if (severity === 'significant') return 'border-red-400/40 bg-red-500/10 text-red-100';
  return 'border-yellow-400/40 bg-yellow-500/10 text-yellow-100';
}

function scopeLabel(signal: SignalCard): string {
  if (signal.scope_label_override) return signal.scope_label_override;
  if (signal.scope.type === 'ticketing') return signal.scope.id || 'Source unavailable';
  if (signal.scope.type === 'repo' && signal.scope.id) return signal.scope.id;
  if (signal.scope.type === 'global') return 'Source unavailable';
  return 'Source unavailable';
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const iso = date.toISOString();
  return iso.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function formatDateOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().slice(0, 10)} UTC`;
}

function formatSignedPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
  return `${value > 0 ? '+' : ''}${formatted}%`;
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('en-US');
}

function formatPercentValue(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  const abs = Math.abs(normalized);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${normalized.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}%`;
}

function metricLabel(metricKey: string): string {
  if (metricKey === 'regression_rate') return 'Regression rate';
  if (metricKey === 'tickets_completed') return 'Tickets completed';
  if (metricKey === 'tickets_regressed') return 'Tickets regressed';
  if (metricKey === 'prs_opened') return 'PRs opened';
  if (metricKey === 'prs_merged') return 'PRs merged';
  if (metricKey === 'repos_touched') return 'Repos touched';
  if (metricKey === 'repo_distribution') return 'Repo concentration';
  if (metricKey === 'feature_distribution') return 'Feature concentration';
  return metricKey.replace(/_/g, ' ');
}

function metricValue(metricKey: string, value: number): string {
  if (metricKey === 'regression_rate' || metricKey === 'repo_distribution' || metricKey === 'feature_distribution') {
    return formatPercentValue(value);
  }
  return formatCount(value);
}

function isPercentMetric(metricKey: string): boolean {
  return metricKey === 'regression_rate' || metricKey === 'repo_distribution' || metricKey === 'feature_distribution';
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function relativePercentChange(current: number, baseline: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return 0;
  if (baseline === 0) return current === 0 ? 0 : 100;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function renderMetricSummary(signal: SignalCard): string {
  const label = metricLabel(signal.metric_key);
  const current = metricValue(signal.metric_key, signal.current_value);
  const baseline = metricValue(signal.metric_key, signal.baseline_value);
  const deltaValue = isPercentMetric(signal.metric_key)
    ? normalizePercent(signal.current_value) - normalizePercent(signal.baseline_value)
    : relativePercentChange(signal.current_value, signal.baseline_value);
  const delta = formatSignedPercent(deltaValue);
  return `${label}: ${current} vs ${baseline} baseline (${delta})`;
}


export default function SignalsPageClient({
  signals,
  windowDays,
  selectedSeverity,
}: {
  signals: SignalCard[];
  windowDays: number | null;
  selectedSeverity: 'all' | 'elevated' | 'significant';
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const windowLabel = useMemo(() => {
    if (windowDays == null) return 'Latest signals across all windows';
    if (windowDays <= 1) return 'Signals in the last day';
    return `Signals in the last ${windowDays} days`;
  }, [windowDays]);

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === 'all') params.delete(key);
    else params.set(key, value);
    router.push(`/signals?${params.toString()}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Signals</h1>
          <p className="text-sm text-white/70">{windowLabel}</p>
        </div>
      </div>

      <Card className="border-white/10 bg-white/5">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-[0.2em] text-white/60">Window</label>
            <Select
              value={windowDays == null ? 'all' : String(windowDays)}
              onValueChange={(value) => setParam('window', value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-auto min-w-[7rem] border-white/20 bg-black/60">
                <SelectValue placeholder="Window" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All windows</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-[0.2em] text-white/60">Severity</label>
            <Select
              value={selectedSeverity}
              onValueChange={(value) => setParam('severity', value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-auto min-w-[7rem] border-white/20 bg-black/60">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="elevated">Elevated</SelectItem>
                <SelectItem value="significant">Significant</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {signals.length === 0 ? (
        <Card className="border-white/10 bg-white/5">
          <CardContent className="py-10 text-center text-white/75">
            System stable. No significant deviations.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {signals.slice(0, 7).map((signal) => (
            <Card
              key={signal.id}
              className="cursor-pointer border-white/10 bg-black/40 transition hover:border-white/30 hover:bg-black/30"
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/signals/${signal.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  router.push(`/signals/${signal.id}`);
                }
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base text-white">{signal.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={severityClass(signal.severity)}>
                      {severityLabel(signal.severity)}
                    </Badge>
                    <Badge variant="outline" className="border-white/20 bg-white/5 text-white/70">
                      {scopeLabel(signal)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-white/80">{signal.summary_line}</p>
                {signal.feature_top && signal.feature_top.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {signal.feature_top.slice(0, 3).map((f) => (
                      <Badge key={f.key} variant="outline" className="border-white/20 bg-white/10 text-white">
                        {f.name} · {(f.share * 100).toFixed(0)}%
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-white/65">{renderMetricSummary(signal)}</p>
                <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                  <div>
                    <div className="space-y-1.5">
                      <p className="font-mono text-[11px] text-white/80">{signal.id}</p>
                      <p className="text-xs text-white/70">Detected: {formatTimestamp(signal.created_at)}</p>
                      <p className="text-xs text-white/70">
                        Window: {formatDateOnly(signal.window_start)} to {formatDateOnly(signal.window_end)}
                      </p>
                    </div>
                  </div>
                  <Button
                    asChild
                    className="self-end bg-white text-black hover:bg-white/90"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Link href={`/signals/${signal.id}`}>Investigate</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
