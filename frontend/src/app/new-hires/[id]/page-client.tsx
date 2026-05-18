'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, CalendarDays, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { RampDelivery, AccessRequest } from '@/types/onboarding';

const MILESTONE_DAYS = [1, 7, 14, 30, 60, 90];

type HireDetail = {
  hire: {
    id: string;
    name: string;
    role: string;
    email: string;
    start_date: string;
    ramp_day: number;
    status: string;
    slack_user_id: string | null;
  };
  deliveries: RampDelivery[];
  access_requests: AccessRequest[];
};

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function deliveryBadge(status: string) {
  if (status === 'delivered') return <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-xs">Delivered</Badge>;
  if (status === 'failed') return <Badge className="bg-red-500/20 text-red-300 border-0 text-xs">Failed</Badge>;
  return <Badge className="bg-zinc-500/20 text-zinc-300 border-0 text-xs">Pending</Badge>;
}

function accessBadge(status: string) {
  if (status === 'granted') return <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-xs">Granted</Badge>;
  if (status === 'sent') return <Badge className="bg-amber-500/20 text-amber-300 border-0 text-xs">Sent</Badge>;
  if (status === 'acknowledged') return <Badge className="bg-blue-500/20 text-blue-300 border-0 text-xs">Acknowledged</Badge>;
  return <Badge className="bg-zinc-500/20 text-zinc-300 border-0 text-xs">Pending</Badge>;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function NewHireDetailClient() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';

  const [activeTab, setActiveTab] = useState<'deliveries' | 'access'>('deliveries');
  const [data, setData] = useState<HireDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showArForm, setShowArForm] = useState(false);
  const [arForm, setArForm] = useState({ tool_name: '', requested_from_name: '', requested_from_email: '', requested_from_slack_id: '' });
  const [arSubmitting, setArSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/onboarding/new-hires/${id}`);
      const json = await res.json() as Record<string, unknown>;
      if (!res.ok) { setError((json.error as string) ?? 'Failed to load'); return; }
      setData(json as unknown as HireDetail);
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(status: string) {
    await fetch(`/api/onboarding/new-hires/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    void load();
  }

  async function markGranted(arId: string) {
    await fetch('/api/onboarding/access-requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: arId, status: 'granted' }),
    });
    void load();
  }

  async function addAccessRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!arForm.tool_name || !arForm.requested_from_name || !arForm.requested_from_email) return;
    setArSubmitting(true);
    try {
      await fetch('/api/onboarding/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_hire_id: id, ...arForm }),
      });
      setArForm({ tool_name: '', requested_from_name: '', requested_from_email: '', requested_from_slack_id: '' });
      setShowArForm(false);
      void load();
    } finally {
      setArSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6">
        <Skeleton className="h-5 w-36 bg-white/10" />
        <Skeleton className="h-40 bg-white/10 rounded-xl" />
        <Skeleton className="h-64 bg-white/10 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-red-300 mb-3">{error || 'Not found'}</p>
        <Link href="/new-hires" className="text-white/50 hover:text-white text-sm">← Back to new hires</Link>
      </div>
    );
  }

  const { hire, deliveries, access_requests } = data;
  const progress = Math.min(100, (hire.ramp_day / 90) * 100);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6">
      <Link href="/new-hires" className="flex items-center gap-1.5 text-white/40 hover:text-white/80 text-sm transition-colors">
        <ArrowLeft className="h-4 w-4" />
        New Hires
      </Link>

      {/* Hero card */}
      <div className="rounded-xl border border-white/10 bg-zinc-900 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white text-base font-bold shrink-0">
              {initials(hire.name)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold text-white">{hire.name}</h1>
                <Badge className="bg-blue-500/20 text-blue-300 border-0 text-xs">Day {hire.ramp_day}</Badge>
                {hire.status !== 'active' && (
                  <Badge className={hire.status === 'paused' ? 'bg-amber-500/20 text-amber-300 border-0 text-xs' : 'bg-zinc-500/20 text-zinc-300 border-0 text-xs'}>
                    {hire.status}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 flex-wrap">
                <span className="flex items-center gap-1.5 text-white/50 text-xs">
                  <Briefcase className="h-3.5 w-3.5" />
                  {hire.role}
                </span>
                <span className="flex items-center gap-1.5 text-white/50 text-xs">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Started {new Date(hire.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hire.status === 'active' && (
              <Button size="sm" variant="outline" onClick={() => updateStatus('paused')} className="border-white/20 text-white/60 hover:bg-white/10 text-xs h-8">
                Pause
              </Button>
            )}
            {hire.status === 'paused' && (
              <Button size="sm" variant="outline" onClick={() => updateStatus('active')} className="border-white/20 text-white/60 hover:bg-white/10 text-xs h-8">
                Resume
              </Button>
            )}
          </div>
        </div>

        {/* Ramp progress */}
        <div className="mt-6">
          <div className="relative">
            <Progress value={progress} className="h-1.5 bg-white/10" />
            <div className="flex justify-between mt-2">
              {MILESTONE_DAYS.map((day) => (
                <div key={day} className="flex flex-col items-center gap-0.5">
                  <div
                    className={`h-2 w-2 rounded-full -mt-3.5 border-2 border-zinc-900 ${
                      hire.ramp_day >= day ? 'bg-blue-400' : 'bg-white/20'
                    }`}
                  />
                  <span className="text-white/30 text-xs">D{day}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'deliveries' | 'access')}>
        <TabsList className="bg-zinc-900 border border-white/10 h-auto">
          <TabsTrigger value="deliveries" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 text-sm">
            Deliveries ({deliveries.length})
          </TabsTrigger>
          <TabsTrigger value="access" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 text-sm">
            Access ({access_requests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deliveries" className="mt-4">
          {deliveries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
              <p className="text-white/40 text-sm">No deliveries yet — they appear when milestones are reached.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deliveries.map((d) => (
                <div key={d.id} className="rounded-xl border border-white/10 bg-zinc-900 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        {deliveryBadge(d.delivery_status)}
                        {d.milestone && (
                          <span className="text-white text-sm font-medium">
                            Day {d.milestone.day_trigger} — {d.milestone.title}
                          </span>
                        )}
                      </div>
                      {d.content_delivered && (
                        <p className="text-white/50 text-sm line-clamp-2">{d.content_delivered.slice(0, 200)}</p>
                      )}
                      {d.error_message && <p className="text-red-300 text-xs mt-1">{d.error_message}</p>}
                    </div>
                    <span className="text-white/30 text-xs shrink-0">{fmtDate(d.delivered_at ?? d.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="access" className="mt-4 space-y-3">
          {access_requests.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-zinc-900 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide">Tool</th>
                    <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide hidden sm:table-cell">From</th>
                    <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide hidden md:table-cell">Sent</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {access_requests.map((ar) => (
                    <tr key={ar.id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 text-white font-medium">{ar.tool_name}</td>
                      <td className="px-4 py-3 text-white/60 hidden sm:table-cell">{ar.requested_from_name}</td>
                      <td className="px-4 py-3">{accessBadge(ar.status)}</td>
                      <td className="px-4 py-3 text-white/40 hidden md:table-cell">{fmtDate(ar.sent_at)}</td>
                      <td className="px-4 py-3">
                        {ar.status !== 'granted' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markGranted(ar.id)}
                            className="border-white/20 text-white/60 hover:bg-white/10 text-xs h-7"
                          >
                            Mark granted
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {access_requests.length === 0 && !showArForm && (
            <div className="rounded-xl border border-dashed border-white/10 py-10 text-center">
              <p className="text-white/40 text-sm">No access requests yet.</p>
            </div>
          )}

          {!showArForm ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArForm(true)}
              className="border-white/20 text-white/60 hover:bg-white/10 flex items-center gap-1.5 h-8"
            >
              <Plus className="h-3.5 w-3.5" />
              Add access request
            </Button>
          ) : (
            <form onSubmit={addAccessRequest} className="rounded-xl border border-white/10 bg-zinc-900 p-5 space-y-3">
              <p className="text-white text-sm font-medium">New access request</p>
              <div className="grid grid-cols-2 gap-3">
                <Input value={arForm.tool_name} onChange={(e) => setArForm((p) => ({ ...p, tool_name: e.target.value }))} placeholder="Tool name" className="border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm" />
                <Input value={arForm.requested_from_name} onChange={(e) => setArForm((p) => ({ ...p, requested_from_name: e.target.value }))} placeholder="Who to ask" className="border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm" />
                <Input value={arForm.requested_from_email} onChange={(e) => setArForm((p) => ({ ...p, requested_from_email: e.target.value }))} placeholder="Email" type="email" className="border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm" />
                <Input value={arForm.requested_from_slack_id} onChange={(e) => setArForm((p) => ({ ...p, requested_from_slack_id: e.target.value }))} placeholder="Slack ID (optional)" className="border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={arSubmitting} size="sm" className="bg-white text-black hover:bg-white/90 h-8 text-xs">
                  {arSubmitting ? 'Adding...' : 'Add'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowArForm(false)} className="border-white/20 text-white/60 hover:bg-white/10 h-8 text-xs">
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
