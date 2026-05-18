'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Key } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AccessRequest } from '@/types/onboarding';

type AccessRequestWithHire = AccessRequest & {
  new_hires?: { name: string; role: string } | null;
};

const STATUS_ORDER = ['pending', 'sent', 'acknowledged', 'granted'];

function statusBadge(status: string) {
  if (status === 'granted') return <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-xs">Granted</Badge>;
  if (status === 'acknowledged') return <Badge className="bg-blue-500/20 text-blue-300 border-0 text-xs">Acknowledged</Badge>;
  if (status === 'sent') return <Badge className="bg-amber-500/20 text-amber-300 border-0 text-xs">Sent</Badge>;
  return <Badge className="bg-zinc-500/20 text-zinc-300 border-0 text-xs">Pending</Badge>;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function AccessClient() {
  const [requests, setRequests] = useState<AccessRequestWithHire[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/access-requests');
      const data = (await res.json()) as { access_requests?: AccessRequestWithHire[] };
      setRequests(data.access_requests ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markGranted(id: string) {
    setUpdating(id);
    try {
      await fetch('/api/onboarding/access-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'granted' }),
      });
      await load();
    } finally {
      setUpdating(null);
    }
  }

  const filtered = statusFilter === 'all'
    ? requests
    : requests.filter((r) => r.status === statusFilter);

  const counts = {
    all: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    sent: requests.filter((r) => r.status === 'sent').length,
    acknowledged: requests.filter((r) => r.status === 'acknowledged').length,
    granted: requests.filter((r) => r.status === 'granted').length,
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-8 w-40 bg-white/10" />
        <Skeleton className="h-10 w-full bg-white/10 rounded-xl" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 bg-white/10 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Access Requests</h1>
        <p className="text-white/50 text-sm mt-0.5">
          {counts.pending + counts.sent} pending · {counts.acknowledged} acknowledged · {counts.granted} granted
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16 text-center">
          <Key className="h-10 w-10 text-white/20 mb-3" />
          <h3 className="text-white font-medium mb-1">No access requests yet</h3>
          <p className="text-white/40 text-sm mb-5 max-w-xs">
            Access requests are created automatically when you add a new hire, based on their role.
          </p>
          <Link href="/new-hires/new">
            <Button size="sm" className="bg-white text-black hover:bg-white/90">Add a new hire</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Filter tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900 p-1 w-fit">
            {(['all', ...STATUS_ORDER] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-md text-xs transition-colors capitalize ${
                  statusFilter === s
                    ? 'bg-white/10 text-white'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                {s === 'all' ? `All (${counts.all})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${counts[s as keyof typeof counts]})`}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-zinc-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide">Tool</th>
                  <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide">New hire</th>
                  <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide hidden sm:table-cell">Requested from</th>
                  <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide hidden md:table-cell">Sent</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((req) => (
                  <tr key={req.id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{req.tool_name}</td>
                    <td className="px-4 py-3">
                      <Link href={`/new-hires/${req.new_hire_id}`} className="text-white hover:text-white/80 transition-colors">
                        {req.new_hires?.name ?? '—'}
                      </Link>
                      {req.new_hires?.role && (
                        <p className="text-white/30 text-xs">{req.new_hires.role}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-white/60">{req.requested_from_name}</p>
                      <p className="text-white/30 text-xs">{req.requested_from_email}</p>
                    </td>
                    <td className="px-4 py-3">{statusBadge(req.status)}</td>
                    <td className="px-4 py-3 text-white/40 hidden md:table-cell">{formatDate(req.sent_at)}</td>
                    <td className="px-4 py-3">
                      {req.status !== 'granted' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markGranted(req.id)}
                          disabled={updating === req.id}
                          className="border-white/20 text-white/60 hover:bg-white/10 text-xs h-7"
                        >
                          {updating === req.id ? 'Marking...' : 'Mark granted'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
