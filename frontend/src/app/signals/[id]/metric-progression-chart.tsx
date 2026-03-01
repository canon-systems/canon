'use client';

import { DateTime } from 'luxon';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

type TrendEntry = {
  label: string;
  window_start: string | null;
  window_end: string | null;
  value: number;
};

function isRateMetric(metricKey: string): boolean {
  return metricKey === 'regression_rate' || metricKey.includes('distribution');
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

function formatWindowRange(start: string | null, end: string | null, timeZone: string): string {
  if (!start || !end) return 'Range unavailable';
  const startLabel = DateTime.fromISO(start, { zone: 'utc' }).setZone(timeZone).toFormat('MMM d');
  const endLabel = DateTime.fromISO(end, { zone: 'utc' }).setZone(timeZone).toFormat('MMM d');
  return `${startLabel} - ${endLabel}`;
}

function formatMetricForDisplay(metricKey: string, value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (isRateMetric(metricKey)) {
    const percent = value * 100;
    const abs = Math.abs(percent);
    const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    return `${percent.toFixed(digits)}%`;
  }
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return value.toFixed(digits);
}

export default function MetricProgressionChart({
  entries,
  metricKey,
  timeZone,
}: {
  entries: TrendEntry[];
  metricKey: string;
  timeZone: string;
}) {
  const chartData = entries.map((entry, index) => ({
    window: index === 0 ? 'Onset' : index === entries.length - 1 ? 'Latest' : `W${index}`,
    range: formatWindowRange(entry.window_start, entry.window_end, timeZone),
    value: entry.value,
  }));

  const chartConfig = {
    value: {
      label: metricDisplayLabel(metricKey),
      color: '#f8fafc',
    },
  } satisfies ChartConfig;

  const baselineValue = chartData[0]?.value ?? 0;

  return (
    <div className="rounded border border-white/10 bg-zinc-900/70 px-3 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-white/50">Metric Progression by Window</p>
      <p className="mt-1 text-xs text-white/60">Trend from onset to latest window.</p>

      <ChartContainer config={chartConfig} className="mt-3 h-[300px]">
        <LineChart data={chartData} margin={{ left: 12, right: 16, top: 12, bottom: 4 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="window"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            stroke="rgba(255,255,255,0.65)"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={72}
            tickMargin={8}
            stroke="rgba(255,255,255,0.65)"
            tickFormatter={(value) => formatMetricForDisplay(metricKey, Number(value))}
          />
          <ReferenceLine
            y={baselineValue}
            stroke="rgba(255,255,255,0.35)"
            strokeDasharray="4 4"
            ifOverflow="extendDomain"
          />
          <ChartTooltip
            cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }}
            content={
              <ChartTooltipContent
                labelFormatter={(label) => {
                  const point = chartData.find((item) => item.window === String(label));
                  if (!point) return String(label);
                  return `${label} • ${point.range}`;
                }}
                valueFormatter={(value) => formatMetricForDisplay(metricKey, Number(value))}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-value)"
            strokeWidth={2.5}
            dot={{ r: 4, fill: 'var(--color-value)', strokeWidth: 0 }}
            activeDot={{ r: 6, fill: 'var(--color-value)', strokeWidth: 0 }}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
