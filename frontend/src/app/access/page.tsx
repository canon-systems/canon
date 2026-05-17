'use client';

import { useState, useEffect, useCallback } from 'react';
import { Key } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { AccessRequest } from '@/types/onboarding';

type AccessRequestWithHire = AccessRequest & {
  new_hires?: { name: string; role: string } | null;
};

function statusBadge(status: string) {
  if (status === 'granted') return <Badge className="bg-emerald-500/20 text-emerald-300 border-0">Granted</Badge>;
  if (status === 'acknowledged') return <Badge className="bg-blue-500/20 text-blue-300 border-0">Acknowledged</Badge>;
  if (status === 'sent') return <Badge className="bg-amber-500/20 text-amber-300 border-0">Sent</Badge>;
  return <Badge className="bg-zinc-500/20 text-zinc-300 border-0">Pending</Badge>;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AccessPage() {
  const [requests, setRequests] = useState<AccessRequestWithHire[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

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

  const pending = requests.filter((r) => r.status !== 'granted');
  const granted = requests.filter((r) => r.status === 'granted');

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-white/10 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Access requests</h1>
        <p className="text-white/60 mt-1">{pending.length} pending · {granted.length} granted</p>
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/20 p-16 text-center">
          <Key className="h-12 w-12 text-white/20 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No access requests yet</h3>
          <p className="text-white/50 text-sm mb-4">Access requests are created automatically when you add a new hire.</p>
          <Link href="/new-hires/new">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">Add a new hire</Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-5 py-3 text-white/50 font-medium">Tool</th>
                <th className="text-left px-5 py-3 text-white/50 font-medium">New hire</th>
                <th className="text-left px-5 py-3 text-white/50 font-medium">Requested from</th>
                <th className="text-left px-5 py-3 text-white/50 font-medium">Status</th>
                <th className="text-left px-5 py-3 text-white/50 font-medium">Sent</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                  <td className="px-5 py-3 text-white font-medium">{req.tool_name}</td>
                  <td className="px-5 py-3">
                    <Link href={`/new-hires/${req.new_hire_id}`} className="text-blue-400 hover:underline">
                      {req.new_hires?.name ?? '—'}
                    </Link>
                    {req.new_hires?.role && (
                      <p className="text-white/40 text-xs">{req.new_hires.role}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-white/60">
                    <p>{req.requested_from_name}</p>
                    <p className="text-white/40 text-xs">{req.requested_from_email}</p>
                  </td>
                  <td className="px-5 py-3">{statusBadge(req.status)}</td>
                  <td className="px-5 py-3 text-white/40">{formatDate(req.sent_at)}</td>
                  <td className="px-5 py-3">
                    {req.status !== 'granted' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markGranted(req.id)}
                        disabled={updating === req.id}
                        className="border-white/20 text-white/60 hover:bg-white/10 text-xs"
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
      )}
    </div>
  );
}
