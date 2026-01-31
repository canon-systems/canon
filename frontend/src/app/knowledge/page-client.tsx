'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, ChevronsUpDown, Info, Check, BookOpen, GitCompare } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { createClient } from '@/lib/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type KnowledgeItem = {
  id: string;
  source_ids: string[];
  type: 'code_summary' | 'issue';
  title: string;
  body: string;
  updated_at: string | null;
  scope_refs?: string[];
  projections?: Array<{ audience: string; projection: string; status: string }>;
};

type Source = { id: string; name: string; provider: string };

type DiffScope = 'repo' | 'project' | 'org';
type DiffSource = 'jira' | 'github';
type Mode = 'knowledge' | 'diffs';

type DiffInput = {
  start_timestamp: string;
  end_timestamp: string;
  sources: DiffSource[];
  scope: DiffScope;
};

type DiffObject = {
  tickets_moved: number;
  tickets_completed: number;
  tickets_regressed: number;
  tickets_created: number;
  prs_opened: number;
  prs_merged: number;
  prs_closed: number;
  commits_default: number;
  repos_touched: string[];
  architecture_changes: Array<{ label: 'node_added' | 'node_modified' | 'node_removed'; detail: string }>;
};

type ModeSwitcherProps = { active: Mode; onChange: (mode: Mode) => void };
type FilterTab = 'filters' | 'automation' | 'review';
type ModeCardProps = {
  active: boolean;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
};

function projectForAudience(item: KnowledgeItem, audience: string): string {
  const base = item.body || '';
  switch (audience.toLowerCase()) {
    case 'executive':
      return `What it is: ${item.title}\nWhy it matters: ${base.slice(0, 240)}\nTop risk: TBD`;
    case 'sales':
      return `Problem solved: ${base.slice(0, 200)}\nDifferentiators: TBD\nDisqualifiers: TBD`;
    case 'marketing':
      return `Positioning: ${base.slice(0, 200)}\nClaims allowed: TBD\nDo not claim: TBD`;
    case 'engineering':
      return base;
    case 'support':
      return `What breaks: TBD\nSignals: TBD\nEscalation: TBD\nNotes: ${base.slice(0, 200)}`;
    case 'customer':
      return `Benefit: ${base.slice(0, 200)}\nHow to use: TBD\nLimits: TBD`;
    default:
      return base;
  }
}

