'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, Clipboard, Sparkles } from 'lucide-react';
import { DateTime } from 'luxon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, type DateRange } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { postureLabel, shouldRenderMetricSummary } from './signal-card-helpers';

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
  'repo_distribution',
  'domain_distribution',
] as const;

type SignalMetricOption = (typeof SIGNAL_METRIC_OPTIONS)[number];

function riskBadgeClass(posture: SignalCard['risk_posture']): string {
  if (posture === 'critical') return 'border-red-300/50 bg-red-500/15 text-red-100';
  if (posture === 'high') return 'border-orange-300/45 bg-orange-500/15 text-orange-100';
  if (posture === 'elevated') return 'border-yellow-300/45 bg-yellow-500/15 text-yellow-100';
  return 'border-emerald-300/45 bg-emerald-500/15 text-emerald-100';
}

function formatTimestamp(value: string | null, timeZone: string): string {
  if (!value) return 'Unavailable';
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
  if (metricKey === 'regression_rate') return 'Quality risk';
  if (metricKey === 'tickets_completed') return 'Delivery pace';
  if (metricKey === 'tickets_regressed') return 'Reopened work';
  if (metricKey === 'prs_opened') return 'Work started';
  if (metricKey === 'prs_merged') return 'Work completed';
  if (metricKey === 'repos_touched') return 'Execution spread';
  if (metricKey === 'repo_distribution') return 'Repository focus';
  if (metricKey === 'domain_distribution') return 'Domain focus';
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

function reliabilityLabel(confidence: SignalCard['confidence']): string {
  if (confidence === 'mature') return 'High';
  if (confidence === 'building') return 'Medium';
  if (confidence === 'early') return 'Early';
  return 'Unrated';
}

function actionTime(signal: SignalCard): string {
  if (signal.risk_posture === 'critical' || signal.severity === 'significant') return 'Within 48 hours';
  if (signal.risk_posture === 'high') return 'Within 3 business days';
  return 'Within 7 days';
}

function actionOwner(signal: SignalCard): string {
  if (signal.metric_key.includes('ticket') || signal.metric_key.includes('regression')) return 'Engineering Director';
  if (signal.metric_key.includes('pr')) return 'Delivery Lead';
  return 'Functional Leader';
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

  const topDecisions = useMemo(() => signals.slice(0, 3), [signals]);

  const windowLabel = useMemo(() => {
    if (!selectedStartDate || !selectedEndDate) return 'Since your last check-in';
    return selectedStartDate === selectedEndDate
      ? `On ${selectedStartDate}`
      : `${selectedStartDate} to ${selectedEndDate}`;
  }, [selectedStartDate, selectedEndDate]);

  const briefingText = useMemo(() => {
    const lines = topDecisions.map((signal, index) => {
      const decisionLine = `Decision ${index + 1}: ${signal.title}`;
      const contextLine = `${signal.summary_line}${formatMetricDelta(signal)}`;
      const actionLine = `Recommended owner: ${actionOwner(signal)}. Suggested timing: ${actionTime(signal)}.`;
      return `${decisionLine}\n${contextLine}\n${actionLine}`;
    });

    if (lines.length === 0) {
      return `Canon briefing (${windowLabel})\nNo material risk shifts were detected.`;
    }

    return `Canon briefing (${windowLabel})\n\n${lines.join('\n\n')}`;
  }, [topDecisions, windowLabel]);

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

  const copyBriefing = async () => {
    if (typeof window === 'undefined' || !window.navigator.clipboard) return;
    await window.navigator.clipboard.writeText(briefingText);
  };

  return (
    <div className="space-y-5">
      <Card className="border-white/15 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/60">
                <Sparkles className="h-3.5 w-3.5" />
                Executive Briefing
              </p>
              <h1 className="text-2xl font-semibold text-white">Here are the top actions to decide now.</h1>
              <p className="text-sm text-white/70">{windowLabel}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/20 bg-black/40 text-white hover:bg-black/70"
                onClick={copyBriefing}
              >
                <Clipboard className="mr-2 h-4 w-4" />
                Copy Briefing
              </Button>
            </div>
          </div>
          <div className="grid gap-2 text-sm text-white/75 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.16em] text-white/60">Top actions now</p>
              <p className="mt-1 text-white">{topDecisions.length.toLocaleString('en-US')}</p>
              <p className="mt-1 text-[11px] text-white/60">
                Highest-priority items based on risk and impact.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.16em] text-white/60">Signals in view</p>
              <p className="mt-1 text-white">{signals.length.toLocaleString('en-US')}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.16em] text-white/60">Priority</p>
              <p className="mt-1 text-white">{selectedSeverity === 'all' ? 'All' : selectedSeverity === 'significant' ? 'Critical first' : 'Elevated only'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-zinc-900">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-[0.2em] text-white/60">Timeframe</label>
            <Popover open={isDatePickerOpen} onOpenChange={onDatePickerOpenChange}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-auto min-w-[11rem] justify-start border-white/20 bg-black/60 text-white hover:bg-black/70">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {selectedStartDate && selectedEndDate ? `${selectedStartDate} to ${selectedEndDate}` : 'Since last check-in'}
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
                      Apply Range
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-[0.2em] text-white/60">Priority</label>
            <Select
              value={selectedSeverity}
              onValueChange={(value) => setParam('severity', value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-auto min-w-[11rem] border-white/20 bg-black/60">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="significant">Critical first</SelectItem>
                <SelectItem value="elevated">Elevated only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-[0.2em] text-white/60">Focus area</label>
            <Select
              value={selectedMetric}
              onValueChange={(value) => setParam('metric', value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-auto min-w-[12rem] border-white/20 bg-black/60">
                <SelectValue placeholder="Focus area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All areas</SelectItem>
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
            No material shifts were identified in this view.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-white/60">Top actions to decide now</p>
          <div className="grid gap-4">
            {signals.map((signal, index) => {
              const isTopDecision = index < 3;
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
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {isTopDecision ? (
                            <Badge variant="outline" className="border-white/25 bg-white/8 text-white/80">
                              Decision {index + 1}
                            </Badge>
                          ) : null}
                          {signal.risk_posture ? (
                            <Badge variant="outline" className={riskBadgeClass(signal.risk_posture)}>
                              {postureLabel(signal.risk_posture)}
                            </Badge>
                          ) : null}
                        </div>
                        <CardTitle className="text-base text-white">{signal.title}</CardTitle>
                      </div>
                      <Button
                        asChild
                        className="self-start bg-white text-black hover:bg-white/90"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Link href={signalDetailHref(signal.id)}>Open Briefing</Link>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-white/80">{signal.summary_line}{formatMetricDelta(signal)}</p>
                    <div className="grid gap-2 text-xs text-white/70 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-white/50">Decision focus</p>
                        <p className="mt-1 text-white/90">Review {metricLabel(signal.metric_key).toLowerCase()}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-white/50">Recommended owner</p>
                        <p className="mt-1 text-white/90">{actionOwner(signal)}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-white/50">Confidence level</p>
                        <p className="mt-1 text-white/90">{reliabilityLabel(signal.confidence)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-1 text-xs text-white/60 sm:grid-cols-2">
                      <p>Last update: {formatTimestamp(signal.created_at, timeZone)} | Time window: {formatDateOnly(signal.window_start, timeZone)} to {formatDateOnly(signal.window_end, timeZone)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
