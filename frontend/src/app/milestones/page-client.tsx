'use client';

import { useState, useEffect, useCallback } from 'react';
import { Target, Plus, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { HireRole, RampMilestone } from '@/types/onboarding';

const ROLES: HireRole[] = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];

const ROLE_COLORS: Record<HireRole, string> = {
  'AI Solutions Architect': 'bg-purple-500/20 text-purple-300',
  'Solutions Engineer': 'bg-blue-500/20 text-blue-300',
  'Implementation Engineer': 'bg-emerald-500/20 text-emerald-300',
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

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <Skeleton className="h-8 w-32 bg-white/10" />
        <Skeleton className="h-10 w-full bg-white/10 rounded-xl" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 bg-white/10 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Milestones</h1>
        <p className="text-white/50 text-sm mt-0.5">What Canon delivers and when</p>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-white/50 text-sm">These milestone templates drive Canon&apos;s proactive Slack messages. Global defaults apply to all workspaces; org-specific milestones override them.</p>
      </div>

      <Tabs value={activeRole} onValueChange={(v) => { setActiveRole(v as HireRole); setShowAddForm(false); }}>
        <TabsList className="bg-zinc-900 border border-white/10 h-auto gap-0">
          {ROLES.map((role) => (
            <TabsTrigger
              key={role}
              value={role}
              className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 text-xs py-2 px-4"
            >
              {role}
            </TabsTrigger>
          ))}
        </TabsList>

        {ROLES.map((role) => {
          const roleMilestones = byRole(role);
          return (
            <TabsContent key={role} value={role} className="mt-4 space-y-3">
              {roleMilestones.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-12 text-center">
                  <Target className="h-9 w-9 text-white/20 mb-3" />
                  <p className="text-white/40 text-sm">No milestones for this role yet.</p>
                </div>
              ) : (
                <div className="relative pl-5 border-l border-white/10 space-y-3">
                  {roleMilestones.map((m) => (
                    <div key={m.id} className="relative">
                      <div className="absolute -left-6 top-5 h-2 w-2 rounded-full bg-blue-500 border-2 border-zinc-950" />
                      <div className="rounded-xl border border-white/10 bg-zinc-900 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1">
                            <Badge className="bg-white/10 text-white border-0 text-xs shrink-0 mt-0.5">Day {m.day_trigger}</Badge>
                            <div className="flex-1">
                              <p className="text-white font-medium">{m.title}</p>
                              <p className="text-white/50 text-sm mt-1">{m.description}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-white/30 text-xs">Query:</span>
                                <span className="text-white/40 text-xs font-mono truncate max-w-xs">{m.knowledge_query}</span>
                              </div>
                              {m.organization_id === null && (
                                <Badge className={`${ROLE_COLORS[role]} border-0 text-xs mt-2`}>Global default</Badge>
                              )}
                            </div>
                          </div>
                          {m.organization_id !== null && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setEditingMilestone(m); }}
                              className="text-white/30 hover:text-white/70 h-7 w-7 p-0 shrink-0"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!showAddForm ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowAddForm(true); setForm(emptyForm(role)); }}
                  className="border-white/20 text-white/60 hover:bg-white/10 flex items-center gap-1.5 h-8 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add milestone
                </Button>
              ) : (
                <form onSubmit={handleAdd} className="rounded-xl border border-white/10 bg-zinc-900 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-white text-sm font-medium">New milestone</p>
                    <button type="button" onClick={() => setShowAddForm(false)} className="text-white/30 hover:text-white/70">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="number"
                      value={form.day_trigger}
                      onChange={(e) => setField('day_trigger', e.target.value)}
                      placeholder="Day (e.g. 45)"
                      className="border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm"
                    />
                    <Input
                      value={form.title}
                      onChange={(e) => setField('title', e.target.value)}
                      placeholder="Milestone title"
                      className="border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm"
                    />
                  </div>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setField('description', e.target.value)}
                    placeholder="What this milestone covers"
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm min-h-[72px]"
                  />
                  <Input
                    value={form.knowledge_query}
                    onChange={(e) => setField('knowledge_query', e.target.value)}
                    placeholder="Knowledge query keywords"
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={submitting} size="sm" className="bg-white text-black hover:bg-white/90 h-8 text-xs">
                      {submitting ? 'Saving...' : 'Save milestone'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowAddForm(false)} className="border-white/20 text-white/60 hover:bg-white/10 h-8 text-xs">
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={!!editingMilestone} onOpenChange={(open) => { if (!open) setEditingMilestone(null); }}>
        <DialogContent className="max-w-md bg-zinc-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Edit milestone</DialogTitle>
          </DialogHeader>
          {editingMilestone && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-white/40 text-xs mb-1">Day trigger</p>
                  <p className="text-white font-medium">Day {editingMilestone.day_trigger}</p>
                </div>
                <div>
                  <p className="text-white/40 text-xs mb-1">Role</p>
                  <p className="text-white font-medium text-sm">{editingMilestone.role}</p>
                </div>
              </div>
              <div>
                <p className="text-white/40 text-xs mb-1">Title</p>
                <p className="text-white">{editingMilestone.title}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs mb-1">Description</p>
                <p className="text-white/70 text-sm">{editingMilestone.description}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs mb-1">Knowledge query</p>
                <p className="text-white/50 text-xs font-mono">{editingMilestone.knowledge_query}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingMilestone(null)}
                className="border-white/20 text-white/60 hover:bg-white/10 w-full h-8 text-xs"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
