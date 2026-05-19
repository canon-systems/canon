'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Code2,
  MessageSquareWarning,
  Radar,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReadinessBrief } from '@/types/onboarding';

const cardIcons = [Sparkles, MessageSquareWarning, Wrench, Code2];

function impactClass(impact: string) {
  if (impact.startsWith('High')) return 'text-white';
  if (impact.startsWith('Medium')) return 'text-white/70';
  return 'text-white/50';
}

export function ReadinessClient() {
  const [brief, setBrief] = useState<ReadinessBrief | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadReadiness() {
      try {
        const res = await fetch('/api/onboarding/readiness');
        const data = (await res.json()) as { brief?: ReadinessBrief | null };
        if (!cancelled) setBrief(data.brief ?? null);
      } catch {
        if (!cancelled) setBrief(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReadiness();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <Skeleton className="h-24 rounded-xl bg-white/10" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-32 rounded-xl bg-white/10" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-96 rounded-xl bg-white/10" />
          <div className="space-y-6">
            <Skeleton className="h-64 rounded-xl bg-white/10" />
            <Skeleton className="h-48 rounded-xl bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-white">Readiness</h1>
            <Badge className="border-white/10 bg-white/10 text-white/70">Always-on</Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            Keep technical GTM teams current as product, process, and customer patterns change.
          </p>
        </div>
        <Button radius="md" className="h-9 w-fit bg-white px-3 text-black hover:bg-white/90">
          <Bell className="h-4 w-4" />
          Send readiness note
        </Button>
      </div>

      {!brief ? (
        <Card className="rounded-xl border-dashed border-white/[0.08] bg-zinc-900/80">
          <CardContent className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
            <Radar className="h-10 w-10 text-white/20" />
            <h2 className="mt-4 text-base font-medium text-white">No readiness brief loaded</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/40">
              Load demo data from Settings to populate readiness cards, role impact, and health metrics.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {brief.cards.map((card, index) => {
              const Icon = cardIcons[index] ?? Sparkles;
              return (
                <Card key={card.title} className="rounded-xl border-white/[0.08] bg-zinc-900/90">
                  <CardHeader className="flex-row items-start justify-between gap-4 p-5">
                    <div className="space-y-2">
                      <CardTitle className="text-sm font-medium text-white">{card.title}</CardTitle>
                      <p className="text-xs leading-5 text-white/40">{card.detail}</p>
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
                      <Icon className="h-4 w-4 text-white/50" />
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="rounded-xl border-white/[0.08] bg-zinc-900/90">
              <CardHeader className="border-b border-white/[0.08] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg text-white">{brief.title}</CardTitle>
                    <p className="mt-2 text-sm leading-6 text-white/50">
                      {brief.subtitle}
                    </p>
                  </div>
                  <Radar className="mt-1 h-5 w-5 shrink-0 text-white/40" />
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                <div className="rounded-xl border border-white/[0.08] bg-zinc-950/70 p-5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-white/50" />
                    <p className="text-xs font-medium uppercase tracking-wide text-white/40">Detected shift</p>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-white/70">
                    {brief.detected_shift}
                  </p>
                </div>

                <div className="space-y-3">
                  {brief.bullets.map((item) => (
                    <div key={item} className="flex gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
                      <p className="text-sm leading-5 text-white/60">{item}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="rounded-xl border-white/[0.08] bg-zinc-900/90">
                <CardHeader className="border-b border-white/[0.08] p-5">
                  <CardTitle className="text-base text-white">Who needs this?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5 p-5">
                  {brief.affected_roles.map((role) => (
                    <div key={role.role} className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{role.role}</p>
                          <p className={`mt-0.5 text-xs ${impactClass(role.impact)}`}>{role.impact}</p>
                        </div>
                        <span className="text-xs tabular-nums text-white/40">{role.progress}%</span>
                      </div>
                      <Progress
                        value={role.progress}
                        className="h-1.5 bg-white/10"
                        indicatorClassName="bg-white/60 bg-none"
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-xl border-white/[0.08] bg-zinc-900/90">
                <CardHeader className="border-b border-white/[0.08] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base text-white">Readiness health</CardTitle>
                    <Activity className="h-4 w-4 text-white/40" />
                  </div>
                </CardHeader>
                <CardContent className="divide-y divide-white/[0.08] p-0">
                  {brief.health_stats.map((stat) => (
                    <div key={stat.label} className="flex items-center justify-between gap-4 px-5 py-4">
                      <p className="text-sm text-white/50">{stat.label}</p>
                      <p className="text-sm font-semibold tabular-nums text-white">{stat.value}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
