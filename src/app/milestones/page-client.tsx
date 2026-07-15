'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  AlertTriangle as IconAlertTriangle,
  Brain as IconBrain,
  Check as IconCheck,
  Loader2 as IconLoader2,
  Pencil as IconEdit,
  Plus as IconPlus,
  Sparkles as IconSparkles,
  Target as IconTarget,
  Trash2 as IconTrash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { MilestoneCard } from '@/components/milestone-card';
import { cn } from '@/components/ui/utils';
import { activeRoleProfiles, roleAbbreviation, roleIconColor } from '@/lib/onboarding/roles';
import type { HireRole, MilestoneGenerationRun, MilestoneProposal, RampMilestone, RoleProfile } from '@/types/onboarding';

const MILESTONE_GENERATION_STORAGE_KEY = 'canon-milestone-generation-run';

type MilestoneForm = {
  role: HireRole;
  day_trigger: string;
  title: string;
  capability_outcome: string;
  briefing_goal: string;
  real_work_trigger: string;
  retrieval_brief: string;
  success_signals: string;
};

type ProposalEditForm = {
  day_trigger: string;
  title: string;
  capability_outcome: string;
  briefing_goal: string;
  real_work_trigger: string;
  retrieval_brief: string;
  success_signals: string;
};

type MilestonesResponse = {
  milestones?: RampMilestone[];
  proposals?: MilestoneProposal[];
  latest_generation?: MilestoneGenerationRun | null;
  error?: string;
};

type RoleProfilesResponse = {
  profiles?: RoleProfile[];
  error?: string;
};

const emptyForm = (role: HireRole): MilestoneForm => ({
  role,
  day_trigger: '',
  title: '',
  capability_outcome: '',
  briefing_goal: '',
  real_work_trigger: '',
  retrieval_brief: '',
  success_signals: '',
});

const milestoneForm = (milestone: RampMilestone): MilestoneForm => ({
  role: milestone.role,
  day_trigger: String(milestone.day_trigger),
  title: milestone.title,
  capability_outcome: milestone.capability_outcome ?? milestone.description,
  briefing_goal: milestone.briefing_goal ?? milestone.description,
  real_work_trigger: milestone.real_work_trigger ?? '',
  retrieval_brief: milestone.retrieval_brief ?? milestone.knowledge_query,
  success_signals: (milestone.success_signals ?? []).join('\n'),
});

const proposalToEditForm = (proposal: MilestoneProposal): ProposalEditForm => ({
  day_trigger: String(proposal.suggested_day_trigger),
  title: proposal.title,
  capability_outcome: proposal.capability_outcome,
  briefing_goal: proposal.briefing_goal,
  real_work_trigger: proposal.real_work_trigger,
  retrieval_brief: proposal.retrieval_brief,
  success_signals: proposal.success_signals.join('\n'),
});

function successSignals(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function roleProfileFor(profiles: RoleProfile[], role: HireRole) {
  return profiles.find((profile) => profile.role === role) ?? null;
}

function duplicateDays<T>(items: T[], dayForItem: (item: T) => number | null | undefined) {
  const counts = new Map<number, number>();
  for (const item of items) {
    const day = dayForItem(item);
    if (typeof day !== 'number') continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return new Set(Array.from(counts.entries()).flatMap(([day, count]) => count > 1 ? [day] : []));
}

function isGenerationActive(run: MilestoneGenerationRun | null | undefined) {
  return run?.status === 'queued' || run?.status === 'running';
}

function rememberGeneration(run: MilestoneGenerationRun) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MILESTONE_GENERATION_STORAGE_KEY, JSON.stringify({
    id: run.id,
    status: run.status,
    created_at: run.created_at,
  }));
}

function clearRememberedGeneration(runId?: string) {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(MILESTONE_GENERATION_STORAGE_KEY);
  if (!raw) return;

  if (!runId) {
    window.localStorage.removeItem(MILESTONE_GENERATION_STORAGE_KEY);
    return;
  }

  try {
    const saved = JSON.parse(raw) as { id?: string };
    if (saved.id === runId) window.localStorage.removeItem(MILESTONE_GENERATION_STORAGE_KEY);
  } catch {
    window.localStorage.removeItem(MILESTONE_GENERATION_STORAGE_KEY);
  }
}

