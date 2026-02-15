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
  title: string;
  summary_line: string;
  severity: 'elevated' | 'significant';
  scope: { type: 'global' | 'repo' | 'aku'; id: string | null };
  percent_change: number;
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
  if (signal.scope.type === 'repo' && signal.scope.id) return `Repo: ${signal.scope.id}`;
  if (signal.scope.type === 'aku' && signal.scope.id) return `AKU: ${signal.scope.id}`;
  return 'Global';
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
                  <Badge variant="outline" className={severityClass(signal.severity)}>
                    {severityLabel(signal.severity)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-white/80">{signal.summary_line}</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Badge variant="outline" className="border-white/20 bg-white/5 text-white/70">
                    {scopeLabel(signal)}
                  </Badge>
                  <Button asChild className="bg-white text-black hover:bg-white/90" onClick={(event) => event.stopPropagation()}>
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
