'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconLockOpen,
  IconPlus,
  IconSend,
  IconUsers,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/status-badge';

type HireRow = {
  id: string;
  name: string;
  role: string;
  start_date: string;
  ramp_day: number;
  status: string;
  ramp_deliveries?: [{ count: number }];
};

type AccessRow = {
  id: string;
  tool_name: string;
  requested_from_name: string | null;
  sent_at: string | null;
  status: string;
  new_hire_name: string;
};

type DashboardData = {
  active_hires: HireRow[];
  all_hires_count: number;
  total_deliveries: number;
  pending_access_count: number;
  stalled_requests: AccessRow[];
};

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
      const accessJson = (await accessRes.json()) as {
        access_requests?: Array<{
          id: string;
          tool_name: string;
          requested_from_name: string | null;
          sent_at: string | null;
          status: string;
          new_hire_id: string;
        }>;
      };

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

      const totalDeliveries = allHires.reduce((sum, h) => {
        const count = h.ramp_deliveries?.[0]?.count ?? 0;
        return sum + count;
      }, 0);

      setData({
        active_hires: activeHires,
        all_hires_count: allHires.length,
        total_deliveries: totalDeliveries,
        pending_access_count: allRequests.filter((r) => r.status === 'pending' || r.status === 'sent').length,
        stalled_requests: stalled,
      });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const stats = [
    {
      label: 'Active Hires',
      value: data?.active_hires.length ?? 0,
      icon: IconUsers,
      iconBg: 'var(--canon-purple-light)',
      iconColor: 'var(--canon-purple)',
      delta: `+${data?.active_hires.length ?? 0}`,
      deltaLabel: 'Currently Active',
      deltaColor: 'var(--green-text)',
      href: '/new-hires',
    },
    {
      label: 'Deliveries Sent',
      value: data?.total_deliveries ?? 0,
      icon: IconSend,
      iconBg: 'var(--green-bg)',
      iconColor: 'var(--green)',
      delta: '100%',
      deltaLabel: 'Delivery Tracking',
      deltaColor: 'var(--green-text)',
      href: null,
    },
    {
      label: 'Pending Access',
      value: data?.pending_access_count ?? 0,
      icon: IconLockOpen,
      iconBg: 'var(--amber-bg)',
      iconColor: 'var(--amber)',
      delta: `${data?.stalled_requests.length ?? 0} Stalled`,
      deltaLabel: 'Needs Action',
      deltaColor: 'var(--amber-text)',
      href: null,
    },
  ];

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
          <div className="space-y-2">
            <Skeleton className="h-6 w-32 bg-[var(--bg-primary)]" />
            <Skeleton className="h-4 w-28 bg-[var(--bg-primary)]" />
          </div>
          <Skeleton className="h-8 w-24 bg-[var(--bg-primary)]" />
        </div>
        <div className="grid grid-cols-3 gap-3 p-6 pb-0">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[10px] bg-[var(--bg-primary)]" />)}
        </div>
        <div className="grid gap-4 p-6 pt-5 flex-1" style={{ gridTemplateColumns: 'minmax(520px, 1fr) 340px' }}>
          <Skeleton className="rounded-[10px] bg-[var(--bg-primary)]" />
          <Skeleton className="rounded-[10px] bg-[var(--bg-primary)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
        <div>
          <h1 className="type-page-title" style={{ color: 'var(--text-primary)' }}>Dashboard</h1>
          <p className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>{formattedDate}</p>
        </div>
        <Link href="/new-hires/new">
          <Button size="sm"><IconPlus size={14} /> Add Hire</Button>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 p-6 pb-0">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const card = (
            <div className="rounded-[10px] p-4 border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}>
              <div className="flex items-center justify-between mb-[10px]">
                <span className="type-caption font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-secondary)' }}>
                  {stat.label}
                </span>
                <div className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center" style={{ backgroundColor: stat.iconBg }}>
                  <Icon size={15} style={{ color: stat.iconColor }} />
                </div>
              </div>
              <div className="type-metric mb-[6px]" style={{ color: 'var(--text-primary)' }}>{stat.value}</div>
              <div className="type-body flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                <span style={{ color: stat.deltaColor, fontWeight: 500 }}>{stat.delta}</span> {stat.deltaLabel}
              </div>
            </div>
          );
          return stat.href ? <Link key={stat.label} href={stat.href}>{card}</Link> : <div key={stat.label}>{card}</div>;
        })}
      </div>

      <div className="grid gap-4 p-6 pt-5 flex-1 overflow-hidden" style={{ gridTemplateColumns: 'minmax(520px, 1fr) 340px' }}>
        <div
          className="overflow-hidden rounded-[10px] border"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}
        >
          <div className="flex items-center justify-between px-4 py-[14px] border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
            <span className="type-panel-title" style={{ color: 'var(--text-primary)' }}>Active Hires</span>
            <Link href="/new-hires" className="type-body flex items-center gap-1" style={{ color: 'var(--canon-purple)' }}>
              View All <IconArrowRight size={12} />
            </Link>
          </div>

          {data?.active_hires.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12">
              <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
              <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Active Hires</div>
              <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                Add a new hire to begin tracking their ramp.
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto">
              {data?.active_hires.map((hire) => (
                <Link
                  key={hire.id}
                  href={`/new-hires?hire=${hire.id}`}
                  className="flex items-center gap-3 px-4 py-[11px] border-b cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--bg-secondary)]"
                  style={{ borderColor: 'var(--border-tertiary)' }}
                >
                  <Avatar name={hire.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="type-panel-title truncate" style={{ color: 'var(--text-primary)' }}>{hire.name}</div>
                    <div className="type-caption mt-[1px] truncate" style={{ color: 'var(--text-tertiary)' }}>{hire.role}</div>
                  </div>
                  <div className="w-[120px] flex-shrink-0">
                    <div className="h-1 rounded-sm" style={{ backgroundColor: 'var(--border-tertiary)' }}>
                      <div
                        className="h-full rounded-sm"
                        style={{
                          width: `${Math.min(100, (hire.ramp_day / 90) * 100)}%`,
                          background: 'var(--canon-purple-gradient)',
                        }}
                      />
                    </div>
                    <div className="type-caption mt-[3px]" style={{ color: 'var(--text-tertiary)' }}>D{hire.ramp_day}</div>
                  </div>
                  <div
                    className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                    style={{ backgroundColor: hire.status === 'active' ? 'var(--green)' : 'var(--amber)' }}
                  />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div
          className="w-[340px] flex-shrink-0 overflow-hidden rounded-[10px] border"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}
        >
          <div className="flex items-center justify-between px-4 py-[14px] border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
            <span className="type-panel-title" style={{ color: 'var(--text-primary)' }}>Needs Attention</span>
            <span className="type-caption" style={{ color: 'var(--text-tertiary)' }}>{data?.stalled_requests.length ?? 0} Items</span>
          </div>

          {data?.stalled_requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12 px-6">
              <IconLockOpen size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
              <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>All Current</div>
              <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                No stalled access requests need action.
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto">
              {data?.stalled_requests.map((req) => (
                <Link
                  key={req.id}
                  href="/access"
                  className="flex items-start gap-[10px] px-4 py-[11px] border-b cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors duration-[120ms]"
                  style={{ borderColor: 'var(--border-tertiary)' }}
                >
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-[1px]"
                    style={{ backgroundColor: 'var(--amber-bg)', color: 'var(--amber)' }}
                  >
                    <IconAlertTriangle size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="type-panel-title truncate" style={{ color: 'var(--text-primary)' }}>{req.tool_name}</div>
                    <div className="type-caption mt-[1px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {req.requested_from_name ? `${req.new_hire_name} · via ${req.requested_from_name}` : req.new_hire_name}
                    </div>
                  </div>
                  <StatusBadge variant="stalled" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
