'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  IconBriefcase,
  IconCalendar,
  IconChevronDown,
  IconDotsVertical,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { MilestoneProgress } from '@/components/ui/milestone-progress';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert } from '@/components/ui/alert';
import { NewHireForm, type EditableNewHire } from '@/components/new-hire-form';
import { cn } from '@/components/ui/utils';
import type { AccessRequest, HireRole, HireStatus, NewHireMilestonePathItem, RampDelivery } from '@/types/onboarding';

type HireRow = {
  id: string;
  name: string;
  role: HireRole;
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
  milestone_path: NewHireMilestonePathItem[];
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDetailDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function accessVariant(status: string) {
  if (status === 'granted') return 'delivered';
  if (status === 'sent' || status === 'acknowledged') return 'stalled';
  return 'pending';
}

function progressVariant(status: string | null | undefined) {
  if (status === 'verified') return 'delivered';
  if (status === 'evidence_detected') return 'stalled';
  if (status === 'briefed') return 'upcoming';
  return 'pending';
}

function progressLabel(status: string | null | undefined) {
  if (status === 'verified') return 'Verified';
  if (status === 'evidence_detected') return 'Evidence Detected';
  if (status === 'briefed') return 'Briefed';
  return 'Not Started';
}

function HireActionsMenu({
  hire,
  disabled,
  onEdit,
  onStatusChange,
  onDelete,
}: {
  hire: Pick<HireRow, 'id' | 'name' | 'status'>;
  disabled?: boolean;
  onEdit: (hire: Pick<HireRow, 'id' | 'name' | 'status'>) => void;
  onStatusChange: (hire: Pick<HireRow, 'id' | 'name' | 'status'>, status: HireStatus) => void;
  onDelete: (hire: Pick<HireRow, 'id' | 'name' | 'status'>) => void;
}) {
  const nextStatus = hire.status === 'active' ? 'paused' : 'active';
  const statusLabel = hire.status === 'active' ? 'Pause Hire' : 'Activate Hire';
  const StatusIcon = hire.status === 'active' ? IconPlayerPause : IconPlayerPlay;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Open settings for ${hire.name}`}
          className="w-7 h-7 rounded-md border border-[var(--border-tertiary)] bg-transparent flex items-center justify-center cursor-pointer text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconDotsVertical size={15} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(hire)}>
          <IconPencil size={14} />
          Edit Hire
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onStatusChange(hire, nextStatus)}>
          <StatusIcon size={14} />
          {statusLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-[var(--red-text)] focus:text-[var(--red-text)]" onClick={() => onDelete(hire)}>
          <IconTrash size={14} />
          Delete Hire
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NewHiresClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedHireId = searchParams.get('hire');
  const [hires, setHires] = useState<HireRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<HireDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'Ramp Evidence' | 'Access'>('Ramp Evidence');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingHire, setEditingHire] = useState<EditableNewHire | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Pick<HireRow, 'id' | 'name' | 'status'> | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [milestoneActionId, setMilestoneActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

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

  useEffect(() => {
    if (!requestedHireId) return;
    if (hires.some((hire) => hire.id === requestedHireId)) {
      setSelectedId(requestedHireId);
    }
  }, [hires, requestedHireId]);

  const selectHire = useCallback((hireId: string) => {
    setSelectedId(hireId);
    router.replace(`/new-hires?hire=${hireId}`, { scroll: false });
  }, [router]);

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
    setActiveTab('Ramp Evidence');

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

  async function updateHireStatus(hire: Pick<HireRow, 'id' | 'name' | 'status'>, status: HireStatus) {
    setActionLoadingId(hire.id);
    setActionError('');
    try {
      const res = await fetch(`/api/onboarding/new-hires/${hire.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionError(json.error ?? 'Failed to update hire.');
        return;
      }
      setSelectedDetail((current) => (
        current?.hire.id === hire.id
          ? { ...current, hire: { ...current.hire, status } }
          : current
      ));
      await load();
    } finally {
      setActionLoadingId(null);
    }
  }

  async function openEditModal(hire: Pick<HireRow, 'id' | 'name' | 'status'>) {
    setActionLoadingId(hire.id);
    setActionError('');
    try {
      if (selectedDetail?.hire.id === hire.id) {
        setEditingHire(selectedDetail.hire);
        return;
      }

      const res = await fetch(`/api/onboarding/new-hires/${hire.id}`);
      const json = (await res.json()) as HireDetail & { error?: string };
      if (!res.ok) {
        setActionError(json.error ?? 'Failed to load hire.');
        return;
      }
      setEditingHire(json.hire);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleHireUpdated(hire: EditableNewHire) {
    setEditingHire(null);
    setSelectedDetail((current) => (
      current?.hire.id === hire.id
        ? { ...current, hire: { ...current.hire, ...hire } }
        : current
    ));
    await load();
  }

  async function deleteHire() {
    if (!pendingDelete) return;
    setActionLoadingId(pendingDelete.id);
    setActionError('');
    try {
      const res = await fetch(`/api/onboarding/new-hires/${pendingDelete.id}`, { method: 'DELETE' });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionError(json.error ?? 'Failed to delete hire.');
        return;
      }
      setPendingDelete(null);
      setSelectedDetail(null);
      setSelectedId((current) => (current === pendingDelete.id ? null : current));
      await load();
    } finally {
      setActionLoadingId(null);
    }
  }

  async function verifyMilestone(item: NewHireMilestonePathItem) {
    if (!selectedDetail) return;
    setMilestoneActionId(item.milestone.id);
    setActionError('');
    try {
      const res = await fetch('/api/onboarding/milestone-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_hire_id: selectedDetail.hire.id,
          milestone_id: item.milestone.id,
          evidence_type: 'manager_verification',
          trust_level: 'high',
          confidence: 0.95,
          source: 'manager_review',
          source_event_id: `manager-review:${selectedDetail.hire.id}:${item.milestone.id}`,
          metadata: { reviewed_from: 'new_hires_detail' },
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionError(json.error ?? 'Failed to verify milestone.');
        return;
      }
      const detailRes = await fetch(`/api/onboarding/new-hires/${selectedDetail.hire.id}`);
      const detailJson = (await detailRes.json()) as HireDetail;
      setSelectedDetail(detailJson);
    } finally {
      setMilestoneActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 overflow-hidden">
        <div className="split-sidebar flex w-[300px] flex-shrink-0 flex-col gap-3 border-r p-4">
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
      <div className="split-sidebar w-[300px] flex-shrink-0 border-r flex flex-col overflow-hidden">
        <div className="split-header p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <span className="type-metric-sm" style={{ color: 'var(--text-primary)' }}>
              New Hires{' '}
              <span className="type-page-subtitle font-normal" style={{ color: 'var(--text-tertiary)' }}>{hires.length}</span>
            </span>
            <Button size="sm" onClick={() => setShowAddModal(true)}><IconPlus size={13} /> Add</Button>
          </div>
          <div className="flex gap-1">
            {filters.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilter(tab.value)}
                className={cn(
                  'filter-chip type-body px-[10px] py-1 rounded-[5px] border',
                  filter === tab.value && 'filter-chip-selected font-medium'
                )}
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
              className="h-8 border-[var(--border-tertiary)] bg-[var(--bg-primary)] pl-8 type-body"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {actionError && (
            <Alert variant="destructive" className="mx-3 mt-3 px-3 py-2">
              {actionError}
            </Alert>
          )}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12 px-6">
              <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
              <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>
                {hires.length === 0 ? 'No Hires Yet' : 'No Results'}
              </div>
              <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                {hires.length === 0 ? 'Add your first new hire to start onboarding.' : 'Try adjusting your search or filter.'}
              </div>
            </div>
          ) : (
            filtered.map((hire) => (
              <div
                key={hire.id}
                role="button"
                tabIndex={0}
                onClick={() => selectHire(hire.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectHire(hire.id);
                  }
                }}
                className={cn(
                  'list-row flex items-center gap-[10px] py-[11px] border-b cursor-pointer',
                  selectedId === hire.id && 'list-row-selected'
                )}
                style={{
                  padding: '11px 14px',
                }}
              >
                <Avatar name={hire.name} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="type-panel-title truncate" style={{ color: 'var(--text-primary)' }}>{hire.name}</div>
                  <div className="type-caption mt-[1px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {hire.role} · {fmtDate(hire.start_date)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="type-caption font-medium" style={{ color: 'var(--text-secondary)' }}>D{hire.ramp_day}</span>
                  <StatusBadge variant={hire.status} />
                </div>
                <div onClick={(event) => event.stopPropagation()}>
                  <HireActionsMenu
                    hire={hire}
                    disabled={actionLoadingId === hire.id}
                    onEdit={openEditModal}
                    onStatusChange={updateHireStatus}
                    onDelete={setPendingDelete}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="surface-page flex-1 min-w-0 overflow-hidden">
        {selectedHire ? (
          detailLoading || !selectedDetail ? (
            <div className="flex h-full flex-col">
              <div className="split-header px-8 pt-6 pb-5 border-b">
                <Skeleton className="h-24 rounded-[10px] bg-[var(--bg-primary)]" />
              </div>
              <div className="px-8 py-6">
                <Skeleton className="h-96 rounded-[10px] bg-[var(--bg-primary)]" />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="split-header px-8 pt-6 pb-5 border-b">
                <div className="flex items-start gap-5 mb-5">
                  <Avatar name={selectedDetail.hire.name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="type-detail-title" style={{ color: 'var(--text-primary)' }}>{selectedDetail.hire.name}</span>
                      <span
                        className="type-control px-[10px] py-[4px] rounded-[6px] text-[var(--text-primary)]"
                        style={{ backgroundColor: 'var(--canon-purple)' }}
                      >
                        Day {selectedDetail.hire.ramp_day}
                      </span>
                      <StatusBadge variant={selectedDetail.hire.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-3 type-body-strong" style={{ color: 'var(--text-secondary)' }}>
                      <span className="inline-flex items-center gap-2">
                        <IconBriefcase size={14} />
                        {selectedDetail.hire.role}
                      </span>
                      <span style={{ color: 'var(--border-secondary)' }}>·</span>
                      <span className="inline-flex items-center gap-2">
                        <IconCalendar size={14} />
                        Started {fmtDate(selectedDetail.hire.start_date)}
                      </span>
                    </div>
                  </div>
                  <HireActionsMenu
                    hire={selectedDetail.hire}
                    disabled={actionLoadingId === selectedDetail.hire.id}
                    onEdit={openEditModal}
                    onStatusChange={updateHireStatus}
                    onDelete={setPendingDelete}
                  />
                </div>

                {selectedDetail.milestone_path.length > 0 ? (
                  <MilestoneProgress
                    milestones={selectedDetail.milestone_path.map((item, index) => {
                      const status = item.progress?.status;
                      const firstOpenIndex = selectedDetail.milestone_path.findIndex((candidate) => candidate.progress?.status !== 'verified');
                      return {
                        label: `D${item.milestone.day_trigger}`,
                        status: status === 'verified'
                          ? 'done' as const
                          : index === (firstOpenIndex === -1 ? selectedDetail.milestone_path.length - 1 : firstOpenIndex)
                            ? 'current' as const
                            : 'pending' as const,
                      };
                    })}
                    progress={Math.round((selectedDetail.milestone_path.filter((item) => item.progress?.status === 'verified').length / selectedDetail.milestone_path.length) * 100)}
                  />
                ) : (
                  <div className="rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-3 py-2 type-body text-[var(--text-tertiary)]">
                    No approved company milestones for this role yet.
                  </div>
                )}
              </div>

              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as 'Ramp Evidence' | 'Access')}
                className="flex min-h-0 flex-1 flex-col"
              >
                <TabsList className="split-tabbar border-b px-8">
                  {(['Ramp Evidence', 'Access'] as const).map((tab) => {
                    const count = tab === 'Ramp Evidence' ? selectedDetail.milestone_path.length : selectedDetail.access_requests.length;
                    return (
                      <TabsTrigger key={tab} value={tab} className="px-5">
                        {tab}
                        <span className="block type-body mt-[2px] opacity-80">{count}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                <div className="flex-1 overflow-y-auto px-8 py-6">
                  <TabsContent value="Ramp Evidence">
                    {selectedDetail.milestone_path.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                        <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                        <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Milestone Path Yet</div>
                        <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                          Approved milestones for this role will appear here.
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {selectedDetail.milestone_path.map((item) => {
                          const relatedDelivery = selectedDetail.deliveries.find((delivery) => delivery.milestone_id === item.milestone.id);
                          const evidence = item.evidence;
                          const status = item.progress?.status ?? 'not_started';
                          return (
                            <Card
                              key={item.milestone.id}
                              className="overflow-hidden transition-colors duration-[120ms] hover:border-[var(--border-secondary)]"
                            >
                              <CardHeader className="flex-row items-start gap-4 px-5 py-4">
                                <div className="pt-1">
                                  <StatusBadge variant={progressVariant(status)} label={progressLabel(status)} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="type-metric-sm leading-[1.3]" style={{ color: 'var(--text-primary)' }}>
                                      Day {item.milestone.day_trigger} - {item.milestone.title}
                                    </div>
                                    <div className="type-body whitespace-nowrap pt-1" style={{ color: 'var(--text-tertiary)' }}>
                                      {item.progress?.verified_at
                                        ? `Verified ${fmtDetailDate(item.progress.verified_at)}`
                                        : item.progress?.first_briefed_at
                                          ? `Briefed ${fmtDetailDate(item.progress.first_briefed_at)}`
                                          : 'Upcoming'}
                                    </div>
                                  </div>
                                  <p className="type-body mt-2 leading-[1.6]" style={{ color: 'var(--text-secondary)' }}>
                                    {item.milestone.capability_outcome ?? item.milestone.description}
                                  </p>
                                </div>
                              </CardHeader>
                              <CardContent className="surface-divider border-t px-5 pb-5 pt-4">
                                {item.milestone.real_work_trigger && (
                                  <div className="surface-panel-muted mb-4 rounded-[8px] px-3 py-2">
                                    <div className="type-kicker mb-1" style={{ color: 'var(--text-tertiary)' }}>Real Work Trigger</div>
                                    <p className="type-body" style={{ color: 'var(--text-secondary)' }}>{item.milestone.real_work_trigger}</p>
                                  </div>
                                )}
                                {item.required_tools.length > 0 && (
                                  <div className="mb-4 type-body" style={{ color: item.access_ready ? 'var(--green-text)' : 'var(--text-tertiary)' }}>
                                    Access readiness: {item.required_tools.join(', ')} {item.access_ready ? 'granted' : 'pending'}
                                  </div>
                                )}
                                {evidence.length > 0 ? (
                                  <div className="flex flex-col gap-2">
                                    {evidence.slice(0, 3).map((entry) => (
                                      <div key={entry.id} className="surface-panel-subtle rounded-[8px] border px-3 py-2">
                                        <div className="type-body-strong" style={{ color: 'var(--text-primary)' }}>
                                          {entry.evidence_type.replace(/_/g, ' ')} · {entry.trust_level} trust
                                        </div>
                                        <div className="type-caption mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>
                                          {Math.round(entry.confidence * 100)}% confidence · {fmtDetailDate(entry.created_at)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="type-body leading-[1.65]" style={{ color: 'var(--text-tertiary)' }}>
                                    Evidence will appear when Canon detects real work activity or a manager verifies this milestone.
                                  </p>
                                )}
                                {relatedDelivery?.content_delivered && (
                                  <details className="mt-4">
                                    <summary className="type-body cursor-pointer text-[var(--canon-purple)]">
                                      <IconChevronDown size={13} className="inline" /> Read Briefing
                                    </summary>
                                    <p className="type-body-strong mt-3 leading-[1.65]" style={{ color: 'var(--text-secondary)' }}>
                                      {relatedDelivery.content_delivered}
                                    </p>
                                  </details>
                                )}
                                {status !== 'verified' && (
                                  <div className="mt-4">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => verifyMilestone(item)}
                                      disabled={milestoneActionId === item.milestone.id}
                                    >
                                      {milestoneActionId === item.milestone.id ? 'Verifying...' : 'Manager Verify'}
                                    </Button>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="Access">
                    {selectedDetail.access_requests.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                        <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                        <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Access Requests</div>
                        <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                          Access requests for this hire will appear here.
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {selectedDetail.access_requests.map((request) => (
                          <Card key={request.id} className="flex items-center gap-4 px-5 py-4">
                            <div className="min-w-0 flex-1">
                              <div className="type-card-title" style={{ color: 'var(--text-primary)' }}>{request.tool_name}</div>
                              <div className="type-body mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>
                                {request.requested_from_name ? `${request.requested_from_name} · ` : ''}Sent {fmtDetailDate(request.sent_at)}
                              </div>
                            </div>
                            <StatusBadge variant={accessVariant(request.status)} label={request.status} />
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
            <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
            <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>Select a Hire</div>
            <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
              Choose a new hire from the list to preview their ramp.
            </div>
          </div>
        )}
      </div>
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Hire</DialogTitle>
          </DialogHeader>
          <NewHireForm
            onCreated={(hireId) => {
              setShowAddModal(false);
              selectHire(hireId);
              void load();
            }}
            onCancel={() => setShowAddModal(false)}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={editingHire !== null} onOpenChange={(open) => !open && setEditingHire(null)}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Hire</DialogTitle>
            <DialogDescription>
              Update this hire&apos;s profile and ramp start details.
            </DialogDescription>
          </DialogHeader>
          {editingHire && (
            <NewHireForm
              key={editingHire.id}
              initialHire={editingHire}
              onUpdated={(hire) => { void handleHireUpdated(hire); }}
              onCancel={() => setEditingHire(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Hire</DialogTitle>
            <DialogDescription>
              Delete {pendingDelete?.name}? This removes the hire, deliveries, and access requests from Canon.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPendingDelete(null)} disabled={actionLoadingId === pendingDelete?.id}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={deleteHire} disabled={actionLoadingId === pendingDelete?.id}>
              {actionLoadingId === pendingDelete?.id ? 'Deleting...' : 'Delete Hire'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
