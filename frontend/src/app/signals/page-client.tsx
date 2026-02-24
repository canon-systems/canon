'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { DateTime } from 'luxon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, type DateRange } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { postureLabel, shouldRenderMetricSummary, structuralSentenceForDisplay } from './signal-card-helpers';

type SignalCard = {
  id: string;
  created_at: string | null;
  title: string;
  summary_line: string;
  severity: 'elevated' | 'significant';
  scope: { type: 'global' | 'repo' | 'ticketing'; id: string | null };
  scope_label_override?: string | null;
  metric_key: string;
  current_value: number;
  baseline_value: number;
  percent_change: number;
  window_start: string;
  window_end: string;
  risk_posture: 'low' | 'elevated' | 'high' | 'critical' | null;
  structural_sentence: string | null;
  confidence: 'early' | 'building' | 'mature' | null;
};

const SIGNAL_METRIC_OPTIONS = [
  'regression_rate',
  'tickets_completed',
  'prs_merged',
  'repo_distribution',
  'domain_distribution',
] as const;

type SignalMetricOption = (typeof SIGNAL_METRIC_OPTIONS)[number];

function severityLabel(severity: SignalCard['severity']): string {
  return severity === 'significant' ? 'Significant' : 'Elevated';
}

function riskBadgeClass(posture: SignalCard['risk_posture']): string {
  if (posture === 'critical') return 'border-red-300/50 bg-red-500/15 text-red-100';
  if (posture === 'high') return 'border-orange-300/45 bg-orange-500/15 text-orange-100';
  if (posture === 'elevated') return 'border-yellow-300/45 bg-yellow-500/15 text-yellow-100';
  return 'border-emerald-300/45 bg-emerald-500/15 text-emerald-100';
}

function formatTimestamp(value: string | null, timeZone: string): string {
  if (!value) return 'N/A';
  const date = DateTime.fromISO(value, { zone: 'utc' }).setZone(timeZone);
  if (!date.isValid) return value;
  return date.toFormat('MMM d, yyyy h:mm a ZZZZ');
}

