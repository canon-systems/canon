'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Users, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { HireStatus } from '@/types/onboarding';

type HireRow = {
  id: string;
  name: string;
  role: string;
  start_date: string;
  ramp_day: number;
  status: HireStatus;
};

type Filter = 'all' | HireStatus;

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function statusBadge(status: HireStatus) {
  const map: Record<HireStatus, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-emerald-500/20 text-emerald-300 border-0' },
    paused: { label: 'Paused', className: 'bg-amber-500/20 text-amber-300 border-0' },
    completed: { label: 'Completed', className: 'bg-zinc-500/20 text-zinc-300 border-0' },
  };
  const { label, className } = map[status] ?? map.completed;
  return <Badge className={className}>{label}</Badge>;
}

export function NewHiresClient() {
  const [hires, setHires] = useState<HireRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/new-hires');
      const data = (await res.json()) as { hires?: HireRow[] };
      setHires(data.hires ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = hires.filter((h) => {
    const matchesFilter = filter === 'all' || h.status === filter;
    const matchesSearch = !search || h.name.toLowerCase().includes(search.toLowerCase()) || h.role.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filters: { label: string; value: Filter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Paused', value: 'paused' },
    { label: 'Completed', value: 'completed' },
  ];

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32 bg-white/10" />
          <Skeleton className="h-9 w-28 bg-white/10" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 bg-white/10 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">New Hires</h1>
          <p className="text-white/50 text-sm mt-0.5">{hires.length} total</p>
        </div>
        <Link href="/new-hires/new">
          <Button size="sm" className="bg-white text-black hover:bg-white/90 flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Add hire
          </Button>
        </Link>
      </div>

      {/* Filters + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900 p-1">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                filter === f.value
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-48 max-w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search hires..."
            className="pl-9 border-white/10 bg-zinc-900 text-white placeholder:text-white/30 h-9 text-sm"
          />
        </div>
      </div>

      {/* Table / empty state */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16 text-center">
          <Users className="h-10 w-10 text-white/20 mb-3" />
          <h3 className="text-white font-medium mb-1">{hires.length === 0 ? 'No hires yet' : 'No results'}</h3>
          <p className="text-white/40 text-sm mb-5 max-w-xs">
            {hires.length === 0
              ? 'Add your first new hire to start their onboarding journey.'
              : 'Try adjusting your search or filter.'}
          </p>
          {hires.length === 0 && (
            <Link href="/new-hires/new">
              <Button size="sm" className="bg-white text-black hover:bg-white/90">Add first hire</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-zinc-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide hidden sm:table-cell">Role</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide hidden md:table-cell">Started</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide">Progress</th>
                <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((hire) => (
                <tr
                  key={hire.id}
                  className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => { window.location.href = `/new-hires/${hire.id}`; }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white text-xs font-semibold shrink-0">
                        {initials(hire.name)}
                      </div>
                      <span className="text-white font-medium">{hire.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/60 hidden sm:table-cell">{hire.role}</td>
                  <td className="px-4 py-3 text-white/40 hidden md:table-cell">
                    {new Date(hire.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-24">
                      <Progress value={Math.min(100, (hire.ramp_day / 90) * 100)} className="h-1.5 flex-1 bg-white/10" />
                      <span className="text-white/30 text-xs shrink-0">D{hire.ramp_day}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{statusBadge(hire.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
