'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Users, MessageSquare, Key, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

type HireRow = {
  id: string;
  name: string;
  role: string;
  start_date: string;
  ramp_day: number;
  status: string;
};

type AccessRow = {
  id: string;
  tool_name: string;
  requested_from_name: string;
  sent_at: string | null;
  status: string;
  new_hire_name: string;
};

type DashboardData = {
  active_hires: HireRow[];
  deliveries_this_week: number;
  pending_access_count: number;
  stalled_requests: AccessRow[];
};

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function statusColor(status: string) {
  if (status === 'active') return 'bg-emerald-500';
  if (status === 'paused') return 'bg-amber-500';
  return 'bg-zinc-500';
}

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [hiresRes, accessRes] = await Promise.all([
        fetch('/api/onboarding/new-hires'),
        fetch('/api/onboarding/access-requests'),
      ]);
      const hiresJson = (await hiresRes.json()) as { hires?: HireRow[] };
      const accessJson = (await accessRes.json()) as { access_requests?: Array<{ id: string; tool_name: string; requested_from_name: string; sent_at: string | null; status: string; new_hire_id: string }> };

      const allHires: HireRow[] = hiresJson.hires ?? [];
      const activeHires = allHires.filter((h) => h.status === 'active');
      const allRequests = accessJson.access_requests ?? [];

      const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
      const stalled = allRequests
        .filter((r) => r.status === 'sent' && r.sent_at && new Date(r.sent_at).getTime() < twoDaysAgo)
        .slice(0, 5)
        .map((r) => {
          const hire = allHires.find((h) => h.id === r.new_hire_id);
          return { ...r, new_hire_name: hire?.name ?? 'Unknown' };
        });

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const deliveriesRes = await fetch(`/api/onboarding/new-hires`);
      void deliveriesRes;

      setData({
        active_hires: activeHires,
        deliveries_this_week: 0,
        pending_access_count: allRequests.filter((r) => r.status === 'pending' || r.status === 'sent').length,
        stalled_requests: stalled,
      });
      void weekAgo;
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stats = [
    { label: 'Active new hires', value: data?.active_hires.length ?? 0, icon: Users, href: '/new-hires' },
    { label: 'Deliveries this week', value: data?.deliveries_this_week ?? 0, icon: MessageSquare, href: null },
    { label: 'Pending access', value: data?.pending_access_count ?? 0, icon: Key, href: null },
  ];

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        <Skeleton className="h-9 w-40 bg-white/10" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 bg-white/10 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 bg-white/10 rounded-xl" />
          <Skeleton className="h-64 bg-white/10 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="text-white/50 text-sm mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link href="/new-hires/new">
          <Button size="sm" className="bg-white text-black hover:bg-white/90 flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Add hire
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          const inner = (
            <div className="rounded-xl border border-white/10 bg-zinc-900 p-6 hover:border-white/20 transition-colors">
              <div className="flex items-start justify-between">
                <p className="text-sm text-white/50">{s.label}</p>
                <Icon className="h-4 w-4 text-white/30" />
              </div>
              <p className="text-3xl font-bold text-white mt-2">{s.value}</p>
            </div>
          );
          return s.href ? (
            <Link key={s.label} href={s.href}>{inner}</Link>
          ) : (
            <div key={s.label}>{inner}</div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active hires */}
        <div className="rounded-xl border border-white/10 bg-zinc-900 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium text-white/70 uppercase tracking-wide">Active hires</h2>
            <Link href="/new-hires" className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {data?.active_hires.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Users className="h-8 w-8 text-white/20 mb-3" />
              <p className="text-white/40 text-sm">No active hires</p>
              <Link href="/new-hires/new">
                <Button variant="ghost" size="sm" className="mt-2 text-white/40 hover:text-white text-xs">
                  Add your first hire →
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.active_hires.map((hire) => (
                <Link key={hire.id} href={`/new-hires/${hire.id}`} className="block group">
                  <div className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-white/5 transition-colors">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white text-xs font-semibold shrink-0">
                      {initials(hire.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium truncate">{hire.name}</span>
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColor(hire.status)}`} />
                      </div>
                      <p className="text-white/40 text-xs truncate">{hire.role}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Progress value={Math.min(100, (hire.ramp_day / 90) * 100)} className="h-1 flex-1 bg-white/10" />
                        <span className="text-white/30 text-xs shrink-0">D{hire.ramp_day}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Stalled access requests */}
        <div className="rounded-xl border border-white/10 bg-zinc-900 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium text-white/70 uppercase tracking-wide">Needs attention</h2>
          </div>

          {data?.stalled_requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Key className="h-8 w-8 text-white/20 mb-3" />
              <p className="text-white/40 text-sm">All access requests are current</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data?.stalled_requests.map((req) => (
                <div key={req.id} className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <div>
                    <p className="text-white text-sm font-medium">{req.tool_name}</p>
                    <p className="text-white/40 text-xs">
                      {req.new_hire_name} · via {req.requested_from_name}
                    </p>
                  </div>
                  <Badge className="bg-amber-500/20 text-amber-300 border-0 text-xs shrink-0">Stalled</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