function DiffPrototypePanel() {
  const defaultEnd = useMemo(() => new Date(), []);
  const defaultStart = useMemo(() => {
    const d = new Date(defaultEnd);
    d.setDate(d.getDate() - 7);
    return d;
  }, [defaultEnd]);

  const [diffInput, setDiffInput] = useState<DiffInput>({
    start_timestamp: toInputValue(defaultStart),
    end_timestamp: toInputValue(defaultEnd),
    sources: ['jira', 'github'],
    scope: 'org',
  });
  const [diffObject, setDiffObject] = useState<DiffObject>(() =>
    buildDiffFromInput({
      start_timestamp: toInputValue(defaultStart),
      end_timestamp: toInputValue(defaultEnd),
      sources: ['jira', 'github'],
      scope: 'org',
    })
  );
  const [snapshots] = useState(() => seedSnapshots());
  const [diffFilterTab, setDiffFilterTab] = useState<FilterTab>('filters');

  const canonicalInput = useMemo(
    () => ({
      start_timestamp: new Date(diffInput.start_timestamp).toISOString(),
      end_timestamp: new Date(diffInput.end_timestamp).toISOString(),
      sources: diffInput.sources,
      scope: diffInput.scope,
    }),
    [diffInput]
  );

  const weeklyMarkdown = useMemo(() => buildWeeklyMarkdown(diffObject), [diffObject]);
  const movementRatio = useMemo(() => {
    const denominator = Math.max(1, diffObject.tickets_completed);
    return `${Math.round((diffObject.tickets_moved / denominator) * 100)}%`;
  }, [diffObject]);

  const toggleSource = (source: DiffSource) => {
    setDiffInput((prev) => {
      const has = prev.sources.includes(source);
      const nextSources = has ? prev.sources.filter((s) => s !== source) : [...prev.sources, source];
      return { ...prev, sources: nextSources.length ? nextSources : prev.sources };
    });
  };

  const updateTime = (field: 'start_timestamp' | 'end_timestamp') => (value: string) => {
    setDiffInput((prev) => ({ ...prev, [field]: value }));
  };

  const generateDiff = () => setDiffObject(buildDiffFromInput(diffInput));

  const inputClass =
    'flex h-10 w-full rounded-lg border border-white/60 bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60';
  const pillActive =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-60 h-10 px-4 py-2 rounded-full border border-white/50 hover:border-white/70 hover:bg-white/20 shadow-sm bg-white text-black';
  const pillInactive =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-60 h-10 px-4 py-2 rounded-full text-white/70 hover:bg-white/10';
  const pillInactiveBorder =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-60 h-10 px-4 py-2 rounded-full border border-white/15 text-white/80 hover:border-white/25 hover:bg-white/10';

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <SidebarProvider defaultOpen className="w-full">
        <Sidebar className="lg:self-start">
          <SidebarHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                {(['filters', 'automation', 'review'] as FilterTab[]).map((tab) => {
                  const active = diffFilterTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setDiffFilterTab(tab)}
                      className={cn(
                        'relative pb-1 font-normal transition-colors',
                        active ? 'after:absolute after:left-0 after:bottom-0 after:h-[2px] after:w-full after:bg-white after:content-[""]' : 'hover:[&_.tab-label]:text-white/80'
                      )}
                    >
                      <span className={cn('tab-label text-[11px] uppercase tracking-[0.2em] text-white/50', active && 'text-white')}>
                        {tab}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            {diffFilterTab === 'filters' && (
              <>
                <SidebarGroup>
                  <SidebarGroupLabel>Time range</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <div className="space-y-2">
                      <input
                        className={inputClass}
                        type="datetime-local"
                        value={diffInput.start_timestamp}
                        onChange={(e) => updateTime('start_timestamp')(e.target.value)}
                      />
                      <input
                        className={inputClass}
                        type="datetime-local"
                        value={diffInput.end_timestamp}
                        onChange={(e) => updateTime('end_timestamp')(e.target.value)}
                      />
                    </div>
                  </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                  <SidebarGroupLabel>Scope</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <div className="flex flex-wrap gap-2">
                      {(['repo', 'project', 'org'] as DiffScope[]).map((scope) => {
                        const active = diffInput.scope === scope;
                        return (
                          <button
                            key={scope}
                            type="button"
                            onClick={() => setDiffInput((prev) => ({ ...prev, scope }))}
                            className={cn(active ? pillActive : pillInactive)}
                          >
                            {scope}
                          </button>
                        );
                      })}
                    </div>
                  </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                  <SidebarGroupLabel>Sources</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <div className="flex flex-wrap gap-2">
                      {(['jira', 'github'] as DiffSource[]).map((src) => {
                        const active = diffInput.sources.includes(src);
                        return (
                          <button
                            key={src}
                            type="button"
                            onClick={() => toggleSource(src)}
                            className={cn(active ? pillActive : pillInactiveBorder)}
                          >
                            {src.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}

            {diffFilterTab === 'automation' && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
                Automation config placeholder — hook diff automation here.
              </div>
            )}

            {diffFilterTab === 'review' && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
                Review config placeholder — diff review settings here.
              </div>
            )}
          </SidebarContent>

          {diffFilterTab === 'filters' && (
            <SidebarFooter>
              <p className="text-xs text-white/60 mb-3">
                Scope and timestamps lock once a diff is stored. Regenerate to create a new immutable record.
              </p>
              <Button
                onClick={generateDiff}
                className="w-full border-white/50 bg-white text-black hover:bg-white/90 hover:border-white/70"
              >
                Generate diff
              </Button>
            </SidebarFooter>
          )}
        </Sidebar>
      </SidebarProvider>

      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card className="border-white/10 bg-black/50">
            <CardHeader>
              <CardTitle>Canonical Diff Contract</CardTitle>
              <CardDescription>start_timestamp · end_timestamp · sources · scope</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-white/10 bg-neutral-900 p-4 font-mono text-xs text-white/80">
                <pre className="whitespace-pre-wrap">{JSON.stringify(canonicalInput, null, 2)}</pre>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/60">Diff object</div>
                <dl className="mt-2 space-y-1 text-sm text-white/80">
                  <div className="flex items-center justify-between">
                    <dt>Tickets moved</dt>
                    <dd className="font-semibold text-white">{diffObject.tickets_moved}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Tickets completed</dt>
                    <dd className="font-semibold text-white">{diffObject.tickets_completed}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Tickets regressed</dt>
                    <dd className="font-semibold text-white">{diffObject.tickets_regressed}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>PRs merged</dt>
                    <dd className="font-semibold text-white">{diffObject.prs_merged}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Commits to default</dt>
                    <dd className="font-semibold text-white">{diffObject.commits_default}</dd>
                  </div>
                </dl>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle>System change characteristics</CardTitle>
              <CardDescription>Derived from the diff spine, not scored.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                <span>Tickets completed</span>
                <span className="font-semibold">{diffObject.tickets_completed}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                <span>PRs merged</span>
                <span className="font-semibold">{diffObject.prs_merged}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                <span>Movement vs completion</span>
                <span className="font-semibold">{movementRatio}</span>
              </div>
              <p className="text-xs text-white/60">
                Stored as a time series keyed by team · repo · date range for later trend work.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle>Weekly truth summary (markdown)</CardTitle>
              <CardDescription>Bullet lists only; no manual edits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-white/10 bg-neutral-900 p-4 font-mono text-sm text-white/80 whitespace-pre-wrap">
                {weeklyMarkdown}
              </div>
              <div className="flex flex-wrap gap-2">
                {['Slack', 'Confluence', 'Email'].map((target) => (
                  <Button key={target} variant="outline" className="border-white/20 text-white/80 hover:text-white">
                    Send to {target}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-black/50">
            <CardHeader>
              <CardTitle>Architecture signals</CardTitle>
              <CardDescription>Lightweight change detection from git diff.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {diffObject.architecture_changes.map((change, idx) => (
                  <div
                    key={`${change.label}-${idx}`}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-white/10 text-white">
                        {change.label}
                      </Badge>
                      <span className="text-white/80">{change.detail}</span>
                    </div>
                    <Badge variant="outline" className="border-white/20 text-white/60">
                      {diffInput.scope}
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-white/60">Repos touched</div>
                <div className="flex flex-wrap gap-2">
                  {diffObject.repos_touched.map((repo) => (
                    <Badge key={repo} variant="outline" className="border-white/20 text-white/80">
                      {repo}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle>Monthly snapshots</CardTitle>
            <CardDescription>One snapshot per month; compare N vs N-1.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="rounded-lg border border-white/10">
              {snapshots.map((snap, idx) => (
                <div
                  key={snap.id}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
                    idx < snapshots.length - 1 ? 'border-b border-white/10' : ''
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{snap.label}</span>
                      <Badge variant="secondary" className="bg-white/10 text-white">snapshot</Badge>
                    </div>
                    <div className="text-xs text-white/60">Architecture changes: {snap.changes}</div>
                    <div className="flex flex-wrap gap-2">
                      {snap.flags.map((flag) => (
                        <Badge key={`${snap.id}-${flag}`} variant="outline" className="border-white/20 text-white/70">
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" className="text-white/80 hover:text-white">
                    Compare with previous
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function toInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildDiffFromInput(input: DiffInput): DiffObject {
  const start = new Date(input.start_timestamp).getTime();
  const end = new Date(input.end_timestamp).getTime();
  const rangeDays = Math.max(1, Math.round(Math.abs(end - start) / (1000 * 60 * 60 * 24)));
  const scopeWeight = input.scope === 'org' ? 3 : input.scope === 'project' ? 2 : 1;
  const sourceWeight = Math.max(1, input.sources.length);
  const base = rangeDays * scopeWeight * sourceWeight;

  return {
    tickets_moved: Math.max(1, Math.round(base * 0.3)),
    tickets_completed: Math.max(1, Math.round(base * 0.18)),
    tickets_regressed: Math.max(0, scopeWeight - 1),
    tickets_created: Math.max(1, Math.round(rangeDays * 0.4)),
    prs_opened: Math.max(1, scopeWeight + sourceWeight + 2),
    prs_merged: Math.max(1, Math.round(base * 0.08)),
    prs_closed: Math.max(0, sourceWeight - 1),
    commits_default: Math.max(1, Math.round(base * 0.5)),
    repos_touched: buildReposTouched(input.scope),
    architecture_changes: buildArchitectureChanges(input.scope),
  };
}

function buildReposTouched(scope: DiffScope): string[] {
  if (scope === 'repo') return ['canon/frontend'];
  if (scope === 'project') return ['canon/frontend', 'canon/backend'];
  return ['canon/frontend', 'canon/backend', 'canon/ops'];
}

function buildArchitectureChanges(scope: DiffScope): Array<{ label: 'node_added' | 'node_modified' | 'node_removed'; detail: string }> {
  return [
    { label: 'node_added', detail: scope === 'repo' ? 'services/diff-engine' : 'platform/diff-engine' },
    { label: 'node_modified', detail: 'infra/k8s/gateway.yaml' },
    { label: 'node_removed', detail: 'legacy/etl-sync' },
  ];
}

function buildWeeklyMarkdown(diff: DiffObject): string {
  const stalled = Math.max(0, diff.tickets_moved - diff.tickets_completed);
  return [
    '## What shipped',
    `- ${diff.tickets_completed} tickets moved to Done`,
    `- ${diff.prs_merged} PRs merged`,
    '',
    '## What changed',
    `- ${diff.tickets_moved} tickets moved across states`,
    `- ${diff.prs_opened} PRs opened`,
    '',
    '## What stalled',
    `- ${stalled} tickets unchanged 7 days`,
  ].join('\n');
}

function seedSnapshots(): Array<{ id: string; label: string; changes: number; flags: string[] }> {
  const now = new Date();
  return [0, 1, 2].map((offset) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - offset);
    const label = formatSnapshotLabel(d);
    return {
      id: `${label}-${offset}`,
      label,
      changes: 6 + offset * 2,
      flags: offset === 0 ? ['node_added', 'node_modified'] : ['node_modified'],
    };
  });
}

function formatSnapshotLabel(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function ModeSwitcher({ active, onChange }: ModeSwitcherProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ModeCard
        active={active === 'knowledge'}
        title="Knowledge"
        subtitle="Audience-ready AKUs, pushes, and projections."
        icon={BookOpen}
        onClick={() => onChange('knowledge')}
      />
      <ModeCard
        active={active === 'diffs'}
        title="Diffs"
        subtitle="Timeboxed truth: Jira + GitHub diffs, weekly markdown, snapshots."
        icon={GitCompare}
        onClick={() => onChange('diffs')}
      />
    </div>
  );
}

function ModeCard({ active, title, subtitle, icon: Icon, onClick }: ModeCardProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'group flex items-start gap-3 rounded-xl border p-4 text-left transition',
        active
          ? 'border-white/60 bg-white/10 shadow-[0_12px_40px_rgba(255,255,255,0.08)]'
          : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'
      )}
    >
      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-lg border text-white',
        active ? 'border-white/70 bg-white text-black' : 'border-white/15 bg-white/5'
      )}>
        <Icon className={cn('h-5 w-5', active ? 'text-black' : 'text-white/80')} />
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-white">{title}</span>
          {active && (
            <Badge variant="secondary" className="bg-white/10 text-white">
              Active
            </Badge>
          )}
        </div>
        <p className="text-sm text-white/70">{subtitle}</p>
        <p className="text-xs text-white/50">
          {title === 'Knowledge' ? 'Uses source + audience filters' : 'Uses timebox + scope + sources'}
        </p>
      </div>
    </button>
  );
}

interface KnowledgeClientProps {
  sources: Source[];
}

export default function KnowledgeClient({ sources }: KnowledgeClientProps) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
  const [audienceOptions, setAudienceOptions] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushProvider, setPushProvider] = useState<'notion' | 'confluence' | null>(null);
  const [resources, setResources] = useState<Array<{ id: string; title: string; type: string; metadata?: Record<string, unknown> }>>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState<string>('');
  const [pushResult, setPushResult] = useState<{ status: 'idle' | 'pushing' | 'done' | 'error'; message?: string; details?: any[] }>({ status: 'idle' });
  const [activeTab, setActiveTab] = useState<Mode>('knowledge');
  const [knowledgeFilterTab, setKnowledgeFilterTab] = useState<FilterTab>('filters');


  // Initialize audiences directly from Supabase preference (persisted in auth metadata)
  useEffect(() => {
    let cancelled = false;

    async function loadPreferredAudiences() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const preferred =
          (Array.isArray(data.user?.user_metadata?.preferred_audiences) && data.user?.user_metadata?.preferred_audiences) ||
          (data.user?.user_metadata?.preferred_audience ? [data.user.user_metadata.preferred_audience] : []);

        if (cancelled) return;

        const cleanedPreferred = Array.from(
          new Set((preferred || []).filter((aud) => typeof aud === 'string' && aud.trim().length > 0))
        );

        setAudienceOptions(cleanedPreferred);
      } catch (err) {
        console.error('Unable to load preferred audiences', err);
      }
    }

    loadPreferredAudiences();
    const handleFocus = () => loadPreferredAudiences();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
      }
    };
  }, []);

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const loadItems = async () => {
    setLoading(true);
    try {
      const listRes = await fetch(`/api/knowledge`);
      const data = await listRes.json();
      const normalized = (Array.isArray(data) ? data : []).map((item, idx) => {
        const title = typeof item?.title === 'string' && item.title.trim().length > 0
          ? item.title.trim()
          : (Array.isArray(item?.scope_refs) && item.scope_refs[0]) || `AKU ${idx + 1}`;
        return { ...item, title };
      });
      setItems(normalized);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const allSourceIds = useMemo(() => sources.map((s) => s.id), [sources]);

  const toggleAllSources = () => {
    setSelectedSourceIds((prev) =>
      prev.length === allSourceIds.length ? [] : allSourceIds
    );
  };

  const toggleAudience = (audience: string) => {
    setSelectedAudiences((prev) =>
      prev.includes(audience) ? prev.filter((a) => a !== audience) : [...prev, audience]
    );
  };

  const clearAudiences = () => setSelectedAudiences([]);
  const selectAllAudiences = () => setSelectedAudiences(audienceOptions);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const resetFilters = () => {
    setSelectedSourceIds([]);
    setSelectedAudiences([]);
    setSelectedCategories([]);
    setItems([]);
  };

  const itemsFilteredBySources = useMemo(() => {
    if (selectedSourceIds.length === 0) return items;
    return items.filter((item) =>
      Array.isArray(item.source_ids) && item.source_ids.some((id) => selectedSourceIds.includes(id))
    );
  }, [items, selectedSourceIds]);

  const projectedItems = useMemo(() => {
    return itemsFilteredBySources.map((item) => {
      // fallback: generate projection client-side if not present
      const projections =
        item.projections && item.projections.length > 0
          ? item.projections
          : selectedAudiences.map((aud) => ({
            audience: aud,
            projection: projectForAudience(item, aud),
            status: 'draft',
          }));

      // Ensure a stable first projection for rendering when tabs are hidden
      const orderedProjections = selectedAudiences.length
        ? projections.sort((a, b) => {
          const ai = selectedAudiences.indexOf(a.audience);
          const bi = selectedAudiences.indexOf(b.audience);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        })
        : projections;

      return { ...item, projections: orderedProjections };
    });
  }, [items, selectedAudiences]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      if (title) set.add(title);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const visibleItems = useMemo(() => {
    return projectedItems.filter((item) => {
      if (selectedCategories.length === 0) return true;
      return selectedCategories.includes(item.title);
    });
  }, [projectedItems, selectedCategories]);

  // Auto-sync when sources or audience preferences change
  useEffect(() => {
    if (selectedSourceIds.length === 0 || selectedAudiences.length === 0) return;
    const id = setTimeout(() => {
      loadItems();
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSourceIds, selectedAudiences]);

  useEffect(() => {
    // Drop categories that no longer exist after refresh
    setSelectedCategories((prev) => prev.filter((c) => categories.includes(c)));
  }, [categories]);

  const filtersReady = selectedSourceIds.length > 0 && selectedAudiences.length > 0;

  const openPushModal = () => {
    setShowPushModal(true);
    setPushResult({ status: 'idle' });
  };

  const loadResources = async (provider: 'notion' | 'confluence') => {
    try {
      setLoadingResources(true);
      setResources([]);
      setSelectedResourceId('');
      const url = new URL('/api/push/resources', window.location.origin);
      url.searchParams.set('provider', provider);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (data?.resources) {
        setResources(data.resources);
        if (data.resources[0]?.id) setSelectedResourceId(data.resources[0].id);
      }
    } catch (e) {
      console.error('Failed to load resources', e);
    } finally {
      setLoadingResources(false);
    }
  };

  const handleProviderSelect = (p: 'notion' | 'confluence') => {
    setPushProvider(p);
    loadResources(p);
  };

  const performPush = async () => {
    if (!pushProvider || !selectedResourceId) return;
    setPushResult({ status: 'pushing' });
    try {
      const resourceMeta = resources.find((r) => r.id === selectedResourceId)?.metadata || undefined;
      const resp = await fetch('/api/knowledge/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: pushProvider,
          rootResourceId: selectedResourceId,
          rootMetadata: resourceMeta,
          audiences: selectedAudiences.length ? selectedAudiences : undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || 'Push failed');
      }
      setPushResult({ status: 'done', details: data.results, message: 'Push complete' });
    } catch (e: any) {
      setPushResult({ status: 'error', message: e?.message || 'Push failed' });
    }
  };

  return (
    <>
      <div className="mb-6 space-y-4">
        <ModeSwitcher active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'knowledge' ? (
        <SidebarProvider defaultOpen className="w-full">
          <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
            <div className="flex flex-col gap-6 lg:self-start">
              <Sidebar className="lg:self-start">
                <SidebarHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                      {(['filters', 'automation', 'review'] as FilterTab[]).map((tab) => {
                        const active = knowledgeFilterTab === tab;
                        return (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setKnowledgeFilterTab(tab)}
                            className={cn(
                              'relative pb-1 font-normal transition-colors',
                              active ? 'after:absolute after:left-0 after:bottom-0 after:h-[2px] after:w-full after:bg-white after:content-[""]' : 'hover:[&_.tab-label]:text-white/80'
                            )}
                          >
                            <span className={cn('tab-label text-[11px] uppercase tracking-[0.2em] text-white/50', active && 'text-white')}>
                              {tab}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </SidebarHeader>

                <SidebarContent>
                  {knowledgeFilterTab === 'filters' && (
                    <>
                      <SidebarGroup>
                        <SidebarGroupLabel>Sources</SidebarGroupLabel>
                        <SidebarGroupContent>
                          <Popover open={sourceMenuOpen} onOpenChange={setSourceMenuOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                id="source-select"
                                variant="outline"
                                role="combobox"
                                aria-expanded={sourceMenuOpen}
                                className="w-full justify-between border-white/20 bg-neutral-800 hover:bg-neutral-700 hover:border-white/30"
                                onClick={() => setSourceMenuOpen(!sourceMenuOpen)}
                              >
                                <span className="truncate">
                                  {selectedSourceIds.length > 0
                                    ? `${selectedSourceIds.length} source${selectedSourceIds.length === 1 ? '' : 's'} selected`
                                    : 'Choose sources'}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search sources..." />
                                <CommandList>
                                  <CommandEmpty>No sources found.</CommandEmpty>
                                  <CommandGroup>
                                    {sources.map((s) => {
                                      const checked = selectedSourceIds.includes(s.id);
                                      const handleToggle = () => toggleSource(s.id);
                                      return (
                                        <CommandItem
                                          key={s.id}
                                          value={`${s.name} ${s.provider}`}
                                          onSelect={() => {
                                            handleToggle();
                                          }}
                                          className="cursor-pointer"
                                        >
                                          <Checkbox
                                            checked={checked}
                                            onCheckedChange={() => {
                                              handleToggle();
                                            }}
                                            className="mr-2"
                                          />
                                          <span className="flex-1 truncate">
                                            <span className="text-white/60">[{s.provider}]</span> {s.name}
                                          </span>
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                              <Separator />
                              <div className="flex items-center justify-between px-3 py-2">
                                <span className="text-xs text-white/60">
                                  {selectedSourceIds.length} of {allSourceIds.length} selected
                                </span>
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedSourceIds([])}
                                  >
                                    Clear
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      toggleAllSources();
                                      setSourceMenuOpen(false);
                                    }}
                                  >
                                    {selectedSourceIds.length === allSourceIds.length ? 'Deselect all' : 'Select all'}
                                  </Button>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                          <div className="flex items-center justify-between text-xs text-white/60">
                            <span>{selectedSourceIds.length} chosen</span>
                            <Button variant="ghost" size="sm" onClick={toggleAllSources}>
                              {selectedSourceIds.length === allSourceIds.length ? 'Clear all' : 'Select all'}
                            </Button>
                          </div>
                        </SidebarGroupContent>
                      </SidebarGroup>

                      <SidebarGroup>
                        <SidebarGroupLabel>Audiences</SidebarGroupLabel>
                        <SidebarGroupContent>
                          {audienceOptions.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {audienceOptions.map((aud) => {
                                const active = selectedAudiences.includes(aud);
                                return (
                                  <Button
                                    key={aud}
                                    variant={active ? 'secondary' : 'ghost'}
                                    size="sm"
                                    className={cn(
                                      'border',
                                      active
                                        ? 'border-white/70 bg-white text-black shadow-[0_18px_50px_rgba(0,0,0,0.5)] ring-2 ring-white ring-offset-1 ring-offset-black'
                                        : 'border-white/15 text-white/80 hover:border-white/25 hover:text-white'
                                    )}
                                    onClick={() => toggleAudience(aud)}
                                  >
                                    {active && <Check className="mr-1.5 h-4 w-4" />}
                                    {aud}
                                  </Button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                              No audiences configured. Set them in Settings → Preferences.
                            </div>
                          )}
                          <div className="flex items-center justify-between text-xs text-white/70">
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={clearAudiences}>
                                Clear
                              </Button>
                              <Button variant="ghost" size="sm" onClick={selectAllAudiences}>
                                All
                              </Button>
                            </div>
                          </div>
                        </SidebarGroupContent>
                      </SidebarGroup>

                      <SidebarGroup>
                        <SidebarGroupLabel>Units</SidebarGroupLabel>
                        <SidebarGroupContent>
                          {categories.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {categories.map((cat) => {
                                const active = selectedCategories.includes(cat);
                                return (
                                  <Button
                                    key={cat}
                                    variant={active ? 'secondary' : 'ghost'}
                                    size="sm"
                                    className={cn(
                                      'border',
                                      active
                                        ? 'border-white/70 bg-white text-black shadow-[0_18px_50px_rgba(0,0,0,0.5)] ring-2 ring-white ring-offset-1 ring-offset-black'
                                        : 'border-white/15 text-white/80 hover:border-white/25 hover:text-white'
                                    )}
                                    onClick={() => toggleCategory(cat)}
                                  >
                                    {active && <Check className="mr-1.5 h-4 w-4" />}
                                    {cat}
                                  </Button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                              Categories will appear once knowledge is generated for selected sources.
                            </div>
                          )}
                          <div className="flex items-center justify-between text-xs text-white/70">
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setSelectedCategories([])}>
                                Clear
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setSelectedCategories(categories)}>
                                All
                              </Button>
                            </div>
                          </div>
                        </SidebarGroupContent>
                      </SidebarGroup>
                    </>
                  )}

                  {knowledgeFilterTab === 'automation' && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
                      Automation config placeholder — hook automation rules here.
                    </div>
                  )}

                  {knowledgeFilterTab === 'review' && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
                      Review config placeholder — add review workflows here.
                    </div>
                  )}
                </SidebarContent>

                <SidebarFooter>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={loadItems}
                      disabled={loading}
                      className="border-white/20 bg-white/10 text-white hover:bg-white/15"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Syncing...
                        </span>
                      ) : (
                        'Refresh knowledge'
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetFilters}
                      className="text-white/70 hover:text-white"
                    >
                      Reset
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-white/60">Auto-syncs whenever filters change.</p>
                </SidebarFooter>
              </Sidebar>

              <div
                className={cn(
                  'group/sidebar relative w-full max-w-xl sm:max-w-xs sm:w-80 lg:max-w-[320px] rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl',
                  'transition-all duration-300 ease-in-out translate-y-0 opacity-100 pointer-events-auto'
                )}
              >
                <Button
                  variant="secondary"
                  onClick={openPushModal}
                  className="w-full border-white/30 bg-white/10 text-white hover:bg-white/15"
                >
                  Push to KB
                </Button>
              </div>
            </div>

            <SidebarInset className="space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedSourceIds.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {selectedSourceIds.length} source{selectedSourceIds.length === 1 ? '' : 's'}
                      </Badge>
                    )}
                    {selectedAudiences.length > 0 && (
                      <Badge variant="outline" className="border-white/20 text-xs text-white/80">
                        {selectedAudiences.join(' · ')}
                      </Badge>
                    )}
                    {selectedCategories.length > 0 && (
                      <Badge variant="outline" className="border-white/20 text-xs text-white/80">
                        {selectedCategories.join(' · ')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {loading && (
                <Alert>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <AlertDescription>Loading knowledge units...</AlertDescription>
                </Alert>
              )}

              {!loading && items.length === 0 && (
                <Alert variant="default">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    No knowledge loaded yet. Click “Refresh knowledge” to pull everything, or pick filters to view a subset.
                  </AlertDescription>
                </Alert>
              )}

              {!loading && filtersReady && visibleItems.length === 0 && (
                <Alert variant="default">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    No knowledge units found. Try adjusting your filters or selecting different sources.
                  </AlertDescription>
                </Alert>
              )}

              {visibleItems.length > 0 && (
                <div className="space-y-4">
                  {visibleItems.map((item) => (
                    <Card key={item.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-white text-lg mb-1">{item.title}</CardTitle>
                            <CardDescription className="flex items-center gap-2 mt-1">
                              {item.updated_at && (
                                <>
                                  <span>{new Date(item.updated_at).toLocaleDateString()}</span>
                                </>
                              )}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {selectedAudiences.length > 0 && (
                          <div className="space-y-3">
                            {(() => {
                              const activeAudience = selectedAudiences[0];
                              const proj =
                                item.projections?.find((p) => p.audience === activeAudience) ||
                                item.projections?.[0];
                              if (!proj) return null;
                              return (
                                <Card className="bg-white/5 border-white/10">
                                  <CardContent className="p-4 space-y-2">
                                    <div className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
                                      {proj.projection}
                                    </div>
                                    <div className="text-xs text-white/50">
                                      Status: {proj.status || 'draft'}
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })()}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </SidebarInset>
          </div>
        </SidebarProvider>
      ) : (
        <DiffPrototypePanel />
      )}

      <Dialog open={showPushModal} onOpenChange={setShowPushModal}>
        <DialogContent className="max-w-3xl border border-white/15 bg-neutral-950/95 text-white">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl">Push to Knowledge Base</DialogTitle>
            <DialogDescription className="text-white/70">
              Select where to publish your AKUs and audience views. Your current filters will be respected.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
            <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-white/60">Provider</p>
              <div className="grid gap-2">
                <Button
                  variant={pushProvider === 'notion' ? 'secondary' : 'outline'}
                  className="justify-start border-white/20 bg-white/5 hover:bg-white/10"
                  onClick={() => handleProviderSelect('notion')}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Notion
                  </span>
                </Button>
                <Button
                  variant={pushProvider === 'confluence' ? 'secondary' : 'outline'}
                  className="justify-start border-white/20 bg-white/5 hover:bg-white/10"
                  onClick={() => handleProviderSelect('confluence')}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-sky-400" />
                    Confluence
                  </span>
                </Button>
              </div>

              <div className="space-y-2 pt-2 text-sm text-white/70">
                <div className="flex items-center justify-between">
                  <span>AKUs</span>
                  <Badge variant="secondary" className="bg-white/10 text-white">
                    {items.length}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Audiences</span>
                  <Badge variant="outline" className="border-white/20 text-white">
                    {selectedAudiences.length > 0 ? selectedAudiences.join(' · ') : 'All configured'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {pushProvider ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-white/70">
                      Destination ({pushProvider}) — pick where System Knowledge will live.
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white/70 hover:text-white"
                      onClick={() => loadResources(pushProvider)}
                    >
                      Refresh
                    </Button>
                  </div>

                  {loadingResources ? (
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading {pushProvider} resources...
                    </div>
                  ) : resources.length === 0 ? (
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                      No resources found for this provider. Connect a space/page and try again.
                    </div>
                  ) : (
                    <div className="grid gap-2 max-h-60 overflow-y-auto">
                      {resources.map((r, idx) => (
                        <button
                          key={`${r.id}-${idx}`}
                          className={cn(
                            'w-full rounded-lg border p-3 text-left transition',
                            selectedResourceId === r.id
                              ? 'border-white/60 bg-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.35)]'
                              : 'border-white/10 bg-white/5 hover:border-white/30'
                          )}
                          onClick={() => setSelectedResourceId(r.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-white">{r.title}</div>
                            <Badge variant="outline" className="border-white/20 text-xs text-white/70">
                              {r.type}
                            </Badge>
                          </div>
                          {r.metadata && (
                            <div className="mt-1 text-xs text-white/60">
                              {Object.entries(r.metadata)
                                .slice(0, 3)
                                .map(([k, v]) => `${k}: ${String(v)}`)
                                .join(' · ')}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                  Choose a provider to see destinations.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setShowPushModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  disabled={!pushProvider || !selectedResourceId || pushResult.status === 'pushing'}
                  onClick={performPush}
                >
                  {pushResult.status === 'pushing' ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Pushing...
                    </span>
                  ) : (
                    'Push'
                  )}
                </Button>
              </div>

              {pushResult.status === 'error' && (
                <Alert variant="default">
                  <AlertDescription>{pushResult.message}</AlertDescription>
                </Alert>
              )}
              {pushResult.status === 'done' && (
                <Alert variant="default">
                  <AlertDescription>
                    {pushResult.message}
                    {Array.isArray(pushResult.details) && pushResult.details.length > 0 && (
                      <div className="mt-2 text-xs text-white/80 space-y-1 max-h-48 overflow-y-auto">
                        {pushResult.details.map((d: any, idx: number) => (
                          <div key={d.key != null ? `${String(d.key)}-${idx}` : `detail-${idx}`}>
                            <Badge variant="outline" className="mr-2 border-white/20 text-white/70">
                              {d.status?.toUpperCase()}
                            </Badge>
                            {d.title}
                          </div>
                        ))}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
