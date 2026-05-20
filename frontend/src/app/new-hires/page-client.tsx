'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  IconBriefcase,
  IconCalendar,
  IconChevronDown,
  IconPlus,
  IconSearch,
  IconUsers,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { MilestoneProgress } from '@/components/ui/milestone-progress';
import { cn } from '@/components/ui/utils';
import type { AccessRequest, HireStatus, RampDelivery } from '@/types/onboarding';

const MILESTONE_DAYS = [1, 7, 14, 30, 45, 60, 90];

type HireRow = {
  id: string;
  name: string;
  role: string;
  start_date: string;
  ramp_day: number;
  status: HireStatus;
};

type Filter = 'all' | HireStatus;

type HireDetail = {
  hire: HireRow & {
    email: string;
    slack_user_id: string | null;
  };
  deliveries: RampDelivery[];
  access_requests: AccessRequest[];
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDetailDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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

export function NewHiresClient() {
  const [hires, setHires] = useState<HireRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<HireDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'Deliveries' | 'Access'>('Deliveries');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/new-hires');
      const data = (await res.json()) as { hires?: HireRow[] };
      const nextHires = data.hires ?? [];
      setHires(nextHires);
      setSelectedId((current) => current ?? nextHires[0]?.id ?? null);
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

  const selectedHire = (selectedId ? filtered.find((h) => h.id === selectedId) : null) ?? filtered[0] ?? null;

  useEffect(() => {
    if (!selectedHire?.id) {
      setSelectedDetail(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setActiveTab('Deliveries');

    async function loadSelectedHire() {
      try {
        const res = await fetch(`/api/onboarding/new-hires/${selectedHire.id}`);
        const json = (await res.json()) as HireDetail;
        if (!cancelled) setSelectedDetail(json);
      } catch {
        if (!cancelled) setSelectedDetail(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadSelectedHire();

    return () => {
      cancelled = true;
    };
  }, [selectedHire?.id]);

  const filters: { label: string; value: Filter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Paused', value: 'paused' },
    { label: 'Done', value: 'completed' },
  ];

  if (loading) {
    return (
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[300px] flex-shrink-0 border-r p-4 space-y-3" style={{ borderColor: 'var(--border-tertiary)' }}>
          <Skeleton className="h-8 bg-[var(--bg-primary)]" />
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-[10px] bg-[var(--bg-primary)]" />)}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-full rounded-[10px] bg-[var(--bg-primary)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div
        className="w-[300px] flex-shrink-0 border-r flex flex-col overflow-hidden"
        style={{ borderColor: 'var(--border-tertiary)' }}
      >
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[18px] font-medium" style={{ color: 'var(--text-primary)' }}>
              New Hires{' '}
              <span className="text-[13px] font-normal" style={{ color: 'var(--text-tertiary)' }}>{hires.length}</span>
            </span>
            <Link href="/new-hires/new">
              <Button size="sm"><IconPlus size={13} /> Add</Button>
            </Link>
          </div>
          <div className="flex gap-1">
            {filters.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilter(tab.value)}
                className={cn(
                  'text-[12px] px-[10px] py-1 rounded-[5px] border transition-colors duration-[120ms]',
                  filter === tab.value ? 'font-medium' : ''
                )}
                style={{
                  backgroundColor: filter === tab.value ? 'var(--bg-primary)' : 'transparent',
                  color: filter === tab.value ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderColor: filter === tab.value ? 'var(--border-secondary)' : 'var(--border-tertiary)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative mt-3">
            <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Hires..."
              className="input-ui h-8 rounded-[7px] border pl-8 text-[12px]"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-tertiary)',
              }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12 px-6">
              <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
              <div className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                {hires.length === 0 ? 'No Hires Yet' : 'No Results'}
              </div>
              <div className="text-[12px] text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                {hires.length === 0 ? 'Add your first new hire to start onboarding.' : 'Try adjusting your search or filter.'}
              </div>
            </div>
          ) : (
            filtered.map((hire) => (
              <div
                key={hire.id}
                onClick={() => setSelectedId(hire.id)}
                className="flex items-center gap-[10px] py-[11px] border-b cursor-pointer transition-colors duration-[120ms]"
                style={{
                  padding: '11px 14px',
                  borderColor: 'var(--border-tertiary)',
                  backgroundColor: selectedId === hire.id ? 'rgba(107,92,231,0.10)' : undefined,
                  borderLeft: selectedId === hire.id ? '3px solid var(--canon-purple)' : undefined,
                }}
                onMouseEnter={(e) => { if (selectedId !== hire.id) e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
                onMouseLeave={(e) => { if (selectedId !== hire.id) e.currentTarget.style.backgroundColor = ''; }}
              >
                <Avatar name={hire.name} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{hire.name}</div>
                  <div className="text-[11px] mt-[1px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {hire.role} · {fmtDate(hire.start_date)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>D{hire.ramp_day}</span>
                  <StatusBadge variant={hire.status} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-hidden">
        {selectedHire ? (
          detailLoading || !selectedDetail ? (
            <div className="flex h-full flex-col">
              <div className="px-10 pt-8 pb-6 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
                <Skeleton className="h-24 rounded-[10px] bg-[var(--bg-primary)]" />
              </div>
              <div className="px-10 py-8">
                <Skeleton className="h-96 rounded-[10px] bg-[var(--bg-primary)]" />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="px-10 pt-8 pb-6 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
                <div className="flex items-start gap-6 mb-6">
                  <Avatar name={selectedDetail.hire.name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[24px] font-medium leading-none" style={{ color: 'var(--text-primary)' }}>{selectedDetail.hire.name}</span>
                      <span
                        className="text-[12px] font-medium px-[10px] py-[4px] rounded-[6px] text-[var(--text-primary)]"
                        style={{ backgroundColor: 'var(--canon-purple)' }}
                      >
                        Day {selectedDetail.hire.ramp_day}
                      </span>
                      <StatusBadge variant={selectedDetail.hire.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-4 text-[14px]" style={{ color: 'var(--text-secondary)' }}>
                      <span className="inline-flex items-center gap-2">
                        <IconBriefcase size={16} />
                        {selectedDetail.hire.role}
                      </span>
                      <span style={{ color: 'var(--border-secondary)' }}>·</span>
                      <span className="inline-flex items-center gap-2">
                        <IconCalendar size={16} />
                        Started {fmtDate(selectedDetail.hire.start_date)}
                      </span>
                    </div>
                  </div>
                </div>

                <MilestoneProgress
                  milestones={MILESTONE_DAYS.map((day) => ({
                    label: `D${day}`,
                    status: day < selectedDetail.hire.ramp_day ? 'done' as const : day === selectedDetail.hire.ramp_day ? 'current' as const : 'pending' as const,
                  }))}
                  progress={Math.min(100, (selectedDetail.hire.ramp_day / 90) * 100)}
                />
              </div>

              <div className="flex border-b px-10" style={{ borderColor: 'var(--border-tertiary)' }}>
                {(['Deliveries', 'Access'] as const).map((tab) => {
                  const count = tab === 'Deliveries' ? selectedDetail.deliveries.length : selectedDetail.access_requests.length;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className="text-[16px] px-7 py-4 border-b-2 -mb-px transition-colors duration-[120ms]"
                      style={{
                        color: activeTab === tab ? 'var(--canon-purple)' : 'var(--text-secondary)',
                        borderBottomColor: activeTab === tab ? 'var(--canon-purple)' : 'transparent',
                        fontWeight: activeTab === tab ? 500 : 400,
                      }}
                    >
                      {tab}
                      <span className="block text-[12px] mt-[2px] opacity-80">{count}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 overflow-y-auto px-10 py-8">
                {activeTab === 'Deliveries' && (
                  selectedDetail.deliveries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                      <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                      <div className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>No Deliveries Yet</div>
                      <div className="text-[12px] text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                        Deliveries appear when ramp milestones are reached.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {selectedDetail.deliveries.map((delivery) => {
                        const delivered = delivery.delivery_status === 'delivered';
                        return (
                          <div
                            key={delivery.id}
                            className="overflow-hidden rounded-[10px] border transition-colors duration-[120ms]"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-tertiary)'; }}
                          >
                            <div className="flex items-start gap-5 px-7 py-6">
                              <div className="pt-1">
                                <StatusBadge variant={deliveryVariant(delivery.delivery_status)} label={delivered ? 'Delivered' : delivery.delivery_status === 'failed' ? 'Failed' : 'Upcoming'} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="text-[20px] font-medium leading-[1.25]" style={{ color: 'var(--text-primary)' }}>
                                    {delivery.milestone ? `Day ${delivery.milestone.day_trigger} - ${delivery.milestone.title}` : 'Ramp Delivery'}
                                  </div>
                                  <div className="text-[13px] whitespace-nowrap pt-1" style={{ color: 'var(--text-tertiary)' }}>
                                    {fmtDetailDate(delivery.delivered_at ?? delivery.created_at)}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="px-7 pb-6 pt-5 border-t" style={{ borderColor: 'var(--border-tertiary)' }}>
                              <p className="text-[15px] leading-[1.65]" style={{ color: delivered ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                                {delivery.content_delivered ?? delivery.error_message ?? 'This delivery has not been generated yet.'}
                              </p>
                              {delivered && (
                                <button className="text-[13px] flex items-center gap-[4px] mt-5 cursor-pointer" style={{ color: 'var(--canon-purple)' }}>
                                  <IconChevronDown size={13} /> Read Full Message
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {activeTab === 'Access' && (
                  selectedDetail.access_requests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                      <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                      <div className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>No Access Requests</div>
                      <div className="text-[12px] text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                        Access requests for this hire will appear here.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedDetail.access_requests.map((request) => (
                        <div
                          key={request.id}
                          className="rounded-[10px] border px-5 py-4 flex items-center gap-4"
                          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>{request.tool_name}</div>
                            <div className="text-[12px] mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>
                              {request.requested_from_name} · Sent {fmtDetailDate(request.sent_at)}
                            </div>
                          </div>
                          <StatusBadge variant={accessVariant(request.status)} label={request.status} />
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
            <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
            <div className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>Select a Hire</div>
            <div className="text-[12px] text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
              Choose a new hire from the list to preview their ramp.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
