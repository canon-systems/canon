'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import type { AccessRequest } from '@/types/onboarding';

type AccessRequestWithHire = AccessRequest & {
  new_hires?: { name: string; role: string } | null;
};

const STATUS_ORDER = ['pending', 'sent', 'acknowledged', 'granted'];

function statusBadge(status: string) {
  if (status === 'granted') return <StatusBadge variant="delivered" label="Granted" />;
  if (status === 'acknowledged') return <StatusBadge variant="custom" label="Acknowledged" />;
  if (status === 'sent') return <StatusBadge variant="stalled" label="Sent" />;
  return <StatusBadge variant="pending" label="Pending" />;
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
        <Skeleton className="h-8 w-40 bg-[var(--bg-secondary)]" />
        <Skeleton className="h-10 w-full bg-[var(--bg-secondary)] rounded-xl" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 bg-[var(--bg-secondary)] rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="type-page-title text-[var(--text-primary)]">Access Requests</h1>
        <p className="text-[var(--text-secondary)] type-body mt-0.5">
          {counts.pending + counts.sent} Pending · {counts.acknowledged} Acknowledged · {counts.granted} Granted
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-tertiary)] py-16 text-center">
          <Key className="h-10 w-10 text-[var(--text-secondary)] mb-3" />
          <h3 className="text-[var(--text-primary)] font-medium mb-1">No Access Requests Yet</h3>
          <p className="text-[var(--text-secondary)] type-body mb-5 max-w-xs">
            Access requests are created automatically when you add a new hire, based on their role.
          </p>
          <Link href="/new-hires/new">
            <Button size="sm" className="bg-[var(--text-primary)] text-[var(--bg-page)] hover:bg-[var(--bg-secondary)]">Add a New Hire</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Filter tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-primary)] p-1 w-fit">
            {(['all', ...STATUS_ORDER] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-md type-caption transition-colors capitalize ${
                  statusFilter === s
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {s === 'all' ? `All (${counts.all})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${counts[s as keyof typeof counts]})`}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-[var(--border-tertiary)] bg-[var(--bg-primary)] overflow-hidden">
            <table className="w-full type-body">
              <thead>
                <tr className="border-b border-[var(--border-tertiary)]">
                  <th className="text-left px-4 py-3 text-[var(--text-secondary)] font-medium type-caption uppercase tracking-wide">Tool</th>
                  <th className="text-left px-4 py-3 text-[var(--text-secondary)] font-medium type-caption uppercase tracking-wide">New Hire</th>
                  <th className="text-left px-4 py-3 text-[var(--text-secondary)] font-medium type-caption uppercase tracking-wide hidden sm:table-cell">Requested From</th>
                  <th className="text-left px-4 py-3 text-[var(--text-secondary)] font-medium type-caption uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-[var(--text-secondary)] font-medium type-caption uppercase tracking-wide hidden md:table-cell">Sent</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((req) => (
                  <tr key={req.id} className="border-b border-[var(--border-tertiary)] last:border-0 hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="px-4 py-3 text-[var(--text-primary)] font-medium">{req.tool_name}</td>
                    <td className="px-4 py-3">
                      <Link href={`/new-hires?hire=${req.new_hire_id}`} className="text-[var(--text-primary)] hover:text-[var(--text-secondary)] transition-colors">
                        {req.new_hires?.name ?? '—'}
                      </Link>
                      {req.new_hires?.role && (
                        <p className="text-[var(--text-secondary)] type-caption">{req.new_hires.role}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-[var(--text-secondary)]">{req.requested_from_name}</p>
                      <p className="text-[var(--text-secondary)] type-caption">{req.requested_from_email}</p>
                    </td>
                    <td className="px-4 py-3">{statusBadge(req.status)}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] hidden md:table-cell">{formatDate(req.sent_at)}</td>
                    <td className="px-4 py-3">
                      {req.status !== 'granted' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markGranted(req.id)}
                          disabled={updating === req.id}
                          className="border-[var(--border-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] type-caption h-7"
                        >
                          {updating === req.id ? 'Marking...' : 'Mark Granted'}
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
