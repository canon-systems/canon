'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import { IconInfoCircle, IconTarget, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AddMilestoneCard, MilestoneCard } from '@/components/milestone-card';
import type { HireRole, RampMilestone } from '@/types/onboarding';

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
  description: string;
  knowledge_query: string;
};

const emptyForm = (role: HireRole): MilestoneForm => ({ role, day_trigger: '', title: '', description: '', knowledge_query: '' });

export function MilestonesClient() {
  const [milestones, setMilestones] = useState<RampMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState<HireRole>('AI Solutions Architect');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<RampMilestone | null>(null);
  const [form, setForm] = useState<MilestoneForm>(emptyForm('AI Solutions Architect'));
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/milestones');
      const data = (await res.json()) as { milestones?: RampMilestone[] };
      setMilestones(data.milestones ?? []);
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.day_trigger || !form.description || !form.knowledge_query) return;
    setSubmitting(true);
    try {
      await fetch('/api/onboarding/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, day_trigger: Number(form.day_trigger), role: activeRole }),
      });
      setShowAddForm(false);
      setForm(emptyForm(activeRole));
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  const byRole = (role: HireRole) =>
    milestones.filter((m) => m.role === role).sort((a, b) => a.day_trigger - b.day_trigger);

  const activeMilestones = byRole(activeRole);

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
        <h1 className="type-page-title" style={{ color: 'var(--text-primary)' }}>Milestones</h1>
        <p className="type-page-subtitle mt-[2px]" style={{ color: 'var(--text-tertiary)' }}>What Canon Delivers and When</p>
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
        Global defaults apply to all new hires in this role. Add org-specific milestones to override or extend them for your team.
      </div>

      {activeMilestones.length === 0 && !showAddForm ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12">
          <IconTarget size={32} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
          <div className="type-section-title" style={{ color: 'var(--text-secondary)' }}>No Milestones for This Role</div>
          <div className="type-body text-center max-w-[240px] leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
            Add a milestone to define what Canon should send for this role.
          </div>
          <Button size="sm" onClick={() => { setShowAddForm(true); setForm(emptyForm(activeRole)); }}>Add Milestone</Button>
        </div>
      ) : (
        <div className="flex gap-5 px-6 py-4 overflow-y-auto flex-1">
          <div className="flex flex-col items-center pt-[6px] flex-shrink-0">
            {activeMilestones.map((_, i) => (
              <Fragment key={i}>
                <div className="w-[10px] h-[10px] rounded-full flex-shrink-0 z-10" style={{ backgroundColor: 'var(--canon-purple)' }} />
                {i < activeMilestones.length - 1 && (
                  <div className="w-[2px] flex-1 my-1 min-h-[60px]" style={{ backgroundColor: 'var(--border-tertiary)' }} />
                )}
              </Fragment>
            ))}
          </div>
          <div className="flex-1 flex flex-col gap-3 pb-4">
            {activeMilestones.map((m) => (
              <MilestoneCard key={m.id} milestone={m} onEdit={setEditingMilestone} />
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
                <Textarea value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="What This Milestone Covers" className="textarea-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body min-h-[72px]" />
                <Input value={form.knowledge_query} onChange={(e) => setField('knowledge_query', e.target.value)} placeholder="Knowledge Query Keywords" className="input-ui border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] type-body" />
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
        <DialogContent className="max-w-md border-[var(--border-tertiary)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">Edit Milestone</DialogTitle>
          </DialogHeader>
          {editingMilestone && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="type-caption mb-1" style={{ color: 'var(--text-tertiary)' }}>Day Trigger</p>
                  <p className="type-panel-title" style={{ color: 'var(--text-primary)' }}>Day {editingMilestone.day_trigger}</p>
                </div>
                <div>
                  <p className="type-caption mb-1" style={{ color: 'var(--text-tertiary)' }}>Role</p>
                  <p className="type-panel-title" style={{ color: 'var(--text-primary)' }}>{editingMilestone.role}</p>
                </div>
              </div>
              <div>
                <p className="type-caption mb-1" style={{ color: 'var(--text-tertiary)' }}>Title</p>
                <p className="type-body-strong" style={{ color: 'var(--text-primary)' }}>{editingMilestone.title}</p>
              </div>
              <div>
                <p className="type-caption mb-1" style={{ color: 'var(--text-tertiary)' }}>Description</p>
                <p className="type-body-strong" style={{ color: 'var(--text-secondary)' }}>{editingMilestone.description}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setEditingMilestone(null)}>Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
