'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Briefcase as IconBriefcase,
  Calendar as IconCalendar,
  CheckCircle2 as IconCheckCircle,
  ChevronDown as IconChevronDown,
  Clock3 as IconClock,
  Loader2 as IconLoader2,
  MoreVertical as IconDotsVertical,
  Pause as IconPlayerPause,
  Pencil as IconPencil,
  Play as IconPlayerPlay,
  Plus as IconPlus,
  RefreshCw as IconRefresh,
  RotateCcw as IconRotateCcw,
  ScanSearch as IconScanSearch,
  Search as IconSearch,
  Send as IconSend,
  Trash2 as IconTrash,
  Users as IconUsers,
  X as IconX,
} from 'lucide-react';
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
import { toast } from 'sonner';
import { NewHireForm, type EditableNewHire } from '@/components/new-hire-form';
import { ToolLogo } from '@/components/ToolLogo';
import { ToolNameCombobox } from '@/components/tool-name-combobox';
import { SlackUserPicker, type SlackUser } from '@/components/SlackUserPicker';
import { cn } from '@/components/ui/utils';
import {
  milestoneCheckLabel,
  milestoneEvidenceLabel,
  milestoneProofLabel,
  milestoneSourceLabel,
  type MilestoneCheckOutcome,
  type MilestoneCheckRun,
} from '@/lib/onboarding/milestone-checks';
import { normalizeMilestoneProgressStatus } from '@/lib/onboarding/milestone-ramp';
import type { AccessRequest, HireRole, HireStatus, MilestoneEvidenceType, NewHireMilestonePathItem, RampDelivery } from '@/types/onboarding';

type HireRow = {
  id: string;
  first_name: string;
  last_name: string;
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
    manager_name: string | null;
    manager_email: string | null;
    manager_slack_user_id: string | null;
    manager_chat_provider: string | null;
    manager_chat_target_id: string | null;
  };
  deliveries: RampDelivery[];
  access_requests: AccessRequest[];
  milestone_path: NewHireMilestonePathItem[];
  milestone_checks: MilestoneCheckRun[];
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDetailDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDetailDateTime(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function accessVariant(status: string) {
  if (status === 'confirmed') return 'delivered';
  if (status === 'granted') return 'delivered';
  if (status === 'sent' || status === 'acknowledged') return 'stalled';
  return 'pending';
}

function accessLabel(status: string) {
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'granted') return 'Granted';
  if (status === 'sent') return 'Sent';
  if (status === 'acknowledged') return 'Acknowledged';
  return 'Pending';
}

function progressVariant(status: string | null | undefined) {
  const normalized = normalizeMilestoneProgressStatus(status);
  if (normalized === 'verified') return 'delivered';
  if (normalized === 'blocked') return 'error';
  if (normalized === 'needs_review') return 'stalled';
  if (normalized === 'briefed') return 'upcoming';
  return 'pending';
}

function progressLabel(status: string | null | undefined) {
  const normalized = normalizeMilestoneProgressStatus(status);
  if (normalized === 'verified') return 'Verified';
  if (normalized === 'blocked') return 'Blocked';
  if (normalized === 'needs_review') return 'Needs Review';
  if (normalized === 'briefed') return 'Briefed';
  return 'Not Started';
}

function checkVariant(outcome: MilestoneCheckOutcome) {
  if (outcome === 'verified') return 'delivered';
  if (outcome === 'needs_review') return 'stalled';
  if (outcome === 'failed') return 'error';
  if (outcome === 'no_proof') return 'pending';
  return 'upcoming';
}

function evidenceVariant(evidenceType: MilestoneEvidenceType, needsManagerReview: boolean) {
  if (needsManagerReview) return 'stalled';
  if (evidenceType === 'new_hire_blocker') return 'error';
  if (evidenceType === 'manager_reopened') return 'upcoming';
  return 'delivered';
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  return typeof metadata[key] === 'string' ? String(metadata[key]).trim() : '';
}

function metadataFlag(metadata: Record<string, unknown>, key: string) {
  return metadata[key] === true;
}