function formatDateOnly(value: string, timeZone: string): string {
  const date = DateTime.fromISO(value, { zone: 'utc' }).setZone(timeZone);
  if (!date.isValid) return value;
  return date.toFormat('yyyy-LL-dd');
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

function formatSignedPoints(value: number): string {
  if (!Number.isFinite(value)) return '0 pts';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
  return `${value > 0 ? '+' : ''}${formatted} pts`;
}

function metricLabel(metricKey: string): string {
  if (metricKey === 'regression_rate') return 'Regression rate';
  if (metricKey === 'tickets_completed') return 'Tickets completed';
  if (metricKey === 'tickets_regressed') return 'Tickets regressed';
  if (metricKey === 'prs_opened') return 'PRs opened';
  if (metricKey === 'prs_merged') return 'PRs merged';
  if (metricKey === 'repos_touched') return 'Repos touched';
  if (metricKey === 'repo_distribution') return 'Repo concentration';
  if (metricKey === 'domain_distribution') return 'Domain concentration';
  return metricKey.replace(/_/g, ' ');
}

function isPercentMetric(metricKey: string): boolean {
  return metricKey === 'regression_rate' || metricKey === 'repo_distribution' || metricKey === 'domain_distribution';
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

function formatMetricDelta(signal: SignalCard): string {
  if (!shouldRenderMetricSummary(signal.metric_key)) return '';
  const deltaValue = isPercentMetric(signal.metric_key)
    ? normalizePercent(signal.current_value) - normalizePercent(signal.baseline_value)
    : relativePercentChange(signal.current_value, signal.baseline_value);
  const delta = isPercentMetric(signal.metric_key) ? formatSignedPoints(deltaValue) : formatSignedPercent(deltaValue);
  return ` (${delta})`;
}

function normalizeCalendarDay(date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dateFromLocalDay(day: string): Date | undefined {
  const parsed = DateTime.fromISO(day, { zone: 'utc' });
  if (!parsed.isValid) return undefined;
  return new Date(parsed.year, parsed.month - 1, parsed.day);
}

export default function SignalsPageClient({
  signals,
  selectedStartDate,
  selectedEndDate,
  selectedSeverity,
  selectedMetric,
  timeZone,
}: {
  signals: SignalCard[];
  selectedStartDate: string | null;
  selectedEndDate: string | null;
  selectedSeverity: 'all' | 'elevated' | 'significant';
  selectedMetric: 'all' | SignalMetricOption;
  timeZone: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>(() => ({
    from: selectedStartDate ? dateFromLocalDay(selectedStartDate) : undefined,
    to: selectedEndDate ? dateFromLocalDay(selectedEndDate) : undefined,
  }));

  const windowLabel = useMemo(() => {
    if (!selectedStartDate || !selectedEndDate) return 'Latest signals across all dates';
    return selectedStartDate === selectedEndDate
      ? `Signals on ${selectedStartDate}`
      : `Signals from ${selectedStartDate} to ${selectedEndDate}`;
  }, [selectedStartDate, selectedEndDate]);

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === 'all') params.delete(key);
    else params.set(key, value);
    if (key === 'metric') params.delete('metrc');
    router.push(`/signals?${params.toString()}`);
  };

  const signalDetailHref = (signalId: string): string => `/signals/${signalId}`;

  const setDateRangeParams = (start: string | null, end: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (start && end) {
      params.set('start', start);
      params.set('end', end);
    } else {
      params.delete('start');
      params.delete('end');
    }
    params.delete('window');
    router.push(`/signals?${params.toString()}`);
  };

  const selectedWindowDraft = useMemo(() => {
    if (!selectedDateRange.from || !selectedDateRange.to) return null;
    const fromDay = normalizeCalendarDay(selectedDateRange.from);
    const toDay = normalizeCalendarDay(selectedDateRange.to);
    return fromDay <= toDay ? { start: fromDay, end: toDay } : { start: toDay, end: fromDay };
  }, [selectedDateRange]);

  const onDatePickerOpenChange = (open: boolean) => {
    setIsDatePickerOpen(open);
    if (open) {
      setSelectedDateRange({
        from: selectedStartDate ? dateFromLocalDay(selectedStartDate) : undefined,
        to: selectedEndDate ? dateFromLocalDay(selectedEndDate) : undefined,
      });
    }
  };

  const applyDateRange = () => {
    if (!selectedWindowDraft) return;
    setDateRangeParams(selectedWindowDraft.start, selectedWindowDraft.end);
    setIsDatePickerOpen(false);
  };

  const clearDateRange = () => {
    setDateRangeParams(null, null);
    setSelectedDateRange({ from: undefined, to: undefined });
    setIsDatePickerOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Signals</h1>
          <p className="text-sm text-white/70">
            {windowLabel} · Time zone: {timeZone}
          </p>
          <p className="text-xs text-white/60">
            Total: {signals.length.toLocaleString('en-US')} signal{signals.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <Card className="border-white/10 bg-zinc-900">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-[0.2em] text-white/60">Date Range</label>
            <Popover open={isDatePickerOpen} onOpenChange={onDatePickerOpenChange}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-auto min-w-[11rem] justify-start border-white/20 bg-black/60 text-white hover:bg-black/70">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {selectedStartDate && selectedEndDate ? `${selectedStartDate} to ${selectedEndDate}` : 'Select range'}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={8} className="w-auto border-white/10 bg-black/95 p-0">
                <Calendar
                  mode="range"
                  numberOfMonths={1}
                  selected={selectedDateRange}
                  onSelect={(range) => setSelectedDateRange(range || { from: undefined, to: undefined })}
                  defaultMonth={selectedDateRange.from || new Date()}
                  disabled={(date) => date > new Date()}
                />
                <div className="border-t border-white/10 p-3">
                  <p className="text-xs text-white/70">
                    Date range:{' '}
                    {selectedWindowDraft ? `${selectedWindowDraft.start} to ${selectedWindowDraft.end}` : 'Choose start and end dates'}
                  </p>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 px-3 text-white/70 hover:text-white"
                      onClick={clearDateRange}
                    >
                      Clear
                    </Button>
                    <Button
                      type="button"
                      className="h-8 px-3 bg-white text-black hover:bg-white/90"
                      disabled={!selectedWindowDraft}
                      onClick={applyDateRange}
                    >
                      Confirm Range
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-[0.2em] text-white/60">Metric</label>
            <Select
              value={selectedMetric}
              onValueChange={(value) => setParam('metric', value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-auto min-w-[11rem] border-white/20 bg-black/60">
                <SelectValue placeholder="Metric" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {SIGNAL_METRIC_OPTIONS.map((metricKey) => (
                  <SelectItem key={metricKey} value={metricKey}>
                    {metricLabel(metricKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {signals.length === 0 ? (
        <Card className="border-white/10 bg-zinc-900">
          <CardContent className="py-10 text-center text-white/75">
            System stable. No significant deviations.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {signals.map((signal) => {
            const structuralDisplay = structuralSentenceForDisplay(signal.structural_sentence);
            return (
            <Card
              key={signal.id}
              className="cursor-pointer border-white/10 bg-zinc-800 transition hover:border-white/30 hover:bg-zinc-700"
              role="button"
              tabIndex={0}
              onClick={() => router.push(signalDetailHref(signal.id))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  router.push(signalDetailHref(signal.id));
                }
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base text-white">{signal.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    {signal.risk_posture ? (
                      <Badge variant="outline" className={riskBadgeClass(signal.risk_posture)}>
                        {postureLabel(signal.risk_posture)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-white/25 bg-white/8 text-white/80">
                        {severityLabel(signal.severity)}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-white/80">
                  {signal.summary_line}
                  {formatMetricDelta(signal)}
                </p>
                {structuralDisplay ? (
                  <p className="text-xs text-white/70">{structuralDisplay}</p>
                ) : null}
                <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                  <div>
                    <div className="space-y-1.5">
                      <p className="font-mono text-[11px] text-white/80">{signal.id}</p>
                      <p className="text-xs text-white/70">Detected: {formatTimestamp(signal.created_at, timeZone)}</p>
                      <p className="text-xs text-white/70">
                        Window: {formatDateOnly(signal.window_start, timeZone)} to {formatDateOnly(signal.window_end, timeZone)}
                      </p>
                      {signal.confidence ? (
                        <p className="text-xs text-white/60">Confidence: {signal.confidence}</p>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    asChild
                    className="self-end bg-white text-black hover:bg-white/90"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Link href={signalDetailHref(signal.id)}>Investigate</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