function GenerationStatusPanel({
  run,
  starting,
}: {
  run: MilestoneGenerationRun | null;
  starting: boolean;
}) {
  const active = starting || isGenerationActive(run);
  if (!active) return null;

  const statusLabel = run?.status === 'running' ? 'Generating drafts' : 'Queued for generation';
  const detail = run?.status === 'running'
    ? 'Canon is reading your connected sources and preparing role-specific learning steps.'
    : 'Canon is waiting to start creating learning steps.';

  return (
    <div
      className="mb-5 rounded-[8px] border px-4 py-3"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--canon-purple-border)' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-[1px] flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[7px] bg-[var(--canon-purple-light)] text-[var(--canon-purple)]">
          <IconLoader2 size={15} className="animate-spin" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="type-panel-title text-[var(--text-primary)]">{statusLabel}</div>
          <p className="type-body mt-1 text-[var(--text-secondary)]">{detail}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-2 rounded-full bg-[var(--bg-secondary)]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  disabled,
  onApprove,
  onEdit,
  onReject,
  timingConflict,
}: {
  proposal: MilestoneProposal;
  disabled?: boolean;
  onApprove: (proposal: MilestoneProposal) => void;
  onEdit: (proposal: MilestoneProposal) => void;
  onReject: (proposal: MilestoneProposal) => void;
  timingConflict?: boolean;
}) {
  return (
    <div
      className="rounded-[10px] border p-4"
      style={{
        backgroundColor: timingConflict ? 'var(--amber-bg-subtle)' : 'var(--canon-purple-light)',
        borderColor: timingConflict ? 'var(--amber)' : 'var(--canon-purple-border)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-[2px] flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[7px] bg-[var(--bg-primary)]"
          style={{ color: timingConflict ? 'var(--amber)' : 'var(--canon-purple)' }}
        >
          {timingConflict ? <IconAlertTriangle size={15} /> : <IconSparkles size={15} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-caption font-medium text-[var(--canon-purple-dark)]">Draft · Day {proposal.suggested_day_trigger}</span>
            <span className="type-caption text-[var(--text-tertiary)]">{Math.round(proposal.confidence * 100)}% match</span>
            {timingConflict && (
              <span className="type-caption font-medium text-[var(--amber)]">Spacing issue</span>
            )}
          </div>
          <h3 className="type-card-title mt-1 text-[var(--text-primary)]">{proposal.title}</h3>
          <p className="type-card-body mt-2 line-clamp-2 text-[var(--text-secondary)]">{proposal.capability_outcome}</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="min-w-0 rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-3 py-2">
              <div className="type-kicker mb-1 text-[var(--text-tertiary)]">Trigger</div>
              <p className="type-body line-clamp-1 text-[var(--text-secondary)]">{proposal.real_work_trigger}</p>
            </div>
            <div className="min-w-0 rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-3 py-2">
              <div className="type-kicker mb-1 text-[var(--text-tertiary)]">Proof</div>
              <p className="type-body line-clamp-1 text-[var(--text-secondary)]">
                {proposal.evidence_requirements[0]?.label ?? proposal.success_signals[0] ?? 'Manager or tool evidence'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => onApprove(proposal)} disabled={disabled}>
              <IconCheck size={13} /> Approve
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onEdit(proposal)} disabled={disabled}>
              <IconEdit size={13} /> Edit
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onReject(proposal)} disabled={disabled}>
              <IconTrash size={13} /> Reject
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MilestonesClient() {
  const [milestones, setMilestones] = useState<RampMilestone[]>([]);
  const [proposals, setProposals] = useState<MilestoneProposal[]>([]);
  const [roleProfiles, setRoleProfiles] = useState<RoleProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState<HireRole>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<RampMilestone | null>(null);
  const [editForm, setEditForm] = useState<MilestoneForm>(emptyForm(''));
  const [pendingDelete, setPendingDelete] = useState<RampMilestone | null>(null);
  const [form, setForm] = useState<MilestoneForm>(emptyForm(''));
  const [submitting, setSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [generationStarting, setGenerationStarting] = useState(false);
  const [generationRun, setGenerationRun] = useState<MilestoneGenerationRun | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [editError, setEditError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [editingProposal, setEditingProposal] = useState<MilestoneProposal | null>(null);
  const [editProposalForm, setEditProposalForm] = useState<ProposalEditForm>({ day_trigger: '', title: '', capability_outcome: '', briefing_goal: '', real_work_trigger: '', retrieval_brief: '', success_signals: '' });
  const [editProposalSubmitting, setEditProposalSubmitting] = useState(false);
  const [editProposalError, setEditProposalError] = useState('');
  const [bulkAction, setBulkAction] = useState<'accept_all' | 'reject_all' | null>(null);
  const generationNoticeRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [milestoneRes, roleProfileRes] = await Promise.all([
        fetch('/api/onboarding/milestones'),
        fetch('/api/onboarding/role-profiles'),
      ]);
      const data = (await milestoneRes.json()) as MilestonesResponse;
      const profileData = (await roleProfileRes.json()) as RoleProfilesResponse;
      setMilestones(data.milestones ?? []);
      setProposals(data.proposals ?? []);
      setGenerationRun(data.latest_generation ?? null);
      const nextProfiles = profileData.profiles ?? [];
      setRoleProfiles(nextProfiles);
      const nextActiveProfiles = activeRoleProfiles(nextProfiles);
      if (nextActiveProfiles.length > 0 && !nextActiveProfiles.some((profile) => profile.role === activeRole)) {
        setActiveRole(nextActiveProfiles[0].role);
      } else if (nextActiveProfiles.length === 0 && activeRole) {
        setActiveRole('');
      }

      const latestGeneration = data.latest_generation ?? null;
      if (latestGeneration && isGenerationActive(latestGeneration)) {
        rememberGeneration(latestGeneration);
      } else if (latestGeneration?.status === 'completed' || latestGeneration?.status === 'failed') {
        clearRememberedGeneration(latestGeneration.id);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [activeRole]);

  useEffect(() => { void load(); }, [load]);

  function setField(field: keyof MilestoneForm, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function setEditField(field: keyof MilestoneForm, value: string) {
    setEditForm((p) => ({ ...p, [field]: value }));
  }

  function openEdit(milestone: RampMilestone) {
    setEditError('');
    setEditingMilestone(milestone);
    setEditForm(milestoneForm(milestone));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.day_trigger || !form.capability_outcome || !form.briefing_goal || !form.real_work_trigger || !form.retrieval_brief) return;
    setSubmitting(true);
    try {
      await fetch('/api/onboarding/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          day_trigger: Number(form.day_trigger),
          role: activeRole,
          success_signals: successSignals(form.success_signals),
        }),
      });
      setShowAddForm(false);
      setForm(emptyForm(activeRole));
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMilestone) return;
    if (!editForm.title || !editForm.day_trigger || !editForm.capability_outcome || !editForm.briefing_goal || !editForm.real_work_trigger || !editForm.retrieval_brief) return;
    setEditSubmitting(true);
    setEditError('');
    try {
      const res = await fetch('/api/onboarding/milestones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          milestone_id: editingMilestone.id,
          role: editForm.role,
          day_trigger: Number(editForm.day_trigger),
          title: editForm.title,
          capability_outcome: editForm.capability_outcome,
          briefing_goal: editForm.briefing_goal,
          real_work_trigger: editForm.real_work_trigger,
          retrieval_brief: editForm.retrieval_brief,
          success_signals: successSignals(editForm.success_signals),
          evidence_requirements: editingMilestone.evidence_requirements,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to update learning step.');
      setEditingMilestone(null);
      await load();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to update learning step.');
    } finally {
      setEditSubmitting(false);
    }
  }

  const byRole = (role: HireRole) =>
    milestones.filter((m) => m.role === role).sort((a, b) => a.day_trigger - b.day_trigger);
  const proposalsByRole = (role: HireRole) =>
    proposals.filter((p) => p.role === role).sort((a, b) => a.suggested_day_trigger - b.suggested_day_trigger);

  const activeProfiles = activeRoleProfiles(roleProfiles);
  const activeMilestones = byRole(activeRole);
  const activeProposals = proposalsByRole(activeRole);
  const activeMilestoneDays = new Set(activeMilestones.map((milestone) => milestone.day_trigger));
  const duplicateActiveDays = duplicateDays(activeMilestones, (milestone) => milestone.day_trigger);
  const duplicateDraftDays = duplicateDays(activeProposals, (proposal) => proposal.suggested_day_trigger);
  const draftActiveConflictDays = activeProposals.flatMap((proposal) => (
    activeMilestoneDays.has(proposal.suggested_day_trigger) ? [proposal.suggested_day_trigger] : []
  ));
  const conflictDays = Array.from(new Set([...duplicateActiveDays, ...duplicateDraftDays, ...draftActiveConflictDays]))
    .sort((a, b) => a - b);
  const activeRoleProfile = roleProfileFor(roleProfiles, activeRole);
  const activeJobDescription = activeRoleProfile?.job_description.trim() ?? '';
  const activeBaselineDays = activeRoleProfile?.baseline_ramp_days ?? 90;
  const activeTargetDays = activeRoleProfile?.target_ramp_days ?? 45;
  const activeRoleIndex = activeProfiles.findIndex((profile) => profile.role === activeRole);
  const activeRoleDisplayColor = roleIconColor(activeRole, activeRoleIndex);
  const generating = generationStarting || isGenerationActive(generationRun);

  useEffect(() => {
    if (!isGenerationActive(generationRun)) return undefined;

    const interval = window.setInterval(() => {
      void load();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [generationRun, load]);

  useEffect(() => {
    if (generationRun && isGenerationActive(generationRun)) {
      generationNoticeRef.current = generationRun.id;
      return;
    }

    const rememberedRunId = (() => {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem(MILESTONE_GENERATION_STORAGE_KEY);
      if (!raw) return null;
      try {
        return (JSON.parse(raw) as { id?: string }).id ?? null;
      } catch {
        return null;
      }
    })();
    const shouldNotify = !!generationRun && (generationNoticeRef.current === generationRun.id || rememberedRunId === generationRun.id);

    if (generationRun?.status === 'completed') {
      if (shouldNotify) toast.success('Learning steps are ready for review');
      clearRememberedGeneration(generationRun.id);
      generationNoticeRef.current = null;
    } else if (generationRun?.status === 'failed') {
      if (shouldNotify) {
        toast.error('Learning step generation failed', {
          description: generationRun.error_message ?? 'Please try generating drafts again.',
        });
      }
      clearRememberedGeneration(generationRun.id);
      generationNoticeRef.current = null;
    }
  }, [generationRun]);

  async function generateMilestones() {
    setGenerationStarting(true);
    try {
      const res = await fetch('/api/onboarding/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
      const data = (await res.json().catch(() => ({}))) as { generation?: MilestoneGenerationRun; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not generate learning steps.');
      if (data.generation) {
        setGenerationRun(data.generation);
        rememberGeneration(data.generation);
      }
      await load();
    } catch {
      toast.error('Could not generate learning steps. Please try again.');
    } finally {
      setGenerationStarting(false);
    }
  }

  async function approveProposal(proposal: MilestoneProposal) {
    setActionId(proposal.id);
    try {
      const res = await fetch('/api/onboarding/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_proposal', proposal_id: proposal.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not approve this draft.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not approve this draft.');
    } finally {
      setActionId(null);
    }
  }

  async function rejectProposal(proposal: MilestoneProposal) {
    setActionId(proposal.id);
    try {
      await fetch('/api/onboarding/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_proposal', proposal_id: proposal.id }),
      });
      await load();
    } finally {
      setActionId(null);
    }
  }

  function openEditProposal(proposal: MilestoneProposal) {
    setEditingProposal(proposal);
    setEditProposalForm(proposalToEditForm(proposal));
    setEditProposalError('');
  }

  function setEditProposalField(field: keyof ProposalEditForm, value: string) {
    setEditProposalForm((p) => ({ ...p, [field]: value }));
  }

  async function saveProposalDraft() {
    if (!editingProposal) return;
    setEditProposalSubmitting(true);
    setEditProposalError('');
    try {
      const res = await fetch('/api/onboarding/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_proposal',
          proposal_id: editingProposal.id,
          day_trigger: Number(editProposalForm.day_trigger),
          title: editProposalForm.title,
          capability_outcome: editProposalForm.capability_outcome,
          briefing_goal: editProposalForm.briefing_goal,
          real_work_trigger: editProposalForm.real_work_trigger,
          retrieval_brief: editProposalForm.retrieval_brief,
          success_signals: successSignals(editProposalForm.success_signals),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to save draft.');
      setEditingProposal(null);
      await load();
    } catch (error) {
      setEditProposalError(error instanceof Error ? error.message : 'Failed to save draft.');
    } finally {
      setEditProposalSubmitting(false);
    }
  }

  async function approveEditedProposal() {
    if (!editingProposal) return;
    setEditProposalSubmitting(true);
    setEditProposalError('');
    try {
      const res = await fetch('/api/onboarding/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve_proposal',
          proposal_id: editingProposal.id,
          day_trigger: Number(editProposalForm.day_trigger),
          title: editProposalForm.title,
          capability_outcome: editProposalForm.capability_outcome,
          briefing_goal: editProposalForm.briefing_goal,
          real_work_trigger: editProposalForm.real_work_trigger,
          retrieval_brief: editProposalForm.retrieval_brief,
          success_signals: successSignals(editProposalForm.success_signals),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to approve proposal.');
      setEditingProposal(null);
      await load();
    } catch (error) {
      setEditProposalError(error instanceof Error ? error.message : 'Failed to approve proposal.');
    } finally {
      setEditProposalSubmitting(false);
    }
  }

  async function acceptAllProposals() {
    const targets = proposals
      .filter((p) => p.role === activeRole)
      .sort((a, b) => a.suggested_day_trigger - b.suggested_day_trigger);
    if (targets.length === 0) return;
    setBulkAction('accept_all');
    try {
      let approved = 0;
      let skipped = 0;
      for (const proposal of targets) {
        const res = await fetch('/api/onboarding/milestones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve_proposal', proposal_id: proposal.id }),
        });
        if (res.ok) {
          approved += 1;
        } else {
          skipped += 1;
        }
      }
      await load();
      if (skipped > 0) {
        toast.info(`${approved} approved, ${skipped} need timing edits first.`);
      }
    } finally {
      setBulkAction(null);
    }
  }

  async function rejectAllProposals() {
    const targets = proposals.filter((p) => p.role === activeRole);
    if (targets.length === 0) return;
    setBulkAction('reject_all');
    try {
      await Promise.all(targets.map((proposal) =>
        fetch('/api/onboarding/milestones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject_proposal', proposal_id: proposal.id }),
        })
      ));
      await load();
    } finally {
      setBulkAction(null);
    }
  }

  async function deleteMilestone() {
    if (!pendingDelete) return;
    setActionId(pendingDelete.id);
    setDeleteError('');
    try {
      const res = await fetch('/api/onboarding/milestones', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestone_id: pendingDelete.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to remove learning step.');
      setPendingDelete(null);
      await load();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to remove learning step.');
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full overflow-hidden">
        <div className="split-sidebar w-[260px] flex-shrink-0 border-r flex flex-col gap-3 p-4">
          <Skeleton className="h-8 bg-[var(--bg-primary)]" />
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-[8px] bg-[var(--bg-primary)]" />)}
        </div>
        <div className="flex-1 px-8 py-6 space-y-4">
          <Skeleton className="h-28 rounded-[10px] bg-[var(--bg-primary)]" />
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-[10px] bg-[var(--bg-primary)]" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* Left sidebar — role navigation */}
      <div className="split-sidebar w-[260px] flex-shrink-0 border-r flex flex-col overflow-hidden">
        <div className="split-header p-4 border-b">
          <div className="flex items-center justify-between">
            <span className="type-metric-sm" style={{ color: 'var(--text-primary)' }}>
              Milestones{' '}
              <span className="type-caption font-normal tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                {milestones.length}
              </span>
            </span>
            <Button size="sm" onClick={generateMilestones} disabled={generating || activeProfiles.length === 0}>
              <IconBrain size={13} /> {generating ? 'Generating...' : 'Generate'}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeProfiles.map((profile, index) => {
            const role = profile.role;
            const active = activeRole === role;
            const count = byRole(role).length;
            const pCount = proposalsByRole(role).length;
            const color = roleIconColor(role, index);
            return (
              <div
                key={profile.id}
                role="button"
                tabIndex={0}
                onClick={() => { setActiveRole(role); setForm(emptyForm(role)); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveRole(role);
                    setForm(emptyForm(role));
                  }
                }}
                className={cn(
                  'list-row flex items-center gap-3 border-b cursor-pointer',
                  active && 'list-row-selected'
                )}
                style={{ padding: '12px 16px' }}
              >
                <div
                  className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center type-caption font-medium flex-shrink-0"
                  style={{ backgroundColor: color, color: 'var(--text-on-accent)' }}
                >
                  {roleAbbreviation(role)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="type-panel-title truncate" style={{ color: 'var(--text-primary)' }}>{role}</div>
                  <div className="type-caption mt-[1px]" style={{ color: 'var(--text-tertiary)' }}>
                    {count} learning step{count !== 1 ? 's' : ''}
                    {pCount > 0 && ` · ${pCount} draft${pCount !== 1 ? 's' : ''}`}
                  </div>
                </div>
                {pCount > 0 && (
                  <span
                    className="type-caption px-[7px] py-[2px] rounded-[5px] flex-shrink-0"
                    style={{ backgroundColor: 'var(--canon-purple-light)', color: 'var(--canon-purple-dark)' }}
                  >
                    {pCount}
                  </span>
                )}
              </div>
            );
          })}
          <div className="p-3">
            <Button size="sm" variant="secondary" className="w-full" asChild>
              <Link href="/settings?tab=roles">Configure Roles</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Right panel — role detail */}
      <div className="surface-page flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="detail-page-header px-8 py-5 border-b">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-[7px] flex items-center justify-center type-caption font-medium flex-shrink-0"
                style={{ backgroundColor: activeRoleDisplayColor, color: 'var(--text-on-accent)' }}
              >
                  {activeRole ? roleAbbreviation(activeRole) : 'R'}
                </div>
                <h1 className="type-detail-title" style={{ color: 'var(--text-primary)' }}>{activeRole || 'No Active Roles'}</h1>
              </div>
              <div className="flex items-center gap-2 mt-2 type-body" style={{ color: 'var(--text-tertiary)' }}>
                <span>{activeMilestones.length} approved</span>
                <span>·</span>
                <span>{activeBaselineDays} to {activeTargetDays} day ramp</span>
                {activeProposals.length > 0 && (
                  <>
                    <span>·</span>
                    <span style={{ color: 'var(--canon-purple-dark)' }}>
                      {activeProposals.length} draft{activeProposals.length !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="secondary" asChild>
                <Link href="/settings?tab=roles">
                  <IconEdit size={13} /> Edit Role
                </Link>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => { setShowAddForm(true); setForm(emptyForm(activeRole)); }}
                disabled={!activeRole}
              >
                <IconPlus size={13} /> Add Learning Step
              </Button>
            </div>
          </div>
          <div
            className="mb-3 rounded-[8px] border px-[14px] py-[10px]"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}
          >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="type-kicker text-[var(--text-tertiary)]">Role Readiness Context</div>
                  <p className="type-body mt-1 line-clamp-2 text-[var(--text-secondary)]">
                    {activeJobDescription || 'No job description saved for this role yet.'}
                  </p>
                  <p className="type-caption mt-2 text-[var(--text-tertiary)]">
                    Canon will try to compress this role from {activeBaselineDays} days to {activeTargetDays} days by verifying real progress before moving to the next step.
                  </p>
                </div>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/settings?tab=roles">{activeJobDescription ? 'Edit' : 'Add'}</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <GenerationStatusPanel run={generationRun} starting={generationStarting} />

          {activeProfiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
              <IconTarget size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
              <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Active Roles</div>
              <div className="type-body text-center max-w-[260px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                Add a role before Canon can create learning steps and team updates.
              </div>
              <Button size="sm" asChild>
                <Link href="/settings?tab=roles">Configure Roles</Link>
              </Button>
            </div>
          ) : activeMilestones.length === 0 && activeProposals.length === 0 ? (
            generating ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-[10px] bg-[var(--bg-primary)]" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                <IconTarget size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Approved Learning Steps</div>
                <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                  Generate draft proof points from company knowledge or add a learning step manually.
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={generateMilestones} disabled={generating}>
                    <IconBrain size={13} /> Generate
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => { setShowAddForm(true); setForm(emptyForm(activeRole)); }}>
                    Add Manually
                  </Button>
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-5">
              {conflictDays.length > 0 && (
                <div
                  className="rounded-[8px] border px-4 py-3"
                  style={{ backgroundColor: 'var(--amber-bg-subtle)', borderColor: 'var(--amber)' }}
                >
                  <div className="flex items-start gap-3">
                    <IconAlertTriangle size={16} className="mt-[2px] flex-shrink-0 text-[var(--amber)]" />
                    <div className="min-w-0">
                      <div className="type-panel-title text-[var(--text-primary)]">Spacing needs attention</div>
                      <p className="type-body mt-1 text-[var(--text-secondary)]">
                        Day {conflictDays.join(', day ')} has more than one learning step or draft for this role. Keep one clear step per day so the ramp stays digestible.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeProposals.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="type-kicker" style={{ color: 'var(--text-tertiary)' }}>Draft Proposals</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={rejectAllProposals} disabled={!!bulkAction || !!actionId}>
                        {bulkAction === 'reject_all' ? 'Rejecting...' : 'Reject All'}
                      </Button>
                      <Button size="sm" onClick={acceptAllProposals} disabled={!!bulkAction || !!actionId}>
                        {bulkAction === 'accept_all' ? 'Accepting...' : 'Accept All'}
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    {activeProposals.map((proposal) => (
                      <ProposalCard
                        key={proposal.id}
                        proposal={proposal}
                        disabled={actionId === proposal.id || !!bulkAction}
                        onApprove={approveProposal}
                        onEdit={openEditProposal}
                        onReject={rejectProposal}
                        timingConflict={activeMilestoneDays.has(proposal.suggested_day_trigger) || duplicateDraftDays.has(proposal.suggested_day_trigger)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {activeMilestones.length > 0 && (
                <div>
                  {activeProposals.length > 0 && (
                    <div className="type-kicker mb-3" style={{ color: 'var(--text-tertiary)' }}>Approved Plan</div>
                  )}
                  <div className="flex flex-col gap-3">
                    {activeMilestones.map((m, index) => (
                      <MilestoneCard
                        key={m.id}
                        milestone={m}
                        sequenceIndex={index}
                        previousTitle={index > 0 ? activeMilestones[index - 1]?.title ?? null : null}
                        targetRampDays={activeTargetDays}
                        timingConflict={duplicateActiveDays.has(m.day_trigger)}
                        onEdit={openEdit}
                        onDelete={(milestone) => {
                          setDeleteError('');
                          setPendingDelete(milestone);
                        }}
                        deleting={actionId === m.id}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Milestone Dialog */}
      <Dialog open={showAddForm} onOpenChange={(open) => { if (!open) setShowAddForm(false); }}>
        <DialogContent className="max-w-2xl border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">Add Readiness Milestone</DialogTitle>
            <DialogDescription>
              Add a new capability proof point for the {activeRole} readiness path.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="type-caption mb-1 text-[var(--text-tertiary)]">Day</p>
                <Input
                  type="number"
                  min={0}
                  max={activeTargetDays}
                  value={form.day_trigger}
                  onChange={(e) => setField('day_trigger', e.target.value)}
                  placeholder={`0-${activeTargetDays}`}
                  className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body"
                />
                <p className="type-caption mt-1 text-[var(--text-tertiary)]">Target window: {activeTargetDays} days</p>
              </div>
              <div>
                <p className="type-caption mb-1 text-[var(--text-tertiary)]">Title</p>
                <Input
                  value={form.title}
                  onChange={(e) => setField('title', e.target.value)}
                  placeholder="Milestone title"
                  className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body"
                />
              </div>
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">What They Should Be Able To Do</p>
              <Textarea
                value={form.capability_outcome}
                onChange={(e) => setField('capability_outcome', e.target.value)}
                placeholder="What the hire should be able to do"
                className="textarea-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body min-h-[72px]"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">What Canon Should Explain</p>
              <Textarea
                value={form.briefing_goal}
                onChange={(e) => setField('briefing_goal', e.target.value)}
                placeholder="What Canon should brief before the real work"
                className="textarea-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body min-h-[72px]"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">When This Step Matters</p>
              <Input
                value={form.real_work_trigger}
                onChange={(e) => setField('real_work_trigger', e.target.value)}
                placeholder="e.g. joins first discovery call"
                className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">What Canon Should Look For</p>
              <Input
                value={form.retrieval_brief}
                onChange={(e) => setField('retrieval_brief', e.target.value)}
                placeholder="What should Canon search for?"
                className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Proof This Is Done</p>
              <Textarea
                value={form.success_signals}
                onChange={(e) => setField('success_signals', e.target.value)}
                placeholder="One proof point per line"
                className="textarea-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body min-h-[72px]"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowAddForm(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Milestone'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit learning step dialog */}
      <Dialog open={!!editingMilestone} onOpenChange={(open) => { if (!open) setEditingMilestone(null); }}>
        <DialogContent className="max-w-2xl border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">Edit Learning Step</DialogTitle>
            <DialogDescription>
              Update timing, language, guidance, and proof points for this approved step.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
              <div>
                <p className="type-caption mb-1 text-[var(--text-tertiary)]">Day</p>
                <Input
                  type="number"
                  min={0}
                  max={activeTargetDays}
                  value={editForm.day_trigger}
                  onChange={(e) => setEditField('day_trigger', e.target.value)}
                  className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
                />
                <p className="type-caption mt-1 text-[var(--text-tertiary)]">Max {activeTargetDays}</p>
              </div>
              <div>
                <p className="type-caption mb-1 text-[var(--text-tertiary)]">Role</p>
                <Select value={editForm.role} onValueChange={(value) => setEditField('role', value as HireRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.role}>{profile.role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Title</p>
              <Input
                value={editForm.title}
                onChange={(e) => setEditField('title', e.target.value)}
                className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">What They Should Be Able To Do</p>
              <Textarea
                value={editForm.capability_outcome}
                onChange={(e) => setEditField('capability_outcome', e.target.value)}
                className="textarea-ui min-h-[76px] border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">What Canon Should Explain</p>
              <Textarea
                value={editForm.briefing_goal}
                onChange={(e) => setEditField('briefing_goal', e.target.value)}
                className="textarea-ui min-h-[76px] border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">When This Step Matters</p>
              <Input
                value={editForm.real_work_trigger}
                onChange={(e) => setEditField('real_work_trigger', e.target.value)}
                className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">What Canon Should Look For</p>
              <Input
                value={editForm.retrieval_brief}
                onChange={(e) => setEditField('retrieval_brief', e.target.value)}
                className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Proof This Is Done</p>
              <Textarea
                value={editForm.success_signals}
                onChange={(e) => setEditField('success_signals', e.target.value)}
                placeholder="One proof point per line"
                className="textarea-ui min-h-[90px] border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body"
              />
            </div>
            {editError && <p className="type-body text-[var(--red-text)]">{editError}</p>}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setEditingMilestone(null)} disabled={editSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Draft Proposal Dialog */}
      <Dialog open={!!editingProposal} onOpenChange={(open) => { if (!open) { setEditingProposal(null); setEditProposalError(''); } }}>
        <DialogContent className="max-w-2xl border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">Edit Draft</DialogTitle>
            <DialogDescription>
              Refine this draft before saving or approving it.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
              <div>
                <p className="type-caption mb-1 text-[var(--text-tertiary)]">Day</p>
                <Input
                  type="number"
                  min={0}
                  max={activeTargetDays}
                  value={editProposalForm.day_trigger}
                  onChange={(e) => setEditProposalField('day_trigger', e.target.value)}
                  className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
                />
                <p className="type-caption mt-1 text-[var(--text-tertiary)]">Max {activeTargetDays}</p>
              </div>
              <div>
                <p className="type-caption mb-1 text-[var(--text-tertiary)]">Title</p>
                <Input
                  value={editProposalForm.title}
                  onChange={(e) => setEditProposalField('title', e.target.value)}
                  className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
                />
              </div>
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Capability Outcome</p>
              <Textarea
                value={editProposalForm.capability_outcome}
                onChange={(e) => setEditProposalField('capability_outcome', e.target.value)}
                className="textarea-ui min-h-[76px] border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">What Canon Should Explain</p>
              <Textarea
                value={editProposalForm.briefing_goal}
                onChange={(e) => setEditProposalField('briefing_goal', e.target.value)}
                className="textarea-ui min-h-[76px] border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">When This Step Matters</p>
              <Input
                value={editProposalForm.real_work_trigger}
                onChange={(e) => setEditProposalField('real_work_trigger', e.target.value)}
                className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">What Canon Should Look For</p>
              <Input
                value={editProposalForm.retrieval_brief}
                onChange={(e) => setEditProposalField('retrieval_brief', e.target.value)}
                className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Proof This Is Done</p>
              <Textarea
                value={editProposalForm.success_signals}
                onChange={(e) => setEditProposalField('success_signals', e.target.value)}
                placeholder="One proof point per line"
                className="textarea-ui min-h-[90px] border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body"
              />
            </div>
            {editProposalError && <p className="type-body text-[var(--red-text)]">{editProposalError}</p>}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setEditingProposal(null)} disabled={editProposalSubmitting}>
                Cancel
              </Button>
              <Button type="button" variant="secondary" onClick={saveProposalDraft} disabled={editProposalSubmitting || !editProposalForm.title || !editProposalForm.day_trigger}>
                {editProposalSubmitting ? 'Saving...' : 'Save Draft'}
              </Button>
              <Button type="button" onClick={approveEditedProposal} disabled={editProposalSubmitting || !editProposalForm.title || !editProposalForm.day_trigger}>
                {editProposalSubmitting ? 'Approving...' : 'Approve'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">Remove Readiness Milestone</DialogTitle>
            <DialogDescription>
              Remove {pendingDelete?.title}? This archives it from future hire paths while preserving historical delivery and evidence records.
            </DialogDescription>
          </DialogHeader>
          {pendingDelete && (
            <div className="rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-3 py-2">
              <div className="type-kicker mb-1 text-[var(--text-tertiary)]">Approved Readiness Milestone</div>
              <p className="type-body-strong text-[var(--text-primary)]">Day {pendingDelete.day_trigger} - {pendingDelete.title}</p>
              <p className="type-caption mt-1 text-[var(--text-tertiary)]">{pendingDelete.role}</p>
            </div>
          )}
          {deleteError && <p className="type-body text-[var(--red-text)]">{deleteError}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPendingDelete(null)} disabled={actionId === pendingDelete?.id}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={deleteMilestone} disabled={actionId === pendingDelete?.id}>
              {actionId === pendingDelete?.id ? 'Removing...' : 'Remove Learning Step'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
