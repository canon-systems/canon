'use client';

import { useState, useEffect, useCallback } from 'react';
import { IconBrain, IconCheck, IconEdit, IconInfoCircle, IconSparkles, IconTarget, IconTrash, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AddMilestoneCard, MilestoneCard } from '@/components/milestone-card';
import type { HireRole, MilestoneProposal, RampMilestone } from '@/types/onboarding';

const ROLES: HireRole[] = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];

const ROLE_META: Record<HireRole, { id: string; color: string; abbr: string; label: string }> = {
  'AI Solutions Architect': { id: 'ai-sa', color: 'var(--role-ai)', abbr: 'AI', label: 'AI Solutions Architect' },
  'Solutions Engineer': { id: 'se', color: 'var(--role-se)', abbr: 'SE', label: 'Solutions Engineer' },
  'Implementation Engineer': { id: 'ie', color: 'var(--role-ie)', abbr: 'IE', label: 'Implementation Engineer' },
};

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

function ProposalCard({
  proposal,
  disabled,
  onApprove,
  onEdit,
  onReject,
}: {
  proposal: MilestoneProposal;
  disabled?: boolean;
  onApprove: (proposal: MilestoneProposal) => void;
  onEdit: (proposal: MilestoneProposal) => void;
  onReject: (proposal: MilestoneProposal) => void;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--canon-purple-border)] bg-[var(--canon-purple-light)] p-4">
      <div className="flex items-start gap-3">
        <div className="mt-[2px] flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[7px] bg-[var(--bg-primary)] text-[var(--canon-purple)]">
          <IconSparkles size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-caption font-medium text-[var(--canon-purple-dark)]">Draft · Day {proposal.suggested_day_trigger}</span>
            <span className="type-caption text-[var(--text-tertiary)]">{Math.round(proposal.confidence * 100)}% confidence</span>
          </div>
          <h3 className="type-card-title mt-1 text-[var(--text-primary)]">{proposal.title}</h3>
          <p className="type-card-body mt-2 text-[var(--text-secondary)]">{proposal.capability_outcome}</p>
          <div className="mt-3 rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-3 py-2">
            <div className="type-kicker mb-1 text-[var(--text-tertiary)]">Real Work Trigger</div>
            <p className="type-body text-[var(--text-secondary)]">{proposal.real_work_trigger}</p>
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
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState<HireRole>('AI Solutions Architect');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<RampMilestone | null>(null);
  const [editForm, setEditForm] = useState<MilestoneForm>(emptyForm('AI Solutions Architect'));
  const [pendingDelete, setPendingDelete] = useState<RampMilestone | null>(null);
  const [form, setForm] = useState<MilestoneForm>(emptyForm('AI Solutions Architect'));
  const [submitting, setSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [editError, setEditError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [editingProposal, setEditingProposal] = useState<MilestoneProposal | null>(null);
  const [editProposalForm, setEditProposalForm] = useState<ProposalEditForm>({ day_trigger: '', title: '', capability_outcome: '', briefing_goal: '', real_work_trigger: '', retrieval_brief: '', success_signals: '' });
  const [editProposalSubmitting, setEditProposalSubmitting] = useState(false);
  const [editProposalError, setEditProposalError] = useState('');
  const [bulkAction, setBulkAction] = useState<'accept_all' | 'reject_all' | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/milestones');
      const data = (await res.json()) as { milestones?: RampMilestone[]; proposals?: MilestoneProposal[] };
      setMilestones(data.milestones ?? []);
      setProposals(data.proposals ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function setField(field: keyof MilestoneForm, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function setEditField(field: keyof MilestoneForm, value: string) {
    setEditForm((p) => ({ ...p, [field]: value }));
  }

  function openEdit(milestone: RampMilestone) {
    setShowAddForm(false);
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
      if (!res.ok) throw new Error(data.error ?? 'Failed to update milestone.');
      setEditingMilestone(null);
      await load();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to update milestone.');
    } finally {
      setEditSubmitting(false);
    }
  }

  const byRole = (role: HireRole) =>
    milestones.filter((m) => m.role === role).sort((a, b) => a.day_trigger - b.day_trigger);
  const proposalsByRole = (role: HireRole) =>
    proposals.filter((p) => p.role === role).sort((a, b) => a.suggested_day_trigger - b.suggested_day_trigger);

  const activeMilestones = byRole(activeRole);
  const activeProposals = proposalsByRole(activeRole);

  async function generateMilestones() {
    setGenerating(true);
    try {
      await fetch('/api/onboarding/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
    } finally {
      setGenerating(false);
    }
  }

  async function approveProposal(proposal: MilestoneProposal) {
    setActionId(proposal.id);
    try {
      await fetch('/api/onboarding/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_proposal', proposal_id: proposal.id }),
      });
      await load();
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
    const targets = proposals.filter((p) => p.role === activeRole);
    if (targets.length === 0) return;
    setBulkAction('accept_all');
    try {
      await Promise.all(targets.map((proposal) =>
        fetch('/api/onboarding/milestones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve_proposal', proposal_id: proposal.id }),
        })
      ));
      await load();
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
      if (!res.ok) throw new Error(data.error ?? 'Failed to remove milestone.');
      setPendingDelete(null);
      await load();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to remove milestone.');
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
          <Skeleton className="h-8 w-40 bg-[var(--bg-primary)]" />
        </div>
        <div className="px-6 py-4 space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-[10px] bg-[var(--bg-primary)]" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="type-page-title" style={{ color: 'var(--text-primary)' }}>Milestones</h1>
            <p className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>Company-derived capability briefings tied to real work</p>
          </div>
          <Button size="sm" onClick={generateMilestones} disabled={generating}>
            <IconBrain size={14} /> {generating ? 'Generating...' : 'Generate from Knowledge'}
          </Button>
        </div>
      </div>

      <div className="flex gap-[10px] px-6 py-[14px] border-b" style={{ borderColor: 'var(--border-tertiary)' }}>
        {ROLES.map((role) => {
          const meta = ROLE_META[role];
          const active = activeRole === role;
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() => { setActiveRole(role); setShowAddForm(false); setForm(emptyForm(role)); }}
              className="flex items-center gap-[7px] px-[14px] py-2 rounded-[8px] border type-nav transition-all duration-[120ms] cursor-pointer"
              style={{
                backgroundColor: active ? 'var(--canon-purple-light)' : 'transparent',
                borderColor: active ? 'var(--canon-purple-border)' : 'var(--border-tertiary)',
                color: active ? 'var(--canon-purple-dark)' : 'var(--text-secondary)',
                fontWeight: active ? 500 : 400,
              }}
            >
              <div className="w-[22px] h-[22px] rounded-[5px] flex items-center justify-center type-caption font-medium text-[var(--text-primary)] flex-shrink-0" style={{ backgroundColor: meta.color }}>
                {meta.abbr}
              </div>
              {meta.label}
              <span
                className="type-caption px-[6px] py-[1px] rounded-[4px]"
                style={{
                  backgroundColor: active ? 'var(--canon-purple-light)' : 'var(--bg-secondary)',
                  color: active ? 'var(--canon-purple-dark)' : 'var(--text-tertiary)',
                }}
              >
                {byRole(role).length}
                {proposalsByRole(role).length > 0 ? `/${proposalsByRole(role).length}` : ''}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="mx-6 mt-[14px] px-[14px] py-[10px] rounded-[8px] flex items-center gap-2 type-body border"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-tertiary)', color: 'var(--text-secondary)' }}
      >
        <IconInfoCircle size={14} style={{ color: 'var(--canon-purple)', flexShrink: 0 }} />
        Canon only uses approved company milestones. Drafts are generated from indexed company knowledge and stay inactive until approved.
      </div>

      {activeMilestones.length === 0 && activeProposals.length === 0 && !showAddForm ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12">
          <IconTarget size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
          <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Approved Company Milestones</div>
          <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
            Generate drafts from company knowledge or add a milestone manually.
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={generateMilestones} disabled={generating}>
              <IconBrain size={13} /> Generate
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setShowAddForm(true); setForm(emptyForm(activeRole)); }}>Add Manually</Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-5 px-6 py-4 overflow-y-auto flex-1">
          <div className="flex-1 flex flex-col gap-3 pb-4">
            {activeProposals.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="type-kicker text-[var(--text-tertiary)]">Draft Proposals</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={rejectAllProposals} disabled={!!bulkAction || !!actionId}>
                      {bulkAction === 'reject_all' ? 'Rejecting...' : 'Reject All'}
                    </Button>
                    <Button size="sm" onClick={acceptAllProposals} disabled={!!bulkAction || !!actionId}>
                      {bulkAction === 'accept_all' ? 'Accepting...' : 'Accept All'}
                    </Button>
                  </div>
                </div>
                {activeProposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    disabled={actionId === proposal.id || !!bulkAction}
                    onApprove={approveProposal}
                    onEdit={openEditProposal}
                    onReject={rejectProposal}
                  />
                ))}
              </div>
            )}
            {activeMilestones.length > 0 && activeProposals.length > 0 && (
              <div className="type-kicker pt-2 text-[var(--text-tertiary)]">Approved Ramp Plan</div>
            )}
            {activeMilestones.map((m) => (
              <MilestoneCard
                key={m.id}
                milestone={m}
                onEdit={openEdit}
                onDelete={(milestone) => {
                  setDeleteError('');
                  setPendingDelete(milestone);
                }}
                deleting={actionId === m.id}
              />
            ))}
            {!showAddForm ? (
              <AddMilestoneCard roleName={ROLE_META[activeRole].label} onAdd={() => { setShowAddForm(true); setForm(emptyForm(activeRole)); }} />
            ) : (
              <form onSubmit={handleAdd} className="rounded-[10px] border p-4 space-y-4" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-tertiary)' }}>
                <div className="flex items-center justify-between">
                  <p className="type-panel-title" style={{ color: 'var(--text-primary)' }}>New Milestone</p>
                  <button type="button" onClick={() => setShowAddForm(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                    <IconX size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="number" value={form.day_trigger} onChange={(e) => setField('day_trigger', e.target.value)} placeholder="Day (e.g. 45)" className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body" />
                  <Input value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="Milestone Title" className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body" />
                </div>
                <Textarea value={form.capability_outcome} onChange={(e) => setField('capability_outcome', e.target.value)} placeholder="Capability outcome" className="textarea-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body min-h-[72px]" />
                <Textarea value={form.briefing_goal} onChange={(e) => setField('briefing_goal', e.target.value)} placeholder="What Canon should brief before the real work" className="textarea-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body min-h-[72px]" />
                <Input value={form.real_work_trigger} onChange={(e) => setField('real_work_trigger', e.target.value)} placeholder="Real-work trigger (e.g. joins first discovery call)" className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body" />
                <Input value={form.retrieval_brief} onChange={(e) => setField('retrieval_brief', e.target.value)} placeholder="Retrieval brief" className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body" />
                <Textarea value={form.success_signals} onChange={(e) => setField('success_signals', e.target.value)} placeholder="Success signals, one per line" className="textarea-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body min-h-[72px]" />
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting} size="sm">{submitting ? 'Saving...' : 'Save Milestone'}</Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setShowAddForm(false)}>Cancel</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!editingMilestone} onOpenChange={(open) => { if (!open) setEditingMilestone(null); }}>
        <DialogContent className="max-w-2xl border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">Edit Milestone</DialogTitle>
            <DialogDescription>
              Update timing, language, briefing guidance, and real-work signals for this approved milestone.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
              <div>
                <p className="type-caption mb-1 text-[var(--text-tertiary)]">Day</p>
                <Input
                  type="number"
                  min={0}
                  value={editForm.day_trigger}
                  onChange={(e) => setEditField('day_trigger', e.target.value)}
                  className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
                />
              </div>
              <div>
                <p className="type-caption mb-1 text-[var(--text-tertiary)]">Role</p>
                <Select value={editForm.role} onValueChange={(value) => setEditField('role', value as HireRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
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
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Capability Outcome</p>
              <Textarea
                value={editForm.capability_outcome}
                onChange={(e) => setEditField('capability_outcome', e.target.value)}
                className="textarea-ui min-h-[76px] border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Briefing Goal</p>
              <Textarea
                value={editForm.briefing_goal}
                onChange={(e) => setEditField('briefing_goal', e.target.value)}
                className="textarea-ui min-h-[76px] border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Real-Work Trigger</p>
              <Input
                value={editForm.real_work_trigger}
                onChange={(e) => setEditField('real_work_trigger', e.target.value)}
                className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Retrieval Brief</p>
              <Input
                value={editForm.retrieval_brief}
                onChange={(e) => setEditField('retrieval_brief', e.target.value)}
                className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Success Signals</p>
              <Textarea
                value={editForm.success_signals}
                onChange={(e) => setEditField('success_signals', e.target.value)}
                placeholder="One signal per line"
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
                  value={editProposalForm.day_trigger}
                  onChange={(e) => setEditProposalField('day_trigger', e.target.value)}
                  className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
                />
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
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Briefing Goal</p>
              <Textarea
                value={editProposalForm.briefing_goal}
                onChange={(e) => setEditProposalField('briefing_goal', e.target.value)}
                className="textarea-ui min-h-[76px] border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Real-Work Trigger</p>
              <Input
                value={editProposalForm.real_work_trigger}
                onChange={(e) => setEditProposalField('real_work_trigger', e.target.value)}
                className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Retrieval Brief</p>
              <Input
                value={editProposalForm.retrieval_brief}
                onChange={(e) => setEditProposalField('retrieval_brief', e.target.value)}
                className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] type-body"
              />
            </div>
            <div>
              <p className="type-caption mb-1 text-[var(--text-tertiary)]">Success Signals</p>
              <Textarea
                value={editProposalForm.success_signals}
                onChange={(e) => setEditProposalField('success_signals', e.target.value)}
                placeholder="One signal per line"
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

      <Dialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">Remove Milestone</DialogTitle>
            <DialogDescription>
              Remove {pendingDelete?.title}? This archives it from future ramp plans while preserving historical delivery and evidence records.
            </DialogDescription>
          </DialogHeader>
          {pendingDelete && (
            <div className="rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] px-3 py-2">
              <div className="type-kicker mb-1 text-[var(--text-tertiary)]">Approved Milestone</div>
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
              {actionId === pendingDelete?.id ? 'Removing...' : 'Remove Milestone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
