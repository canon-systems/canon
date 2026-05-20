'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  IconArrowLeft,
  IconBriefcase,
  IconCalendar,
  IconChevronDown,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconUsers,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { MilestoneProgress } from '@/components/ui/milestone-progress';
import type { RampDelivery, AccessRequest } from '@/types/onboarding';

const MILESTONE_DAYS = [1, 7, 14, 30, 45, 60, 90];

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

function deliveryVariant(status: string) {
  if (status === 'delivered') return 'delivered';
  if (status === 'failed') return 'error';
  return 'upcoming';
}

function accessVariant(status: string) {
  if (status === 'granted') return 'delivered';
  if (status === 'sent' || status === 'acknowledged') return 'stalled';
  return 'pending';
}

function fmtDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtStartDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function NewHireDetailClient() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';

  const [activeTab, setActiveTab] = useState<'Deliveries' | 'Access'>('Deliveries');
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
      <div className="flex h-full flex-col">
        <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
          <Skeleton className="h-24 rounded-[10px] bg-[var(--bg-primary)]" />
        </div>
        <div className="px-5 py-5">
          <Skeleton className="h-80 rounded-[10px] bg-[var(--bg-primary)]" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="text-[14px] font-medium" style={{ color: 'var(--red-text)' }}>{error || 'Not Found'}</div>
        <Link href="/new-hires" className="text-[12px] flex items-center gap-1" style={{ color: 'var(--canon-purple)' }}>
          <IconArrowLeft size={12} /> Back to New Hires
        </Link>
      </div>
    );
  }

  const { hire, deliveries, access_requests } = data;
  const progress = Math.min(100, (hire.ramp_day / 90) * 100);
  const derivedMilestones = MILESTONE_DAYS.map((day) => ({
    label: `D${day}`,
    status: day < hire.ramp_day ? 'done' as const : day === hire.ramp_day ? 'current' as const : 'pending' as const,
  }));
  const counts = {
    Deliveries: deliveries.length,
    Access: access_requests.length,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
        <Link href="/new-hires" className="inline-flex items-center gap-1 text-[12px] mb-4" style={{ color: 'var(--text-tertiary)' }}>
          <IconArrowLeft size={13} /> New Hires
        </Link>
        <div className="flex items-start gap-[14px] mb-4">
          <Avatar name={hire.name} size="lg" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[18px] font-medium" style={{ color: 'var(--text-primary)' }}>{hire.name}</span>
              <span
                className="text-[11px] font-medium px-2 py-[2px] rounded-[4px] text-[var(--text-primary)]"
                style={{ backgroundColor: 'var(--canon-purple)' }}
              >
                Day {hire.ramp_day}
              </span>
              {hire.status !== 'active' && <StatusBadge variant={hire.status === 'paused' ? 'paused' : 'completed'} />}
            </div>
            <div className="flex items-center gap-2 mt-[3px] text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              <IconBriefcase size={13} />
              {hire.role}
              <span style={{ color: 'var(--border-secondary)' }}>·</span>
              <IconCalendar size={13} />
              Started {fmtStartDate(hire.start_date)}
            </div>
          </div>
          {hire.status === 'active' ? (
            <Button variant="secondary" onClick={() => updateStatus('paused')}>
              <IconPlayerPause size={13} /> Pause
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => updateStatus('active')}>
              <IconPlayerPlay size={13} /> Resume
            </Button>
          )}
        </div>
        <MilestoneProgress milestones={derivedMilestones} progress={progress} />
      </div>

      <div className="flex border-b px-5" style={{ borderColor: 'var(--border-tertiary)' }}>
        {(['Deliveries', 'Access'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className="text-[13px] px-[14px] py-[10px] border-b-2 -mb-px transition-colors duration-[120ms]"
            style={{
              color: activeTab === tab ? 'var(--canon-purple)' : 'var(--text-secondary)',
              borderBottomColor: activeTab === tab ? 'var(--canon-purple)' : 'transparent',
              fontWeight: activeTab === tab ? 500 : 400,
            }}
          >
            {tab} <span className="text-[11px] opacity-70">{counts[tab]}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {activeTab === 'Deliveries' && (
          deliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12">
              <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
              <div className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>No Deliveries Yet</div>
              <div className="text-[12px] text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                Deliveries appear when ramp milestones are reached.
              </div>
            </div>
          ) : (
            deliveries.map((delivery) => {
              const delivered = delivery.delivery_status === 'delivered';
              return (
                <div
                  key={delivery.id}
                  className="border rounded-[10px] mb-[10px] overflow-hidden cursor-pointer transition-colors duration-[120ms]"
                  style={{ borderColor: 'var(--border-tertiary)', backgroundColor: 'var(--bg-primary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-tertiary)'; }}
                >
                  <div className="flex items-center gap-[10px] px-[14px] py-3">
                    <StatusBadge variant={deliveryVariant(delivery.delivery_status)} label={delivered ? 'Delivered' : delivery.delivery_status === 'failed' ? 'Failed' : 'Upcoming'} />
                    <span className="text-[13px] font-medium flex-1" style={{ color: 'var(--text-primary)' }}>
                      {delivery.milestone ? `Day ${delivery.milestone.day_trigger} · ${delivery.milestone.title}` : 'Ramp Delivery'}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{fmtDate(delivery.delivered_at ?? delivery.created_at)}</span>
                  </div>
                  <div className="px-[14px] pb-3 pt-[10px] border-t" style={{ borderColor: 'var(--border-tertiary)' }}>
                    <p
                      className="text-[12px] leading-[1.55] line-clamp-3"
                      style={{ color: delivered ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}
                    >
                      {delivery.content_delivered ?? delivery.error_message ?? 'This delivery has not been generated yet.'}
                    </p>
                    {delivered && (
                      <button className="text-[11px] flex items-center gap-[3px] mt-[6px]" style={{ color: 'var(--canon-purple)' }}>
                        <IconChevronDown size={11} /> Read Full Message
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )
        )}

        {activeTab === 'Access' && (
          <div className="space-y-3">
            {access_requests.length === 0 && !showArForm ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12">
                <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                <div className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>No Access Requests</div>
                <div className="text-[12px] text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                  Add requested tools and owners for this hire.
                </div>
              </div>
            ) : (
              access_requests.map((ar) => (
                <div
                  key={ar.id}
                  className="rounded-[10px] border px-[14px] py-3 flex items-center gap-3"
                  style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{ar.tool_name}</div>
                    <div className="text-[11px] mt-[1px]" style={{ color: 'var(--text-tertiary)' }}>
                      {ar.requested_from_name} · sent {fmtDate(ar.sent_at)}
                    </div>
                  </div>
                  <StatusBadge variant={accessVariant(ar.status)} label={ar.status} />
                  {ar.status !== 'granted' && (
                    <Button size="sm" variant="secondary" onClick={() => markGranted(ar.id)}>
                      Mark Granted
                    </Button>
                  )}
                </div>
              ))
            )}

            {!showArForm ? (
              <Button variant="secondary" size="sm" onClick={() => setShowArForm(true)}>
                <IconPlus size={13} /> Add Access Request
              </Button>
            ) : (
              <form onSubmit={addAccessRequest} className="rounded-[10px] border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}>
                <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>New Access Request</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input value={arForm.tool_name} onChange={(e) => setArForm((p) => ({ ...p, tool_name: e.target.value }))} placeholder="Tool Name" className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] text-sm" />
                  <Input value={arForm.requested_from_name} onChange={(e) => setArForm((p) => ({ ...p, requested_from_name: e.target.value }))} placeholder="Who to Ask" className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] text-sm" />
                  <Input value={arForm.requested_from_email} onChange={(e) => setArForm((p) => ({ ...p, requested_from_email: e.target.value }))} placeholder="Email" type="email" className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] text-sm" />
                  <Input value={arForm.requested_from_slack_id} onChange={(e) => setArForm((p) => ({ ...p, requested_from_slack_id: e.target.value }))} placeholder="Slack ID (optional)" className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] text-sm" />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={arSubmitting} size="sm">
                    {arSubmitting ? 'Adding...' : 'Add'}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setShowArForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