function HireActionsMenu({
  hire,
  disabled,
  onEdit,
  onStatusChange,
  onDelete,
}: {
  hire: Pick<HireRow, 'id' | 'first_name' | 'last_name' | 'status'>;
  disabled?: boolean;
  onEdit: (hire: Pick<HireRow, 'id' | 'first_name' | 'last_name' | 'status'>) => void;
  onStatusChange: (hire: Pick<HireRow, 'id' | 'first_name' | 'last_name' | 'status'>, status: HireStatus) => void;
  onDelete: (hire: Pick<HireRow, 'id' | 'first_name' | 'last_name' | 'status'>) => void;
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
          aria-label={`Open settings for ${hire.first_name} ${hire.last_name}`}
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
          Delete Hire Path
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AutoChecksPanel({
  detail,
  checking,
  onCheck,
}: {
  detail: HireDetail;
  checking: boolean;
  onCheck: () => void;
}) {
  const latestCheck = detail.milestone_checks[0] ?? null;
  const needsReview = detail.milestone_path.filter((item) => (
    normalizeMilestoneProgressStatus(item.progress?.status) === 'needs_review'
  )).length;
  const verified = detail.milestone_path.filter((item) => (
    normalizeMilestoneProgressStatus(item.progress?.status) === 'verified'
  )).length;
  const open = Math.max(0, detail.milestone_path.length - verified);

  return (
    <section className="surface-panel-muted mb-5 overflow-hidden rounded-[8px] border" aria-labelledby="canon-checks-heading">
      <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[7px] bg-[var(--canon-purple-light)] text-[var(--canon-purple-dark)]">
            <IconScanSearch size={17} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="canon-checks-heading" className="type-section-title" style={{ color: 'var(--text-primary)' }}>
                Canon Checks
              </h2>
              {latestCheck && (
                <StatusBadge variant={checkVariant(latestCheck.outcome)} label={milestoneCheckLabel(latestCheck.outcome)} />
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 type-caption" style={{ color: 'var(--text-tertiary)' }}>
              <span className="inline-flex items-center gap-1.5">
                <IconClock size={13} aria-hidden="true" />
                {latestCheck ? `Last checked ${fmtDetailDateTime(latestCheck.completed_at)}` : 'No checks yet'}
              </span>
              {latestCheck?.sources_checked.map((source) => (
                <span key={source}>{milestoneSourceLabel(source)}</span>
              ))}
            </div>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={onCheck} disabled={checking || detail.hire.status !== 'active'}>
          {checking ? <IconLoader2 size={13} className="animate-spin" /> : <IconRefresh size={13} />}
          {checking ? 'Checking...' : 'Check Now'}
        </Button>
      </div>

      <div className="grid grid-cols-3 border-y border-[var(--border-tertiary)] bg-[var(--bg-primary)]">
        {[
          { label: 'Needs review', value: needsReview, color: needsReview > 0 ? 'var(--amber-text)' : 'var(--text-primary)' },
          { label: 'Verified', value: verified, color: 'var(--green-text)' },
          { label: 'Open', value: open, color: 'var(--text-primary)' },
        ].map((item, index) => (
          <div
            key={item.label}
            className={cn('min-w-0 px-4 py-3', index > 0 && 'border-l border-[var(--border-tertiary)]')}
          >
            <div className="type-metric-sm" style={{ color: item.color }}>{item.value}</div>
            <div className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>{item.label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2.5 px-4 py-3" role="status" aria-live="polite">
        {latestCheck?.outcome === 'verified'
          ? <IconCheckCircle size={16} className="mt-[2px] flex-shrink-0 text-[var(--green-text)]" aria-hidden="true" />
          : <IconScanSearch size={16} className="mt-[2px] flex-shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />}
        <p className="type-body leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
          {latestCheck?.summary ?? 'No checks have run for this hire yet.'}
        </p>
      </div>
    </section>
  );
}

export function NewHiresClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedHireId = searchParams.get('hire');
  const requestedTab = searchParams.get('tab');
  const [hires, setHires] = useState<HireRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<HireDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'Ramp Evidence' | 'Access'>(requestedTab === 'Access' ? 'Access' : 'Ramp Evidence');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingHire, setEditingHire] = useState<EditableNewHire | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Pick<HireRow, 'id' | 'first_name' | 'last_name' | 'status'> | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [milestoneActionId, setMilestoneActionId] = useState<string | null>(null);
  const [milestoneCheckRunning, setMilestoneCheckRunning] = useState(false);

  const [sendingRequestId, setSendingRequestId] = useState<string | null>(null);
  const [addAccessOpen, setAddAccessOpen] = useState(false);
  const [addAccessSaving, setAddAccessSaving] = useState(false);
  const [newAccess, setNewAccess] = useState({ tool_name: '', owner: null as SlackUser | null });
  const [editingRequest, setEditingRequest] = useState<AccessRequest | null>(null);
  const [editAccess, setEditAccess] = useState({ tool_name: '', owner: null as SlackUser | null });
  const [editAccessSaving, setEditAccessSaving] = useState(false);
  const [deletingRequest, setDeletingRequest] = useState<AccessRequest | null>(null);
  const [deleteRequestSaving, setDeleteRequestSaving] = useState(false);

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
    const params = new URLSearchParams(searchParams.toString());
    params.set('hire', hireId);
    router.replace(`/new-hires?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const filtered = hires.filter((h) => {
    const matchesFilter = filter === 'all' || h.status === filter;
    const matchesSearch = !search || `${h.first_name} ${h.last_name}`.toLowerCase().includes(search.toLowerCase()) || h.role.toLowerCase().includes(search.toLowerCase());
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

  async function updateHireStatus(hire: Pick<HireRow, 'id' | 'first_name' | 'last_name' | 'status'>, status: HireStatus) {
    setActionLoadingId(hire.id);
    try {
      const res = await fetch(`/api/onboarding/new-hires/${hire.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error('Something went wrong updating this hire. Please try again.');
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

  async function openEditModal(hire: Pick<HireRow, 'id' | 'first_name' | 'last_name' | 'status'>) {
    setActionLoadingId(hire.id);
    try {
      if (selectedDetail?.hire.id === hire.id) {
        setEditingHire(selectedDetail.hire);
        return;
      }

      const res = await fetch(`/api/onboarding/new-hires/${hire.id}`);
      const json = (await res.json()) as HireDetail & { error?: string };
      if (!res.ok) {
        toast.error('Unable to load hire details. Please try again.');
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
    try {
      const res = await fetch(`/api/onboarding/new-hires/${pendingDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Something went wrong removing this hire. Please try again.');
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

  async function reviewMilestone(
    item: NewHireMilestonePathItem,
    decision: 'verify' | 'keep_open' | 'mark_blocked' | 'unverify'
  ) {
    if (!selectedDetail) return;
    setMilestoneActionId(`${item.milestone.id}:${decision}`);
    try {
      const evidenceId = item.evidence.find((entry) => metadataFlag(entry.metadata, 'needs_manager_review'))?.id
        ?? item.evidence[0]?.id
        ?? null;
      const res = await fetch('/api/onboarding/milestone-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_hire_id: selectedDetail.hire.id,
          milestone_id: item.milestone.id,
          evidence_id: evidenceId,
          decision,
        }),
      });
      if (!res.ok) {
        toast.error('Canon could not save that review. Please try again.');
        return;
      }
      const detailRes = await fetch(`/api/onboarding/new-hires/${selectedDetail.hire.id}`);
      const detailJson = (await detailRes.json()) as HireDetail;
      setSelectedDetail(detailJson);
      if (decision === 'verify') toast.success('Learning step verified');
      if (decision === 'unverify') toast.success('Learning step reopened. Canon will continue watching.');
      if (decision === 'keep_open') toast.success('Kept open. Canon will continue watching.');
      if (decision === 'mark_blocked') toast.success('Learning step marked blocked');
    } finally {
      setMilestoneActionId(null);
    }
  }

  async function runMilestoneCheck() {
    if (!selectedDetail) return;
    setMilestoneCheckRunning(true);
    try {
      const res = await fetch('/api/onboarding/milestone-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_hire_id: selectedDetail.hire.id }),
      });
      const json = (await res.json()) as { check?: MilestoneCheckRun | null; error?: string };
      if (!res.ok) {
        toast.error(json.error ?? 'Canon could not finish this check. Please try again.');
        return;
      }

      const detailRes = await fetch(`/api/onboarding/new-hires/${selectedDetail.hire.id}`);
      const detailJson = (await detailRes.json()) as HireDetail;
      setSelectedDetail(detailJson);

      if (json.check?.outcome === 'needs_review') {
        toast.success('Canon found possible proof. Manager review is needed.');
      } else if (json.check?.outcome === 'failed') {
        toast.error('Canon could not finish this check. Please try again.');
      } else {
        toast.success('Check complete');
      }
    } finally {
      setMilestoneCheckRunning(false);
    }
  }

  async function sendRequest(requestId: string) {
    setSendingRequestId(requestId);
    try {
      const res = await fetch('/api/onboarding/access-requests/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessRequestId: requestId }),
      });
      if (!res.ok) {
        toast.error('Unable to send the access request right now. Please try again.');
        return;
      }
      toast.success('Request sent — the owner will receive a Slack DM shortly.');
      if (selectedDetail) {
        const detailRes = await fetch(`/api/onboarding/new-hires/${selectedDetail.hire.id}`);
        const detailJson = (await detailRes.json()) as HireDetail;
        setSelectedDetail(detailJson);
      }
    } finally {
      setSendingRequestId(null);
    }
  }

  async function addAccessRequest() {
    if (!selectedDetail || !newAccess.tool_name.trim()) return;
    setAddAccessSaving(true);
    try {
      const res = await fetch('/api/onboarding/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_hire_id: selectedDetail.hire.id,
          tool_name: newAccess.tool_name.trim(),
          requested_from_name: newAccess.owner?.name ?? null,
          requested_from_email: newAccess.owner?.email ?? null,
          requested_from_slack_id: newAccess.owner?.id ?? null,
        }),
      });
      if (!res.ok) throw new Error('add');
      setAddAccessOpen(false);
      setNewAccess({ tool_name: '', owner: null });
      const detailRes = await fetch(`/api/onboarding/new-hires/${selectedDetail.hire.id}`);
      const detailJson = (await detailRes.json()) as HireDetail;
      setSelectedDetail(detailJson);
      toast.success('Access request added');
    } catch {
      toast.error('Something went wrong adding the access request. Please try again.');
    } finally {
      setAddAccessSaving(false);
    }
  }

  function openEditRequest(request: AccessRequest) {
    setEditingRequest(request);
    setEditAccess({
      tool_name: request.tool_name,
      owner: request.requested_from_slack_id
        ? { id: request.requested_from_slack_id, name: request.requested_from_name ?? '', email: request.requested_from_email }
        : null,
    });
  }

  async function updateAccessRequest() {
    if (!editingRequest || !editAccess.tool_name) return;
    setEditAccessSaving(true);
    try {
      const res = await fetch('/api/onboarding/access-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRequest.id,
          tool_name: editAccess.tool_name,
          requested_from_name: editAccess.owner?.name ?? null,
          requested_from_email: editAccess.owner?.email ?? null,
          requested_from_slack_id: editAccess.owner?.id ?? null,
        }),
      });
      if (!res.ok) throw new Error('update');
      setEditingRequest(null);
      if (selectedDetail) {
        const detailRes = await fetch(`/api/onboarding/new-hires/${selectedDetail.hire.id}`);
        const detailJson = (await detailRes.json()) as HireDetail;
        setSelectedDetail(detailJson);
      }
      toast.success('Access request updated');
    } catch {
      toast.error('Something went wrong updating the access request. Please try again.');
    } finally {
      setEditAccessSaving(false);
    }
  }

  async function confirmDeleteRequest() {
    if (!deletingRequest || !selectedDetail) return;
    setDeleteRequestSaving(true);
    try {
      const res = await fetch(`/api/onboarding/access-requests?id=${deletingRequest.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete');
      setDeletingRequest(null);
      const detailRes = await fetch(`/api/onboarding/new-hires/${selectedDetail.hire.id}`);
      const detailJson = (await detailRes.json()) as HireDetail;
      setSelectedDetail(detailJson);
      toast.success('Access request removed');
    } catch {
      toast.error('Something went wrong removing the access request. Please try again.');
    } finally {
      setDeleteRequestSaving(false);
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
              Hire Paths{' '}
              <span className="type-caption font-normal tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{hires.length}</span>
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
              placeholder="Search Hire Paths..."
              className="h-8 border-[var(--border-tertiary)] bg-[var(--bg-primary)] pl-8 type-body"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12 px-6">
              <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
              <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>
                {hires.length === 0 ? 'No Hire Paths Yet' : 'No Results'}
              </div>
              <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                {hires.length === 0 ? 'Launch the first hire path to start tracking readiness.' : 'Try adjusting your search or filter.'}
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
                <Avatar name={`${hire.first_name} ${hire.last_name}`} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="type-panel-title truncate" style={{ color: 'var(--text-primary)' }}>{hire.first_name} {hire.last_name}</div>
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
              <div className="detail-page-header px-8 py-5 border-b">
                <Skeleton className="h-24 rounded-[10px] bg-[var(--bg-primary)]" />
              </div>
              <div className="px-8 py-6">
                <Skeleton className="h-96 rounded-[10px] bg-[var(--bg-primary)]" />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="detail-page-header px-8 py-5 border-b">
                <div className="flex items-start gap-5 mb-4">
                  <Avatar name={`${selectedDetail.hire.first_name} ${selectedDetail.hire.last_name}`} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="type-detail-title" style={{ color: 'var(--text-primary)' }}>{selectedDetail.hire.first_name} {selectedDetail.hire.last_name}</span>
                      <span
                        className="type-control px-[10px] py-[4px] rounded-[6px] text-[var(--text-on-accent)]"
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
                        {new Date(selectedDetail.hire.start_date) > new Date() ? 'Starts' : 'Started'} {fmtDate(selectedDetail.hire.start_date)}
                      </span>
                      {selectedDetail.hire.manager_name && (
                        <>
                          <span style={{ color: 'var(--border-secondary)' }}>·</span>
                          <span className="inline-flex items-center gap-2">
                            <IconUsers size={14} />
                            Manager: {selectedDetail.hire.manager_name}
                          </span>
                        </>
                      )}
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

                {selectedDetail.milestone_path.length > 0 && (
                  <MilestoneProgress
                    milestones={selectedDetail.milestone_path.map((item, index) => {
                      const status = normalizeMilestoneProgressStatus(item.progress?.status);
                      const firstOpenIndex = selectedDetail.milestone_path.findIndex((candidate) => (
                        normalizeMilestoneProgressStatus(candidate.progress?.status) !== 'verified'
                      ));
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
                )}
              </div>

              <Tabs
                value={activeTab}
                onValueChange={(value) => {
                  const tab = value as 'Ramp Evidence' | 'Access';
                  setActiveTab(tab);
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('tab', tab);
                  router.replace(`/new-hires?${params.toString()}`, { scroll: false });
                }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <TabsList className="split-tabbar border-b px-8">
                  {(['Ramp Evidence', 'Access'] as const).map((tab) => {
                    const count = tab === 'Ramp Evidence' ? selectedDetail.milestone_path.length : selectedDetail.access_requests.length;
                    const label = tab === 'Ramp Evidence' ? 'Proof of Progress' : tab;
                    return (
                      <TabsTrigger key={tab} value={tab} className="px-5 inline-flex items-center gap-2">
                        {label}
                        <span className="type-body opacity-80">{count}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                <div className="flex-1 overflow-y-auto px-8 py-6">
                  <TabsContent value="Ramp Evidence">
                    <AutoChecksPanel
                      detail={selectedDetail}
                      checking={milestoneCheckRunning}
                      onCheck={() => void runMilestoneCheck()}
                    />
                    {selectedDetail.milestone_path.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                        <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                        <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Learning Steps Yet</div>
                        <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                          Approved learning steps for this role will appear here.
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {selectedDetail.milestone_path.map((item) => {
                          const relatedDelivery = selectedDetail.deliveries.find((delivery) => delivery.milestone_id === item.milestone.id);
                          const evidence = item.evidence;
                          const status = normalizeMilestoneProgressStatus(item.progress?.status);
                          const needsReview = status === 'needs_review';
                          const milestoneBusy = milestoneActionId?.startsWith(`${item.milestone.id}:`) ?? false;
                          return (
                            <Card
                              key={item.milestone.id}
                              id={needsReview && selectedDetail.milestone_path.find((candidate) => (
                                normalizeMilestoneProgressStatus(candidate.progress?.status) === 'needs_review'
                              ))?.milestone.id === item.milestone.id ? 'needs-review' : undefined}
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
                                      {status === 'verified' && item.progress?.verified_at
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
                                    <div className="type-kicker mb-1" style={{ color: 'var(--text-tertiary)' }}>When This Step Matters</div>
                                    <p className="type-body" style={{ color: 'var(--text-secondary)' }}>{item.milestone.real_work_trigger}</p>
                                  </div>
                                )}
                                {item.required_tools.length > 0 && (
                                  <div className="mb-4 type-body" style={{ color: item.access_ready ? 'var(--green-text)' : 'var(--text-tertiary)' }}>
                                    Tool access: {item.required_tools.join(', ')} {item.access_ready ? 'ready' : 'waiting'}
                                  </div>
                                )}
                                {evidence.length > 0 ? (
                                  <div className="flex flex-col gap-2">
                                    {evidence.slice(0, 3).map((entry) => {
                                      const managerReviewNeeded = metadataFlag(entry.metadata, 'needs_manager_review');
                                      const reason = metadataText(entry.metadata, 'reason');
                                      const excerpt = metadataText(entry.metadata, 'excerpt');
                                      const proofLabel = milestoneProofLabel({
                                        evidenceType: entry.evidence_type,
                                        confidence: entry.confidence,
                                        needsManagerReview: managerReviewNeeded,
                                      });

                                      return (
                                        <div key={entry.id} className="surface-panel-subtle rounded-[8px] border px-3 py-3">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="type-body-strong" style={{ color: 'var(--text-primary)' }}>
                                              {milestoneEvidenceLabel(entry.evidence_type)}
                                            </div>
                                            <StatusBadge
                                              variant={evidenceVariant(entry.evidence_type, managerReviewNeeded)}
                                              label={proofLabel}
                                            />
                                          </div>
                                          <div className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>
                                            {milestoneSourceLabel(entry.source)} - {fmtDetailDate(entry.created_at)}
                                          </div>
                                          {reason && (
                                            <div className="mt-3">
                                              <div className="type-kicker mb-1" style={{ color: 'var(--text-tertiary)' }}>Why Canon Flagged This</div>
                                              <p className="type-body leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>{reason}</p>
                                            </div>
                                          )}
                                          {excerpt && (
                                            <blockquote className="mt-3 border-l-2 border-[var(--canon-purple-border)] pl-3 type-caption leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                                              {excerpt}
                                            </blockquote>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="type-body leading-[1.65]" style={{ color: 'var(--text-tertiary)' }}>
                                    Proof will appear when Canon sees real work or a manager confirms this step.
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
                                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-tertiary)] pt-4">
                                  {status === 'verified' ? (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => void reviewMilestone(item, 'unverify')}
                                      disabled={milestoneBusy}
                                    >
                                      {milestoneActionId === `${item.milestone.id}:unverify`
                                        ? <IconLoader2 size={13} className="animate-spin" />
                                        : <IconRotateCcw size={13} />}
                                      Reopen Step
                                    </Button>
                                  ) : (
                                    <>
                                      <Button
                                        size="sm"
                                        variant={needsReview ? 'default' : 'secondary'}
                                        onClick={() => void reviewMilestone(item, 'verify')}
                                        disabled={milestoneBusy}
                                      >
                                        {milestoneActionId === `${item.milestone.id}:verify`
                                          ? <IconLoader2 size={13} className="animate-spin" />
                                          : <IconCheckCircle size={13} />}
                                        {needsReview ? 'Verify' : 'Mark Complete'}
                                      </Button>
                                      {needsReview && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => void reviewMilestone(item, 'keep_open')}
                                            disabled={milestoneBusy}
                                          >
                                            {milestoneActionId === `${item.milestone.id}:keep_open` && (
                                              <IconLoader2 size={13} className="animate-spin" />
                                            )}
                                            Keep Open
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-[var(--red-text)] hover:text-[var(--red-text)]"
                                            onClick={() => void reviewMilestone(item, 'mark_blocked')}
                                            disabled={milestoneBusy}
                                          >
                                            {milestoneActionId === `${item.milestone.id}:mark_blocked` && (
                                              <IconLoader2 size={13} className="animate-spin" />
                                            )}
                                            Mark Blocked
                                          </Button>
                                        </>
                                      )}
                                    </>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="Access">
                    <div className="flex items-center justify-between mb-4">
                      <p className="type-body" style={{ color: 'var(--text-tertiary)' }}>
                        {selectedDetail.access_requests.length === 0 ? '' : `${selectedDetail.access_requests.length} tool${selectedDetail.access_requests.length === 1 ? '' : 's'}`}
                      </p>
                      <Button size="sm" variant="secondary" onClick={() => setAddAccessOpen(true)}>
                        <IconPlus size={13} /> Add Tool
                      </Button>
                    </div>
                    {selectedDetail.access_requests.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-12">
                        <IconUsers size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                        <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Access Requests</div>
                        <Button asChild size="sm" variant="secondary">
                          <Link href="/settings?tab=tools">Configure Tools</Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {selectedDetail.access_requests.map((request) => (
                          <Card key={request.id} className="flex items-center gap-4 px-4 py-4">
                            <ToolLogo toolName={request.tool_name} size={18} containerSize={34} borderRadius={8} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="type-card-title" style={{ color: 'var(--text-primary)' }}>{request.tool_name}</span>
                                {request.resent_at
                                  ? <StatusBadge variant="upcoming" label="Re-sent" />
                                  : <StatusBadge variant={accessVariant(request.status)} label={accessLabel(request.status)} />}
                              </div>
                              <div className="type-body mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>
                                {request.requested_from_name
                                  ? `${request.requested_from_name} · `
                                  : 'No owner set · '}
                                {request.confirmed_at
                                  ? `Confirmed ${fmtDetailDateTime(request.confirmed_at)}`
                                  : request.granted_at
                                    ? `Granted ${fmtDetailDateTime(request.granted_at)}`
                                    : request.resent_at
                                      ? `Re-sent ${fmtDetailDateTime(request.resent_at)} · Sent ${fmtDetailDate(request.sent_at)}`
                                      : request.sent_at
                                        ? `Sent ${fmtDetailDateTime(request.sent_at)}`
                                        : 'Not yet sent'}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {(request.status === 'pending' || request.status === 'sent') && request.requested_from_slack_id && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => void sendRequest(request.id)}
                                  disabled={sendingRequestId === request.id}
                                >
                                  {sendingRequestId === request.id
                                    ? <IconLoader2 size={13} className="animate-spin" />
                                    : <IconSend size={13} />}
                                  {request.status === 'sent' ? 'Resend' : 'Send Request'}
                                </Button>
                              )}
                              <button
                                type="button"
                                onClick={() => openEditRequest(request)}
                                className="flex-shrink-0 opacity-40 hover:opacity-80 transition-opacity p-1"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                <IconPencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingRequest(request)}
                                className="flex-shrink-0 opacity-40 hover:opacity-80 transition-opacity p-1"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                <IconX size={14} />
                              </button>
                            </div>
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
            <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>Select a Hire Path</div>
            <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
              Choose a hire path from the list to review readiness progress.
            </div>
          </div>
        )}
      </div>
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="h-[min(780px,calc(100vh-2rem))] max-h-none max-w-[920px] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-6 py-5 pr-16">
            <DialogTitle>Launch Hire Path</DialogTitle>
            <DialogDescription>
              Set the hire, ramp role, and manager review route in one pass.
            </DialogDescription>
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
        <DialogContent className="h-[min(780px,calc(100vh-2rem))] max-h-none max-w-[920px] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-6 py-5 pr-16">
            <DialogTitle>Edit Hire Path</DialogTitle>
            <DialogDescription>
              Update this hire&apos;s profile and readiness start details.
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
      <Dialog open={deletingRequest !== null} onOpenChange={(open) => !open && setDeletingRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Tool</DialogTitle>
            <DialogDescription>
              Remove <strong>{deletingRequest?.tool_name}</strong> from this hire&apos;s access list? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeletingRequest(null)} disabled={deleteRequestSaving}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteRequest()} disabled={deleteRequestSaving}>
              {deleteRequestSaving ? <IconLoader2 size={13} className="animate-spin" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingRequest !== null} onOpenChange={(open) => !open && setEditingRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Tool Access</DialogTitle>
            <DialogDescription>Update the tool or owner for this access request.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
                Tool Name <span style={{ color: 'var(--red-text)' }}>*</span>
              </label>
              <ToolNameCombobox
                value={editAccess.tool_name}
                onChange={(toolName) => setEditAccess((p) => ({ ...p, tool_name: toolName }))}
              />
            </div>
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>Owner</label>
              <SlackUserPicker
                value={editAccess.owner}
                onChange={(user) => setEditAccess((p) => ({ ...p, owner: user }))}
                placeholder="Search workspace members..."
              />
              <p className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>Canon will DM this person to request access.</p>
            </div>
            {editAccess.owner && (
              <div>
                <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>Owner Slack ID</label>
                <Input value={editAccess.owner.id} readOnly />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditingRequest(null)} disabled={editAccessSaving}>Cancel</Button>
            <Button onClick={() => void updateAccessRequest()} disabled={editAccessSaving || !editAccess.tool_name}>
              {editAccessSaving ? <IconLoader2 size={13} className="animate-spin" /> : <IconPencil size={13} />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addAccessOpen} onOpenChange={setAddAccessOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Tool Access</DialogTitle>
            <DialogDescription>
              Add a tool this hire needs access to. If you set a Slack ID, Canon will send the owner a DM immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
                Tool Name <span style={{ color: 'var(--red-text)' }}>*</span>
              </label>
              <ToolNameCombobox
                value={newAccess.tool_name}
                onChange={(toolName) => setNewAccess((p) => ({ ...p, tool_name: toolName }))}
              />
            </div>
            <div>
              <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>Owner</label>
              <SlackUserPicker
                value={newAccess.owner}
                onChange={(user) => setNewAccess((p) => ({ ...p, owner: user }))}
                placeholder="Search workspace members..."
              />
              <p className="type-caption mt-1" style={{ color: 'var(--text-tertiary)' }}>Canon will DM this person to request access.</p>
            </div>
            {newAccess.owner && (
              <div>
                <label className="block type-body font-medium mb-[5px]" style={{ color: 'var(--text-secondary)' }}>
                  Owner Slack ID
                </label>
                <Input value={newAccess.owner.id} readOnly />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddAccessOpen(false)} disabled={addAccessSaving}>Cancel</Button>
            <Button onClick={() => void addAccessRequest()} disabled={addAccessSaving || !newAccess.tool_name.trim()}>
              {addAccessSaving ? <IconLoader2 size={13} className="animate-spin" /> : <IconPlus size={13} />}
              Add Tool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Hire Path</DialogTitle>
            <DialogDescription>
              Delete {pendingDelete?.first_name} {pendingDelete?.last_name}&apos;s hire path? This removes the hire, briefings, progress proof, and tool requests from Canon.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPendingDelete(null)} disabled={actionLoadingId === pendingDelete?.id}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={deleteHire} disabled={actionLoadingId === pendingDelete?.id}>
              {actionLoadingId === pendingDelete?.id ? 'Deleting...' : 'Delete Hire Path'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
