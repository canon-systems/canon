'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
import { Loader2, ChevronsUpDown, Info, Check, BookOpen, GitCompare, CalendarIcon, Plus, Trash2, Pencil } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
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
import { Calendar, type DateRange } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
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
type DiffDelta = {
  tickets_moved: number;
  tickets_completed: number;
  tickets_regressed: number;
  tickets_created: number;
  prs_opened: number;
  prs_merged: number;
  prs_closed: number;
  commits_default: number;
  repos_added: string[];
  repos_removed: string[];
};

/** Connected source from /api/repos (workspace_sources) for Diff panel */
type ConnectedDiffSource = {
  id: string;
  name: string;
  provider: string;
  scope: Record<string, unknown> | null;
  display_name: string; // e.g. canon/repo1, jira/PROJ
};

type DiffInput = {
  start_timestamp: string;
  end_timestamp: string;
  sources: DiffSource[];
  scope: DiffScope;
  jira_project_key?: string;
  github_repos?: string[];
  source_ids?: string[];
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
type FilterTab = 'filters' | 'schedule';
type ModeCardProps = {
  active: boolean;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
};

/** Schedule communication channels. When kb is true, kb_provider and kb_resource_id are required for delivery. */
type ScheduleCommunication = {
  email?: boolean;
  kb?: boolean;
  slack?: boolean;
  /** Knowledge base target (when kb is true) */
  kb_provider?: 'notion' | 'confluence';
  kb_resource_id?: string;
  kb_connection_id?: string | null;
  kb_root_metadata?: Record<string, unknown>;
};

type DiffSchedule = {
  id: string;
  name: string;
  enabled: boolean;
  cadence: string; // 'daily' | 'weekly' | 'monthly'
  sourceIds: string[];
  communication: ScheduleCommunication;
  runAtTime: string | null;
  runAtTimezone: string | null;
  runAtWeekday: number | null; // 0 = Sunday .. 6 = Saturday, UTC
  runAtMonthDay: number | null; // 1-31 or 0 = last day of month, UTC (monthly only)
};

type ProjectionSchedule = {
  id: string;
  name: string;
  enabled: boolean;
  cadence: string;
  sourceIds: string[];
  audiences: string[];
  units: string[];
  communication: ScheduleCommunication;
  runAtTime: string | null;
  runAtTimezone: string | null;
  runAtWeekday: number | null;
  runAtMonthDay: number | null;
};

const CADENCE_PRESETS: Array<{ value: string; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

/** Day of week for run-at (0 = Sunday .. 6 = Saturday). Used for weekly/custom. */
const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

function cadenceUsesWeekday(cadence: string): boolean {
  return String(cadence).toLowerCase() === 'weekly';
}

function cadenceUsesMonthDay(cadence: string): boolean {
  return String(cadence).toLowerCase() === 'monthly';
}

function monthDayOrdinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/** Day of month for monthly: 1-31 = that day, 0 = last day of month. */
const MONTH_DAY_OPTIONS: Array<{ value: number; label: string }> = [
  ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1}${monthDayOrdinal(i + 1)} of month` })),
  { value: 0, label: 'Last day of month' },
];

function getCadenceLabel(cadence: string): string {
  if (!cadence) return 'Not set';
  switch (cadence) {
    case 'daily': return 'Daily';
    case 'weekly': return 'Weekly';
    case 'monthly': return 'Monthly';
    default: return cadence.length > 20 ? `${cadence.slice(0, 20)}…` : cadence;
  }
}

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

function getDisplayName(repo: { name: string; provider: string; scope: Record<string, unknown> | null }): string {
  const provider = (repo.provider || '').toLowerCase();
  const scope = repo.scope || {};
  if (provider === 'github' && typeof scope.repo === 'string') return scope.repo;
  if (provider === 'jira' && typeof scope.project === 'string') return `jira/${scope.project}`;
  return repo.name;
}

/** Start of today in UTC (00:00:00.000Z). */
function startOfTodayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 0, 0, 0, 0));
}

/** End of today in UTC (23:59:59.999Z). */
function endOfTodayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 23, 59, 59, 999));
}

/** Format an ISO timestamp as a date string in UTC (all diff times are UTC). */
function formatDateUTC(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { timeZone: 'UTC' });
}

/** Parse ISO string to UTC date parts and return a Date at noon UTC for that day (for calendar display). */
function isoToCalendarDate(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0));
}

function DiffPrototypePanel() {
  const defaultStart = useMemo(() => startOfTodayUTC(), []);
  const defaultEnd = useMemo(() => endOfTodayUTC(), []);

  const [diffInput, setDiffInput] = useState<DiffInput>({
    start_timestamp: defaultStart.toISOString(),
    end_timestamp: defaultEnd.toISOString(),
    sources: ['jira', 'github'],
    scope: 'org',
    jira_project_key: '',
    github_repos: [],
  });
  const [diffObject, setDiffObject] = useState<DiffObject>(() =>
    buildDiffFromInput({
      start_timestamp: defaultStart.toISOString(),
      end_timestamp: defaultEnd.toISOString(),
      sources: ['jira', 'github'],
      scope: 'org',
      jira_project_key: '',
      github_repos: [],
    })
  );
  const [diffFilterTab, setDiffFilterTab] = useState<FilterTab>('filters');
  const [diffCalendarOpen, setDiffCalendarOpen] = useState(false);
  const [pendingRangeFrom, setPendingRangeFrom] = useState<Date | undefined>(undefined);
  const [pendingRangeTo, setPendingRangeTo] = useState<Date | undefined>(undefined);
  const [baselineWindow, setBaselineWindow] = useState<{ start: string; end: string } | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [deltaObject, setDeltaObject] = useState<DiffDelta | null>(null);
  const [connectedSources, setConnectedSources] = useState<ConnectedDiffSource[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [reportSources, setReportSources] = useState<Array<{ id: string; name: string; display_name: string; provider: string }>>([]);
  const [diffSourceMenuOpen, setDiffSourceMenuOpen] = useState(false);
  const [diffSchedules, setDiffSchedules] = useState<DiffSchedule[]>([]);
  const [diffScheduleFormOpen, setDiffScheduleFormOpen] = useState(false);
  const [diffScheduleEditingId, setDiffScheduleEditingId] = useState<string | null>(null);
  const [diffScheduleFormName, setDiffScheduleFormName] = useState('');
  const [diffScheduleFormCadence, setDiffScheduleFormCadence] = useState('daily');
  const [diffScheduleFormSourceIds, setDiffScheduleFormSourceIds] = useState<string[]>([]);
  const [diffScheduleFormCommunication, setDiffScheduleFormCommunication] = useState<ScheduleCommunication>({ email: false, kb: false, slack: false });
  const [diffScheduleFormKbProvider, setDiffScheduleFormKbProvider] = useState<'notion' | 'confluence' | ''>('');
  const [diffScheduleFormKbResourceId, setDiffScheduleFormKbResourceId] = useState('');
  const [diffScheduleFormKbResources, setDiffScheduleFormKbResources] = useState<Array<{ id: string; title: string; type?: string; metadata?: Record<string, unknown> }>>([]);
  const [diffScheduleFormKbRootMetadata, setDiffScheduleFormKbRootMetadata] = useState<Record<string, unknown> | undefined>(undefined);
  const [diffScheduleFormKbResourcesLoading, setDiffScheduleFormKbResourcesLoading] = useState(false);
  const [diffScheduleFormRunAtTime, setDiffScheduleFormRunAtTime] = useState('');
  const [diffScheduleFormRunAtWeekday, setDiffScheduleFormRunAtWeekday] = useState<number>(1); // Monday
  const [diffScheduleFormRunAtMonthDay, setDiffScheduleFormRunAtMonthDay] = useState<number>(1); // 1st
  const [diffScheduleSourceMenuOpen, setDiffScheduleSourceMenuOpen] = useState(false);
  const [diffScheduleCadenceMenuOpen, setDiffScheduleCadenceMenuOpen] = useState(false);

  const diffAllSourceIds = useMemo(() => connectedSources.map((s) => s.id), [connectedSources]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/schedules?type=diff', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const list = (data.schedules || []) as Array<{
          id: string;
          name?: string;
          enabled?: boolean;
          cadence?: string;
          sourceIds?: string[];
          communication?: ScheduleCommunication;
          runAtTime?: string | null;
          runAtTimezone?: string | null;
          runAtWeekday?: number | null;
          runAtMonthDay?: number | null;
        }>;
        setDiffSchedules(
          list.map((s) => ({
            id: s.id,
            name: typeof s.name === 'string' ? s.name : 'Diff report',
            enabled: s.enabled !== false,
            cadence: typeof s.cadence === 'string' ? s.cadence : 'daily',
            sourceIds: Array.isArray(s.sourceIds) ? s.sourceIds : [],
            communication: {
              ...s.communication,
              email: !!s.communication?.email,
              kb: !!s.communication?.kb,
              slack: !!s.communication?.slack,
            },
            runAtTime: s.runAtTime ?? null,
            runAtTimezone: s.runAtTimezone ?? null,
            runAtWeekday: s.runAtWeekday ?? null,
            runAtMonthDay: s.runAtMonthDay ?? null,
          }))
        );
      } catch {
        if (!cancelled) setDiffSchedules([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleDiffAllSources = () => {
    setSelectedSourceIds((prev) =>
      prev.length === diffAllSourceIds.length ? [] : [...diffAllSourceIds]
    );
  };

  const canonicalInput = useMemo(
    () => ({
      start_timestamp: new Date(diffInput.start_timestamp).toISOString(),
      end_timestamp: new Date(diffInput.end_timestamp).toISOString(),
      sources: diffInput.sources,
      scope: diffInput.scope,
      jira_project_key: diffInput.jira_project_key,
      github_repos: diffInput.github_repos,
    }),
    [diffInput]
  );

  const deltaOrZero = useCallback(
    (field: keyof DiffDelta) => (deltaObject ? deltaObject[field] : 0),
    [deltaObject]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/repos');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        const withDisplay: ConnectedDiffSource[] = list
          .filter((r: { provider?: string }) => (r.provider || '').toLowerCase() === 'github' || (r.provider || '').toLowerCase() === 'jira')
          .map((r: { id: string; name: string; provider: string; scope: Record<string, unknown> | null }) => ({
            id: r.id,
            name: r.name,
            provider: r.provider,
            scope: r.scope ?? null,
            display_name: getDisplayName({ name: r.name, provider: r.provider, scope: r.scope }),
          }));
        if (!cancelled) {
          setConnectedSources(withDisplay);
          // Auto-select all sources when they're loaded
          if (withDisplay.length > 0) {
            setSelectedSourceIds(withDisplay.map((s) => s.id));
          }
        }
      } catch {
        if (!cancelled) setConnectedSources([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleConnectedSource = (id: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const loadDiffScheduleKbResources = async (provider: 'notion' | 'confluence', preserveResourceId?: string) => {
    setDiffScheduleFormKbResourcesLoading(true);
    setDiffScheduleFormKbResources([]);
    if (!preserveResourceId) {
      setDiffScheduleFormKbResourceId('');
      setDiffScheduleFormKbRootMetadata(undefined);
    }
    try {
      const url = new URL('/api/push/resources', window.location.origin);
      url.searchParams.set('provider', provider);
      const res = await fetch(url.toString(), { credentials: 'include' });
      const data = await res.json();
      const list = (data?.resources || []) as Array<{ id: string; title: string; type?: string; metadata?: Record<string, unknown> }>;
      setDiffScheduleFormKbResources(list);
      if (list.length > 0) {
        const keepId = preserveResourceId && list.some((r) => r.id === preserveResourceId) ? preserveResourceId : list[0].id;
        const chosen = list.find((r) => r.id === keepId) ?? list[0];
        setDiffScheduleFormKbResourceId(chosen.id);
        setDiffScheduleFormKbRootMetadata(chosen.metadata);
      }
    } catch (e) {
      console.error('Failed to load KB resources', e);
    } finally {
      setDiffScheduleFormKbResourcesLoading(false);
    }
  };

  const openDiffScheduleForm = (schedule?: DiffSchedule) => {
    if (schedule) {
      setDiffScheduleEditingId(schedule.id);
      setDiffScheduleFormName(schedule.name);
      setDiffScheduleFormCadence(schedule.cadence);
      setDiffScheduleFormSourceIds(schedule.sourceIds);
      setDiffScheduleFormCommunication(schedule.communication);
      setDiffScheduleFormRunAtTime(schedule.runAtTime ?? '09:00');
      setDiffScheduleFormRunAtWeekday(schedule.runAtWeekday ?? 1);
      setDiffScheduleFormRunAtMonthDay(schedule.runAtMonthDay ?? 1);
      const kbProvider = schedule.communication?.kb_provider ?? '';
      setDiffScheduleFormKbProvider(kbProvider);
      setDiffScheduleFormKbResourceId(schedule.communication?.kb_resource_id ?? '');
      setDiffScheduleFormKbRootMetadata(schedule.communication?.kb_root_metadata);
      setDiffScheduleFormKbResources([]);
      if (kbProvider === 'notion' || kbProvider === 'confluence') {
        loadDiffScheduleKbResources(kbProvider, schedule.communication?.kb_resource_id);
      }
    } else {
      setDiffScheduleEditingId(null);
      setDiffScheduleFormName('');
      setDiffScheduleFormCadence('daily');
      setDiffScheduleFormSourceIds(connectedSources.length > 0 ? connectedSources.map((s) => s.id) : []);
      setDiffScheduleFormCommunication({ email: false, kb: false, slack: false });
      setDiffScheduleFormRunAtTime('09:00');
      setDiffScheduleFormRunAtWeekday(1);
      setDiffScheduleFormRunAtMonthDay(1);
      setDiffScheduleFormKbProvider('');
      setDiffScheduleFormKbResourceId('');
      setDiffScheduleFormKbResources([]);
      setDiffScheduleFormKbRootMetadata(undefined);
    }
    setDiffScheduleFormOpen(true);
  };

  const closeDiffScheduleForm = () => {
    setDiffScheduleFormOpen(false);
    setDiffScheduleEditingId(null);
  };

  const saveDiffSchedule = async () => {
    const name = diffScheduleFormName.trim() || 'Diff report';
    const comm = { ...diffScheduleFormCommunication };
    if (comm.kb) {
      if (diffScheduleFormKbProvider && diffScheduleFormKbResourceId) {
        comm.kb_provider = diffScheduleFormKbProvider as 'notion' | 'confluence';
        comm.kb_resource_id = diffScheduleFormKbResourceId;
        comm.kb_root_metadata = diffScheduleFormKbRootMetadata;
      }
    } else {
      delete comm.kb_provider;
      delete comm.kb_resource_id;
      delete comm.kb_connection_id;
      delete comm.kb_root_metadata;
    }
    const body = {
      type: 'diff' as const,
      name,
      enabled: true,
      cadence: diffScheduleFormCadence,
      runAtTime: diffScheduleFormRunAtTime.trim() || null,
      runAtTimezone: 'UTC',
      runAtWeekday: cadenceUsesWeekday(diffScheduleFormCadence) ? diffScheduleFormRunAtWeekday : null,
      runAtMonthDay: cadenceUsesMonthDay(diffScheduleFormCadence) ? diffScheduleFormRunAtMonthDay : null,
      sourceIds: [...diffScheduleFormSourceIds],
      communication: comm,
    };
    try {
      if (diffScheduleEditingId) {
        const res = await fetch(`/api/schedules/${diffScheduleEditingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Failed to update schedule');
        }
        const data = await res.json();
        const s = data.schedule as { id: string; name?: string; enabled?: boolean; cadence?: string; sourceIds?: string[]; communication?: ScheduleCommunication; runAtTime?: string | null; runAtTimezone?: string | null; runAtWeekday?: number | null; runAtMonthDay?: number | null };
        setDiffSchedules((prev) =>
          prev.map((schedule) =>
            schedule.id === s.id
              ? {
                id: s.id,
                name: typeof s.name === 'string' ? s.name : name,
                enabled: s.enabled !== false,
                cadence: typeof s.cadence === 'string' ? s.cadence : body.cadence,
                sourceIds: Array.isArray(s.sourceIds) ? s.sourceIds : body.sourceIds,
                communication: {
                  ...s.communication,
                  email: !!s.communication?.email,
                  kb: !!s.communication?.kb,
                  slack: !!s.communication?.slack,
                },
                runAtTime: s.runAtTime ?? null,
                runAtTimezone: s.runAtTimezone ?? null,
                runAtWeekday: s.runAtWeekday ?? null,
                runAtMonthDay: s.runAtMonthDay ?? null,
              }
              : schedule
          )
        );
      } else {
        const res = await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Failed to create schedule');
        }
        const data = await res.json();
        const s = data.schedule as { id: string; name?: string; enabled?: boolean; cadence?: string; sourceIds?: string[]; communication?: ScheduleCommunication; runAtTime?: string | null; runAtTimezone?: string | null; runAtWeekday?: number | null; runAtMonthDay?: number | null };
        setDiffSchedules((prev) => [
          ...prev,
          {
            id: s.id,
            name: typeof s.name === 'string' ? s.name : name,
            enabled: s.enabled !== false,
            cadence: typeof s.cadence === 'string' ? s.cadence : body.cadence,
            sourceIds: Array.isArray(s.sourceIds) ? s.sourceIds : body.sourceIds,
            communication: {
              ...s.communication,
              email: !!s.communication?.email,
              kb: !!s.communication?.kb,
              slack: !!s.communication?.slack,
            },
            runAtTime: s.runAtTime ?? null,
            runAtTimezone: s.runAtTimezone ?? null,
            runAtWeekday: s.runAtWeekday ?? null,
            runAtMonthDay: s.runAtMonthDay ?? null,
          },
        ]);
      }
      closeDiffScheduleForm();
    } catch (err) {
      console.error('Save diff schedule failed:', err);
    }
  };

  const deleteDiffSchedule = async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to delete schedule');
      }
      setDiffSchedules((prev) => prev.filter((s) => s.id !== id));
      if (diffScheduleEditingId === id) closeDiffScheduleForm();
    } catch (err) {
      console.error('Delete diff schedule failed:', err);
    }
  };

  const toggleDiffScheduleEnabled = async (id: string) => {
    const schedule = diffSchedules.find((s) => s.id === id);
    if (!schedule) return;
    const nextEnabled = !schedule.enabled;
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to update schedule');
      }
      setDiffSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: nextEnabled } : s)));
    } catch (err) {
      console.error('Toggle diff schedule failed:', err);
    }
  };

  const toggleDiffScheduleFormSource = (sourceId: string) => {
    setDiffScheduleFormSourceIds((prev) =>
      prev.includes(sourceId) ? prev.filter((s) => s !== sourceId) : [...prev, sourceId]
    );
  };

  const runDiffCompare = useCallback(async () => {
    setCompareError(null);
    setCompareLoading(true);
    type CanonicalDiffResponse = {
      tickets_moved?: number;
      tickets_completed?: number;
      tickets_regressed?: number;
      tickets_created?: number;
      prs_opened?: number;
      prs_merged?: number;
      prs_closed?: number;
      commits_default?: number;
      repos_touched?: string[];
    };
    const toDiffObj = (d: CanonicalDiffResponse | null | undefined): DiffObject | null => {
      if (!d) return null;
      return {
        tickets_moved: d.tickets_moved ?? 0,
        tickets_completed: d.tickets_completed ?? 0,
        tickets_regressed: d.tickets_regressed ?? 0,
        tickets_created: d.tickets_created ?? 0,
        prs_opened: d.prs_opened ?? 0,
        prs_merged: d.prs_merged ?? 0,
        prs_closed: d.prs_closed ?? 0,
        commits_default: d.commits_default ?? 0,
        repos_touched: Array.isArray(d.repos_touched) ? d.repos_touched : [],
        architecture_changes: [],
      };
    };
    try {
      const useSourceIds = selectedSourceIds.length > 0;
      const body: Record<string, unknown> = {
        start_timestamp: diffInput.start_timestamp,
        end_timestamp: diffInput.end_timestamp,
        sources: diffInput.sources,
        scope: diffInput.scope,
      };
      if (useSourceIds) {
        body.source_ids = selectedSourceIds;
      } else {
        if (diffInput.jira_project_key) body.jira_project_key = diffInput.jira_project_key;
        if (diffInput.github_repos?.length) body.github_repos = diffInput.github_repos;
      }

      const res = await fetch('/api/diffs/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to generate diff');

      const primaryObj = toDiffObj(data?.primary) || buildDiffFromInput(diffInput);
      setDiffObject(primaryObj);

      if (data?.baseline?.window) {
        setBaselineWindow(data.baseline.window);
      } else {
        setBaselineWindow(null);
      }

      setDeltaObject(data?.delta || null);

      if (Array.isArray(data?.sources)) {
        setReportSources(
          data.sources.map((s: { id: string; name: string; display_name: string; provider: string }) => ({
            id: s.id,
            name: s.name,
            display_name: s.display_name,
            provider: s.provider,
          }))
        );
      } else {
        setReportSources([]);
      }

    } catch (e: unknown) {
      setCompareError(e instanceof Error ? e.message : 'Failed to generate diff');
    } finally {
      setCompareLoading(false);
    }
  }, [selectedSourceIds, diffInput]);

  // Clear report when date range changes so we never show a report that doesn't match the current selection.
  useEffect(() => {
    setBaselineWindow(null);
    setDeltaObject(null);
  }, [diffInput.start_timestamp, diffInput.end_timestamp]);

  // Regenerate diff whenever date range or source selection changes.
  // Intentionally omit compareLoading from deps: including it would re-run when loading
  // goes false after a compare, triggering another compare and an infinite loop.
  useEffect(() => {
    if (
      connectedSources.length === 0 ||
      selectedSourceIds.length === 0 ||
      compareLoading
    ) {
      return;
    }
    runDiffCompare();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compareLoading is a guard only; omit to avoid loop
  }, [
    diffInput.start_timestamp,
    diffInput.end_timestamp,
    selectedSourceIds,
    connectedSources.length,
    runDiffCompare,
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <SidebarProvider defaultOpen className="w-full">
        <Sidebar className="lg:self-start">
          <SidebarHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                {(['filters', 'schedule'] as FilterTab[]).map((tab) => {
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
              {compareLoading && (
                <Spinner className="size-5 shrink-0 text-white/80" aria-label="Loading diff" />
              )}
            </div>
          </SidebarHeader>

          <SidebarContent>
            {diffFilterTab === 'filters' && (
              <>
                <SidebarGroup>
                  <SidebarGroupLabel>Time range (UTC)</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <Popover open={diffCalendarOpen} onOpenChange={(open) => {
                      setDiffCalendarOpen(open);
                      if (open) {
                        setPendingRangeFrom(diffInput.start_timestamp ? isoToCalendarDate(diffInput.start_timestamp) : undefined);
                        setPendingRangeTo(diffInput.end_timestamp ? isoToCalendarDate(diffInput.end_timestamp) : undefined);
                      }
                    }}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal h-10 rounded-lg border border-white/60 bg-neutral-800 text-white hover:bg-neutral-700 hover:border-white/50',
                            !diffInput.start_timestamp && 'text-white/50'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {diffInput.start_timestamp && diffInput.end_timestamp ? (
                            <>
                              {formatDateUTC(diffInput.start_timestamp)} – {formatDateUTC(diffInput.end_timestamp)}
                            </>
                          ) : (
                            'Pick a date range'
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 border-white/10 bg-neutral-900" align="start">
                        <Calendar
                          mode="range"
                          defaultMonth={pendingRangeFrom ?? (diffInput.start_timestamp ? isoToCalendarDate(diffInput.start_timestamp) : new Date())}
                          selected={{
                            from: pendingRangeFrom ?? (diffInput.start_timestamp ? isoToCalendarDate(diffInput.start_timestamp) : undefined),
                            to: pendingRangeTo ?? (diffInput.end_timestamp ? isoToCalendarDate(diffInput.end_timestamp) : undefined),
                          }}
                          onSelect={(range: DateRange | undefined) => {
                            if (!range?.from) return;
                            setPendingRangeFrom(range.from);
                            setPendingRangeTo(range.to ?? range.from);
                          }}
                          numberOfMonths={1}
                          className="rounded-lg border-0"
                        />
                        <div className="flex justify-end gap-2 border-t border-white/10 p-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-white/20 bg-neutral-800 text-white hover:bg-neutral-700"
                            onClick={() => setDiffCalendarOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="bg-white text-black hover:bg-neutral-200"
                            onClick={() => {
                              if (pendingRangeFrom) {
                                const to = pendingRangeTo ?? pendingRangeFrom;
                                setDiffInput((prev) => ({
                                  ...prev,
                                  start_timestamp: new Date(Date.UTC(pendingRangeFrom.getFullYear(), pendingRangeFrom.getMonth(), pendingRangeFrom.getDate(), 0, 0, 0, 0)).toISOString(),
                                  end_timestamp: new Date(Date.UTC(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)).toISOString(),
                                }));
                              }
                              setDiffCalendarOpen(false);
                            }}
                          >
                            Apply
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                  <SidebarGroupLabel>Sources</SidebarGroupLabel>
                  <SidebarGroupContent>
                    {connectedSources.length === 0 ? (
                      <p className="text-xs text-white/50">No GitHub or Jira sources connected. Add them on the Sources page.</p>
                    ) : (
                      <>
                        <Popover open={diffSourceMenuOpen} onOpenChange={setDiffSourceMenuOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={diffSourceMenuOpen}
                              className="w-full justify-between border-white/20 bg-neutral-800 hover:bg-neutral-700 hover:border-white/30"
                              onClick={() => setDiffSourceMenuOpen(!diffSourceMenuOpen)}
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
                                  {connectedSources.map((src) => {
                                    const checked = selectedSourceIds.includes(src.id);
                                    const handleToggle = () => toggleConnectedSource(src.id);
                                    return (
                                      <CommandItem
                                        key={src.id}
                                        value={`${src.display_name} ${src.provider}`}
                                        onSelect={() => handleToggle()}
                                        className="cursor-pointer"
                                      >
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={() => handleToggle()}
                                          className="mr-2"
                                        />
                                        <span className="flex-1 truncate">
                                          <span className="text-white/60">[{src.provider}]</span> {src.display_name}
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
                                {selectedSourceIds.length} of {diffAllSourceIds.length} selected
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
                                    toggleDiffAllSources();
                                    setDiffSourceMenuOpen(false);
                                  }}
                                >
                                  {selectedSourceIds.length === diffAllSourceIds.length ? 'Deselect all' : 'Select all'}
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <div className="flex items-center justify-between text-xs text-white/60 mt-2">
                          <span>{selectedSourceIds.length} chosen</span>
                          <Button variant="ghost" size="sm" onClick={toggleDiffAllSources}>
                            {selectedSourceIds.length === diffAllSourceIds.length ? 'Clear all' : 'Select all'}
                          </Button>
                        </div>
                      </>
                    )}
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}

            {diffFilterTab === 'schedule' && (
              <>
                <SidebarGroup>
                  <SidebarGroupContent className="space-y-3">
                    {diffSchedules.length === 0 && !diffScheduleFormOpen && (
                      <p className="text-xs text-white/50">No schedules yet. Add one to run diff reports on a cadence.</p>
                    )}
                    {diffSchedules.map((sched) => (
                      <div
                        key={sched.id}
                        className={cn(
                          'rounded-xl border p-3 text-left transition',
                          sched.enabled ? 'border-white/30 bg-white/10' : 'border-white/10 bg-white/5'
                        )}
                      >
                        <p className="text-sm font-medium text-white truncate">{sched.name}</p>
                        <div className="flex items-center justify-start gap-1 mt-1">
                          <Switch
                            checked={sched.enabled}
                            onCheckedChange={() => toggleDiffScheduleEnabled(sched.id)}
                          />
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:text-white" onClick={() => openDiffScheduleForm(sched)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:text-red-300" onClick={() => deleteDiffSchedule(sched.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-white/50 mt-1">{getCadenceLabel(sched.cadence)} · {sched.sourceIds.length} source{sched.sourceIds.length === 1 ? '' : 's'}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {sched.communication.email && <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">Email</Badge>}
                          {sched.communication.kb && <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">KB</Badge>}
                          {sched.communication.slack && <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">Slack</Badge>}
                        </div>
                      </div>
                    ))}
                    {!diffScheduleFormOpen && (
                      <Button variant="outline" size="sm" className="w-full border-white/20 bg-white/5 hover:bg-white/10 text-white" onClick={() => openDiffScheduleForm()}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add schedule
                      </Button>
                    )}
                  </SidebarGroupContent>
                </SidebarGroup>
                {diffScheduleFormOpen && (
                  <SidebarGroup>
                    <SidebarGroupLabel>{diffScheduleEditingId ? 'Edit schedule' : 'New schedule'}</SidebarGroupLabel>
                    <SidebarGroupContent className="space-y-3">
                      <div>
                        <label className="text-xs text-white/60 block mb-1">Name</label>
                        <Input
                          value={diffScheduleFormName}
                          onChange={(e) => setDiffScheduleFormName(e.target.value)}
                          placeholder="e.g. Weekly diff report"
                          className="h-9 border-white/20 bg-neutral-800 text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-white/60 block mb-1.5">Cadence</label>
                        <Popover open={diffScheduleCadenceMenuOpen} onOpenChange={setDiffScheduleCadenceMenuOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={diffScheduleCadenceMenuOpen}
                              className="w-full justify-between border-white/20 bg-neutral-800 hover:bg-neutral-700 hover:border-white/30 text-white text-sm h-9"
                            >
                              <span className="truncate">{getCadenceLabel(diffScheduleFormCadence)}</span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 border-white/10 bg-neutral-900" align="start">
                            <Command>
                              <CommandList>
                                <CommandGroup>
                                  {CADENCE_PRESETS.map((p) => (
                                    <CommandItem
                                      key={p.value}
                                      value={p.label}
                                      onSelect={() => {
                                        setDiffScheduleFormCadence(p.value);
                                        setDiffScheduleCadenceMenuOpen(false);
                                      }}
                                      className="cursor-pointer"
                                    >
                                      <Checkbox
                                        checked={diffScheduleFormCadence === p.value}
                                        className="mr-2 pointer-events-none"
                                      />
                                      <span className="text-white/90">{p.label}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <div className="flex flex-col gap-2">
                          {cadenceUsesMonthDay(diffScheduleFormCadence) && (
                            <div>
                              <label className="text-[11px] text-white/50 block mb-1">Day of month</label>
                              <select
                                value={diffScheduleFormRunAtMonthDay}
                                onChange={(e) => setDiffScheduleFormRunAtMonthDay(Number(e.target.value))}
                                className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
                              >
                                {MONTH_DAY_OPTIONS.map((d) => (
                                  <option key={d.value} value={d.value}>
                                    {d.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          {cadenceUsesWeekday(diffScheduleFormCadence) && (
                            <div>
                              <label className="text-[11px] text-white/50 block mb-1">Day of week</label>
                              <select
                                value={diffScheduleFormRunAtWeekday}
                                onChange={(e) => setDiffScheduleFormRunAtWeekday(Number(e.target.value))}
                                className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
                              >
                                {WEEKDAY_OPTIONS.map((d) => (
                                  <option key={d.value} value={d.value}>
                                    {d.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          <div>
                            <label className="text-[11px] text-white/50 block mb-1">Time</label>
                            <input
                              type="time"
                              value={diffScheduleFormRunAtTime}
                              onChange={(e) => setDiffScheduleFormRunAtTime(e.target.value)}
                              className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none [color-scheme:dark]"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <SidebarGroupLabel className="text-xs text-white/60 mb-1.5">Sources</SidebarGroupLabel>
                        <Popover open={diffScheduleSourceMenuOpen} onOpenChange={setDiffScheduleSourceMenuOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-between border-white/20 bg-neutral-800 hover:bg-neutral-700 hover:border-white/30 text-white text-sm"
                            >
                              <span className="truncate">
                                {diffScheduleFormSourceIds.length > 0
                                  ? `${diffScheduleFormSourceIds.length} source${diffScheduleFormSourceIds.length === 1 ? '' : 's'} selected`
                                  : 'Choose sources'}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 border-white/10 bg-neutral-900" align="start">
                            <Command>
                              <CommandInput placeholder="Search sources..." className="text-white" />
                              <CommandList>
                                <CommandEmpty>No sources found.</CommandEmpty>
                                <CommandGroup>
                                  {connectedSources.map((src) => {
                                    const checked = diffScheduleFormSourceIds.includes(src.id);
                                    return (
                                      <CommandItem
                                        key={src.id}
                                        value={`${src.display_name} ${src.provider}`}
                                        onSelect={() => toggleDiffScheduleFormSource(src.id)}
                                        className="cursor-pointer"
                                      >
                                        <Checkbox checked={checked} onCheckedChange={() => toggleDiffScheduleFormSource(src.id)} className="mr-2" />
                                        <span className="flex-1 truncate text-white/90">[{src.provider}] {src.display_name}</span>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <label className="text-xs text-white/60 block mb-1.5">Communication</label>
                        <div className="flex flex-wrap gap-2">
                          <label className="flex items-center gap-2 cursor-pointer text-sm text-white/80">
                            <Checkbox
                              checked={diffScheduleFormCommunication.email ?? false}
                              onCheckedChange={(c) => setDiffScheduleFormCommunication((prev) => ({ ...prev, email: !!c }))}
                            />
                            Email
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm text-white/80">
                            <Checkbox
                              checked={diffScheduleFormCommunication.kb ?? false}
                              onCheckedChange={(c) => {
                                const kb = !!c;
                                setDiffScheduleFormCommunication((prev) => ({ ...prev, kb }));
                                if (!kb) {
                                  setDiffScheduleFormKbProvider('');
                                  setDiffScheduleFormKbResourceId('');
                                  setDiffScheduleFormKbResources([]);
                                  setDiffScheduleFormKbRootMetadata(undefined);
                                }
                              }}
                            />
                            KB
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm text-white/80">
                            <Checkbox
                              checked={diffScheduleFormCommunication.slack ?? false}
                              onCheckedChange={(c) => setDiffScheduleFormCommunication((prev) => ({ ...prev, slack: !!c }))}
                            />
                            Slack
                          </label>
                        </div>
                        {diffScheduleFormCommunication.kb && (
                          <div className="mt-3 space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
                            <span className="text-xs text-white/60">KB target</span>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant={diffScheduleFormKbProvider === 'notion' ? 'secondary' : 'ghost'}
                                size="sm"
                                className={diffScheduleFormKbProvider === 'notion' ? 'border-white/30 bg-white/10 text-white' : 'text-white/70 hover:text-white'}
                                onClick={() => {
                                  setDiffScheduleFormKbProvider('notion');
                                  loadDiffScheduleKbResources('notion');
                                }}
                              >
                                Notion
                              </Button>
                              <Button
                                type="button"
                                variant={diffScheduleFormKbProvider === 'confluence' ? 'secondary' : 'ghost'}
                                size="sm"
                                className={diffScheduleFormKbProvider === 'confluence' ? 'border-white/30 bg-white/10 text-white' : 'text-white/70 hover:text-white'}
                                onClick={() => {
                                  setDiffScheduleFormKbProvider('confluence');
                                  loadDiffScheduleKbResources('confluence');
                                }}
                              >
                                Confluence
                              </Button>
                            </div>
                            {diffScheduleFormKbProvider && (
                              <div>
                                <label className="text-xs text-white/60 block mb-1">Page or space</label>
                                {diffScheduleFormKbResourcesLoading ? (
                                  <span className="text-sm text-white/60">Loading...</span>
                                ) : diffScheduleFormKbResources.length === 0 ? (
                                  <span className="text-sm text-white/60">No resources found. Connect {diffScheduleFormKbProvider} in Settings.</span>
                                ) : (
                                  <select
                                    className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
                                    value={diffScheduleFormKbResourceId}
                                    onChange={(e) => {
                                      const id = e.target.value;
                                      const r = diffScheduleFormKbResources.find((res) => res.id === id);
                                      setDiffScheduleFormKbResourceId(id);
                                      setDiffScheduleFormKbRootMetadata(r?.metadata);
                                    }}
                                  >
                                    {diffScheduleFormKbResources.map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.title || r.id}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button variant="secondary" size="sm" className="flex-1 border-white/20 bg-white/10 text-white hover:bg-white/15" onClick={saveDiffSchedule}>
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" className="text-white/70 hover:text-white" onClick={closeDiffScheduleForm}>
                          Cancel
                        </Button>
                      </div>
                    </SidebarGroupContent>
                  </SidebarGroup>
                )}
              </>
            )}
          </SidebarContent>

          {diffFilterTab === 'filters' && compareError && (
            <SidebarFooter>
              <p className="text-xs text-red-300">{compareError}</p>
            </SidebarFooter>
          )}
        </Sidebar>
      </SidebarProvider>

      <div className="space-y-6">
        <Card className="border-white/10 bg-black/50">
          <CardHeader>
            <CardTitle>Diff report</CardTitle>
            <CardDescription>Results for the selected window (auto-baseline applied)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {reportSources.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-neutral-900/80 p-4">
                <h3 className="text-sm font-semibold text-white mb-2">Sources in this report</h3>
                <ul className="flex flex-wrap gap-2">
                  {reportSources.map((s) => (
                    <li key={s.id}>
                      <Badge variant="secondary" className="font-mono text-xs bg-white/10 text-white/90">
                        {s.display_name}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-lg border border-white/10 bg-neutral-900 p-4 font-mono text-xs text-white/80">
              <h3 className="text-sm font-semibold text-white mb-2">High-level metrics (all sources)</h3>
              <div className="mb-2 flex flex-col gap-1 text-white/70">
                <span>Primary: {formatDateUTC(canonicalInput.start_timestamp)} → {formatDateUTC(canonicalInput.end_timestamp)} (UTC)</span>
                {baselineWindow && (
                  <span>Baseline: {formatDateUTC(baselineWindow.start)} → {formatDateUTC(baselineWindow.end)} (UTC)</span>
                )}
              </div>
              <dl className="space-y-2 text-sm">
                {(
                  [
                    { label: 'Tickets moved', value: diffObject.tickets_moved, delta: deltaOrZero('tickets_moved') },
                    { label: 'Tickets completed', value: diffObject.tickets_completed, delta: deltaOrZero('tickets_completed') },
                    { label: 'Tickets regressed', value: diffObject.tickets_regressed, delta: deltaOrZero('tickets_regressed') },
                    { label: 'Tickets created', value: diffObject.tickets_created, delta: deltaOrZero('tickets_created') },
                    { label: 'PRs merged', value: diffObject.prs_merged, delta: deltaOrZero('prs_merged') },
                    { label: 'PRs opened', value: diffObject.prs_opened, delta: deltaOrZero('prs_opened') },
                    { label: 'PRs closed', value: diffObject.prs_closed, delta: deltaOrZero('prs_closed') },
                    { label: 'Commits to default', value: diffObject.commits_default, delta: deltaOrZero('commits_default') },
                  ] as Array<{ label: string; value: number; delta: number }>
                ).map((row) => (
                  <div key={row.label} className="flex items-center justify-between">
                    <dt className="text-white/80">{row.label}</dt>
                    <dd className="flex items-center gap-2 font-semibold text-white">
                      <span>{row.value}</span>
                      {deltaObject && (
                        <Badge variant="outline" className={cn('text-xs border-white/20', row.delta >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                          {row.delta >= 0 ? '+' : ''}
                          {row.delta}
                        </Badge>
                      )}
                    </dd>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <dt className="text-white/80">Repos touched</dt>
                  <dd className="flex items-center gap-2 font-semibold text-white">
                    <span>{diffObject.repos_touched.length}</span>
                    {deltaObject && (
                      <Badge variant="outline" className="text-xs border-white/20 text-emerald-300">
                        +{deltaObject.repos_added?.length ?? 0} / -{deltaObject.repos_removed?.length ?? 0}
                      </Badge>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
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
          {title === 'Knowledge' ? 'Uses source + audience filters' : 'Uses timebox + sources'}
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
  const [confluenceFolderId, setConfluenceFolderId] = useState<string>('');
  const [confluenceFolderOptions, setConfluenceFolderOptions] = useState<Array<{ id: string; title: string; metadata?: Record<string, unknown> }>>([]);
  const [loadingConfluenceFolders, setLoadingConfluenceFolders] = useState(false);
  type PushResultDetail = { key?: string; title?: string; status?: string };
  const [pushResult, setPushResult] = useState<{ status: 'idle' | 'pushing' | 'done' | 'error'; message?: string; details?: PushResultDetail[] }>({ status: 'idle' });
  const [activeTab, setActiveTab] = useState<Mode>('knowledge');
  const [knowledgeFilterTab, setKnowledgeFilterTab] = useState<FilterTab>('filters');
  const [projectionSchedules, setProjectionSchedules] = useState<ProjectionSchedule[]>([]);
  const [projectionScheduleFormOpen, setProjectionScheduleFormOpen] = useState(false);
  const [projectionScheduleEditingId, setProjectionScheduleEditingId] = useState<string | null>(null);
  const [projectionScheduleFormName, setProjectionScheduleFormName] = useState('');
  const [projectionScheduleFormCadence, setProjectionScheduleFormCadence] = useState('daily');
  const [projectionScheduleFormSourceIds, setProjectionScheduleFormSourceIds] = useState<string[]>([]);
  const [projectionScheduleFormAudiences, setProjectionScheduleFormAudiences] = useState<string[]>([]);
  const [projectionScheduleFormUnits, setProjectionScheduleFormUnits] = useState<string[]>([]);
  const [projectionScheduleFormCommunication, setProjectionScheduleFormCommunication] = useState<ScheduleCommunication>({ email: false, kb: false, slack: false });
  const [projectionScheduleFormKbProvider, setProjectionScheduleFormKbProvider] = useState<'notion' | 'confluence' | ''>('');
  const [projectionScheduleFormKbResourceId, setProjectionScheduleFormKbResourceId] = useState('');
  const [projectionScheduleFormKbResources, setProjectionScheduleFormKbResources] = useState<Array<{ id: string; title: string; type?: string; metadata?: Record<string, unknown> }>>([]);
  const [projectionScheduleFormKbRootMetadata, setProjectionScheduleFormKbRootMetadata] = useState<Record<string, unknown> | undefined>(undefined);
  const [projectionScheduleFormKbResourcesLoading, setProjectionScheduleFormKbResourcesLoading] = useState(false);
  const [projectionScheduleFormRunAtTime, setProjectionScheduleFormRunAtTime] = useState('');
  const [projectionScheduleFormRunAtWeekday, setProjectionScheduleFormRunAtWeekday] = useState<number>(1); // Monday
  const [projectionScheduleFormRunAtMonthDay, setProjectionScheduleFormRunAtMonthDay] = useState<number>(1); // 1st
  const [projectionScheduleSourceMenuOpen, setProjectionScheduleSourceMenuOpen] = useState(false);
  const [projectionScheduleCadenceMenuOpen, setProjectionScheduleCadenceMenuOpen] = useState(false);
  const [projectionScheduleAudienceMenuOpen, setProjectionScheduleAudienceMenuOpen] = useState(false);
  const [projectionScheduleUnitsMenuOpen, setProjectionScheduleUnitsMenuOpen] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/schedules?type=projection', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const list = (data.schedules || []) as Array<{
          id: string;
          name?: string;
          enabled?: boolean;
          cadence?: string;
          sourceIds?: string[];
          audiences?: string[];
          units?: string[];
          communication?: ScheduleCommunication;
          runAtTime?: string | null;
          runAtTimezone?: string | null;
          runAtWeekday?: number | null;
          runAtMonthDay?: number | null;
        }>;
        setProjectionSchedules(
          list.map((s) => ({
            id: s.id,
            name: typeof s.name === 'string' ? s.name : 'Projection report',
            enabled: s.enabled !== false,
            cadence: typeof s.cadence === 'string' ? s.cadence : 'daily',
            sourceIds: Array.isArray(s.sourceIds) ? s.sourceIds : [],
            audiences: Array.isArray(s.audiences) ? s.audiences : [],
            units: Array.isArray(s.units) ? s.units : [],
            communication: {
              ...s.communication,
              email: !!s.communication?.email,
              kb: !!s.communication?.kb,
              slack: !!s.communication?.slack,
            },
            runAtTime: s.runAtTime ?? null,
            runAtTimezone: s.runAtTimezone ?? null,
            runAtWeekday: s.runAtWeekday ?? null,
            runAtMonthDay: s.runAtMonthDay ?? null,
          }))
        );
      } catch {
        if (!cancelled) setProjectionSchedules([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const loadProjectionScheduleKbResources = async (provider: 'notion' | 'confluence', preserveResourceId?: string) => {
    setProjectionScheduleFormKbResourcesLoading(true);
    setProjectionScheduleFormKbResources([]);
    if (!preserveResourceId) {
      setProjectionScheduleFormKbResourceId('');
      setProjectionScheduleFormKbRootMetadata(undefined);
    }
    try {
      const url = new URL('/api/push/resources', window.location.origin);
      url.searchParams.set('provider', provider);
      const res = await fetch(url.toString(), { credentials: 'include' });
      const data = await res.json();
      const list = (data?.resources || []) as Array<{ id: string; title: string; type?: string; metadata?: Record<string, unknown> }>;
      setProjectionScheduleFormKbResources(list);
      if (list.length > 0) {
        const keepId = preserveResourceId && list.some((r) => r.id === preserveResourceId) ? preserveResourceId : list[0].id;
        const chosen = list.find((r) => r.id === keepId) ?? list[0];
        setProjectionScheduleFormKbResourceId(chosen.id);
        setProjectionScheduleFormKbRootMetadata(chosen.metadata);
      }
    } catch (e) {
      console.error('Failed to load KB resources', e);
    } finally {
      setProjectionScheduleFormKbResourcesLoading(false);
    }
  };

  const openProjectionScheduleForm = (schedule?: ProjectionSchedule) => {
    if (schedule) {
      setProjectionScheduleEditingId(schedule.id);
      setProjectionScheduleFormName(schedule.name);
      setProjectionScheduleFormCadence(schedule.cadence);
      setProjectionScheduleFormSourceIds(schedule.sourceIds);
      setProjectionScheduleFormAudiences(schedule.audiences);
      setProjectionScheduleFormUnits(schedule.units);
      setProjectionScheduleFormCommunication(schedule.communication);
      setProjectionScheduleFormRunAtTime(schedule.runAtTime ?? '09:00');
      setProjectionScheduleFormRunAtWeekday(schedule.runAtWeekday ?? 1);
      setProjectionScheduleFormRunAtMonthDay(schedule.runAtMonthDay ?? 1);
      const kbProvider = schedule.communication?.kb_provider ?? '';
      setProjectionScheduleFormKbProvider(kbProvider);
      setProjectionScheduleFormKbResourceId(schedule.communication?.kb_resource_id ?? '');
      setProjectionScheduleFormKbRootMetadata(schedule.communication?.kb_root_metadata);
      setProjectionScheduleFormKbResources([]);
      if (kbProvider === 'notion' || kbProvider === 'confluence') {
        loadProjectionScheduleKbResources(kbProvider, schedule.communication?.kb_resource_id);
      }
    } else {
      setProjectionScheduleEditingId(null);
      setProjectionScheduleFormName('');
      setProjectionScheduleFormCadence('daily');
      setProjectionScheduleFormSourceIds(sources.length > 0 ? sources.map((s) => s.id) : []);
      setProjectionScheduleFormAudiences([]);
      setProjectionScheduleFormUnits([]);
      setProjectionScheduleFormCommunication({ email: false, kb: false, slack: false });
      setProjectionScheduleFormRunAtTime('09:00');
      setProjectionScheduleFormRunAtWeekday(1);
      setProjectionScheduleFormRunAtMonthDay(1);
      setProjectionScheduleFormKbProvider('');
      setProjectionScheduleFormKbResourceId('');
      setProjectionScheduleFormKbResources([]);
      setProjectionScheduleFormKbRootMetadata(undefined);
    }
    setProjectionScheduleFormOpen(true);
  };

  const closeProjectionScheduleForm = () => {
    setProjectionScheduleFormOpen(false);
    setProjectionScheduleEditingId(null);
  };

  const saveProjectionSchedule = async () => {
    const name = projectionScheduleFormName.trim() || 'Projection report';
    const comm = { ...projectionScheduleFormCommunication };
    if (comm.kb) {
      if (projectionScheduleFormKbProvider && projectionScheduleFormKbResourceId) {
        comm.kb_provider = projectionScheduleFormKbProvider as 'notion' | 'confluence';
        comm.kb_resource_id = projectionScheduleFormKbResourceId;
        comm.kb_root_metadata = projectionScheduleFormKbRootMetadata;
      }
    } else {
      delete comm.kb_provider;
      delete comm.kb_resource_id;
      delete comm.kb_connection_id;
      delete comm.kb_root_metadata;
    }
    const body = {
      type: 'projection' as const,
      name,
      enabled: true,
      cadence: projectionScheduleFormCadence,
      runAtTime: projectionScheduleFormRunAtTime.trim() || null,
      runAtTimezone: 'UTC',
      runAtWeekday: cadenceUsesWeekday(projectionScheduleFormCadence) ? projectionScheduleFormRunAtWeekday : null,
      runAtMonthDay: cadenceUsesMonthDay(projectionScheduleFormCadence) ? projectionScheduleFormRunAtMonthDay : null,
      sourceIds: [...projectionScheduleFormSourceIds],
      audiences: [...projectionScheduleFormAudiences],
      units: [...projectionScheduleFormUnits],
      communication: comm,
    };
    try {
      if (projectionScheduleEditingId) {
        const res = await fetch(`/api/schedules/${projectionScheduleEditingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Failed to update schedule');
        }
        const data = await res.json();
        const s = data.schedule as {
          id: string;
          name?: string;
          enabled?: boolean;
          cadence?: string;
          sourceIds?: string[];
          audiences?: string[];
          units?: string[];
          communication?: ScheduleCommunication;
          runAtTime?: string | null;
          runAtTimezone?: string | null;
          runAtWeekday?: number | null;
          runAtMonthDay?: number | null;
        };
        setProjectionSchedules((prev) =>
          prev.map((schedule) =>
            schedule.id === s.id
              ? {
                id: s.id,
                name: typeof s.name === 'string' ? s.name : name,
                enabled: s.enabled !== false,
                cadence: typeof s.cadence === 'string' ? s.cadence : body.cadence,
                sourceIds: Array.isArray(s.sourceIds) ? s.sourceIds : body.sourceIds,
                audiences: Array.isArray(s.audiences) ? s.audiences : body.audiences,
                units: Array.isArray(s.units) ? s.units : body.units,
                communication: {
                  ...s.communication,
                  email: !!s.communication?.email,
                  kb: !!s.communication?.kb,
                  slack: !!s.communication?.slack,
                },
                runAtTime: s.runAtTime ?? null,
                runAtTimezone: s.runAtTimezone ?? null,
                runAtWeekday: s.runAtWeekday ?? null,
                runAtMonthDay: s.runAtMonthDay ?? null,
              }
              : schedule
          )
        );
      } else {
        const res = await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Failed to create schedule');
        }
        const data = await res.json();
        const s = data.schedule as {
          id: string;
          name?: string;
          enabled?: boolean;
          cadence?: string;
          sourceIds?: string[];
          audiences?: string[];
          units?: string[];
          communication?: ScheduleCommunication;
          runAtTime?: string | null;
          runAtTimezone?: string | null;
          runAtWeekday?: number | null;
          runAtMonthDay?: number | null;
        };
        setProjectionSchedules((prev) => [
          ...prev,
          {
            id: s.id,
            name: typeof s.name === 'string' ? s.name : name,
            enabled: s.enabled !== false,
            cadence: typeof s.cadence === 'string' ? s.cadence : body.cadence,
            sourceIds: Array.isArray(s.sourceIds) ? s.sourceIds : body.sourceIds,
            audiences: Array.isArray(s.audiences) ? s.audiences : body.audiences,
            units: Array.isArray(s.units) ? s.units : body.units,
            communication: {
              ...s.communication,
              email: !!s.communication?.email,
              kb: !!s.communication?.kb,
              slack: !!s.communication?.slack,
            },
            runAtTime: s.runAtTime ?? null,
            runAtTimezone: s.runAtTimezone ?? null,
            runAtWeekday: s.runAtWeekday ?? null,
            runAtMonthDay: s.runAtMonthDay ?? null,
          },
        ]);
      }
      closeProjectionScheduleForm();
    } catch (err) {
      console.error('Save projection schedule failed:', err);
    }
  };

  const deleteProjectionSchedule = async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to delete schedule');
      }
      setProjectionSchedules((prev) => prev.filter((s) => s.id !== id));
      if (projectionScheduleEditingId === id) closeProjectionScheduleForm();
    } catch (err) {
      console.error('Delete projection schedule failed:', err);
    }
  };

  const toggleProjectionScheduleEnabled = async (id: string) => {
    const schedule = projectionSchedules.find((s) => s.id === id);
    if (!schedule) return;
    const nextEnabled = !schedule.enabled;
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to update schedule');
      }
      setProjectionSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: nextEnabled } : s)));
    } catch (err) {
      console.error('Toggle projection schedule failed:', err);
    }
  };

  const toggleProjectionScheduleFormSource = (sourceId: string) => {
    setProjectionScheduleFormSourceIds((prev) =>
      prev.includes(sourceId) ? prev.filter((s) => s !== sourceId) : [...prev, sourceId]
    );
  };

  const toggleProjectionScheduleFormAudience = (audience: string) => {
    setProjectionScheduleFormAudiences((prev) =>
      prev.includes(audience) ? prev.filter((a) => a !== audience) : [...prev, audience]
    );
  };

  const toggleProjectionScheduleFormUnit = (unit: string) => {
    setProjectionScheduleFormUnits((prev) =>
      prev.includes(unit) ? prev.filter((u) => u !== unit) : [...prev, unit]
    );
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
  }, [itemsFilteredBySources, selectedAudiences]);

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
  }, [selectedSourceIds, selectedAudiences]);

  useEffect(() => {
    // Drop categories that no longer exist after refresh
    setSelectedCategories((prev) => prev.filter((c) => categories.includes(c)));
  }, [categories]);

  useEffect(() => {
    if (pushProvider === 'confluence' && selectedResourceId) {
      loadConfluenceFolders(selectedResourceId);
    } else {
      setConfluenceFolderId('');
      setConfluenceFolderOptions([]);
    }
  }, [pushProvider, selectedResourceId]);

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
      setConfluenceFolderId('');
      setConfluenceFolderOptions([]);
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

  const loadConfluenceFolders = async (spaceResourceId: string) => {
    const parts = spaceResourceId.split(':');
    if (parts.length < 2) return;
    const [cloudId, ...rest] = parts;
    const spaceId = rest.join(':');
    if (!cloudId || !spaceId) return;
    try {
      setLoadingConfluenceFolders(true);
      setConfluenceFolderId('');
      const url = new URL('/api/push/resources', window.location.origin);
      url.searchParams.set('provider', 'confluence');
      url.searchParams.set('cloudId', cloudId);
      url.searchParams.set('spaceId', spaceId);
      const res = await fetch(url.toString());
      const data = await res.json();
      const list = (data?.resources || []) as Array<{ id: string; title: string; type?: string; metadata?: Record<string, unknown> }>;
      setConfluenceFolderOptions(list);
    } catch (e) {
      console.error('Failed to load Confluence folders/pages', e);
      setConfluenceFolderOptions([]);
    } finally {
      setLoadingConfluenceFolders(false);
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
      const selectedSpace = resources.find((r) => r.id === selectedResourceId);
      const resourceMeta = selectedSpace?.metadata || undefined;
      const rootId =
        pushProvider === 'confluence' && confluenceFolderId
          ? confluenceFolderId
          : selectedResourceId;
      const rootMeta =
        pushProvider === 'confluence' && confluenceFolderId && selectedSpace?.metadata
          ? selectedSpace.metadata
          : resourceMeta;
      const resp = await fetch('/api/knowledge/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: pushProvider,
          rootResourceId: rootId,
          rootMetadata: rootMeta,
          audiences: selectedAudiences.length ? selectedAudiences : undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || 'Push failed');
      }
      setPushResult({ status: 'done', details: data.results, message: 'Push complete' });
    } catch (e: unknown) {
      setPushResult({ status: 'error', message: e instanceof Error ? e.message : 'Push failed' });
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
                      {(['filters', 'schedule'] as FilterTab[]).map((tab) => {
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

                  {knowledgeFilterTab === 'schedule' && (
                    <>
                      <SidebarGroup>
                        <SidebarGroupContent className="space-y-3">
                          {projectionSchedules.length === 0 && !projectionScheduleFormOpen && (
                            <p className="text-xs text-white/50">No schedules yet. Add one to run projection reports on a cadence.</p>
                          )}
                          {projectionSchedules.map((sched) => (
                            <div
                              key={sched.id}
                              className={cn(
                                'rounded-xl border p-3 text-left transition',
                                sched.enabled ? 'border-white/30 bg-white/10' : 'border-white/10 bg-white/5'
                              )}
                            >
                              <p className="text-sm font-medium text-white truncate">{sched.name}</p>
                              <div className="flex items-center justify-start gap-1 mt-1">
                                <Switch
                                  checked={sched.enabled}
                                  onCheckedChange={() => toggleProjectionScheduleEnabled(sched.id)}
                                />
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:text-white" onClick={() => openProjectionScheduleForm(sched)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:text-red-300" onClick={() => deleteProjectionSchedule(sched.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <p className="text-xs text-white/50 mt-1">
                                {getCadenceLabel(sched.cadence)} · {sched.sourceIds.length} source{sched.sourceIds.length === 1 ? '' : 's'}
                                {sched.audiences.length > 0 && ` · ${sched.audiences.length} audience${sched.audiences.length === 1 ? '' : 's'}`}
                                {sched.units.length > 0 && ` · ${sched.units.length} unit${sched.units.length === 1 ? '' : 's'}`}
                              </p>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {sched.communication.email && <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">Email</Badge>}
                                {sched.communication.kb && <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">KB</Badge>}
                                {sched.communication.slack && <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">Slack</Badge>}
                              </div>
                            </div>
                          ))}
                          {!projectionScheduleFormOpen && (
                            <Button variant="outline" size="sm" className="w-full border-white/20 bg-white/5 hover:bg-white/10 text-white" onClick={() => openProjectionScheduleForm()}>
                              <Plus className="h-4 w-4 mr-2" />
                              Add schedule
                            </Button>
                          )}
                        </SidebarGroupContent>
                      </SidebarGroup>
                      {projectionScheduleFormOpen && (
                        <SidebarGroup>
                          <SidebarGroupLabel>{projectionScheduleEditingId ? 'Edit schedule' : 'New schedule'}</SidebarGroupLabel>
                          <SidebarGroupContent className="space-y-3">
                            <div>
                              <label className="text-xs text-white/60 block mb-1">Name</label>
                              <Input
                                value={projectionScheduleFormName}
                                onChange={(e) => setProjectionScheduleFormName(e.target.value)}
                                placeholder="e.g. Weekly projection report"
                                className="h-9 border-white/20 bg-neutral-800 text-white text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-white/60 block mb-1.5">Cadence</label>
                              <Popover open={projectionScheduleCadenceMenuOpen} onOpenChange={setProjectionScheduleCadenceMenuOpen}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={projectionScheduleCadenceMenuOpen}
                                    className="w-full justify-between border-white/20 bg-neutral-800 hover:bg-neutral-700 hover:border-white/30 text-white text-sm h-9"
                                  >
                                    <span className="truncate">{getCadenceLabel(projectionScheduleFormCadence)}</span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 border-white/10 bg-neutral-900" align="start">
                                  <Command>
                                    <CommandList>
                                      <CommandGroup>
                                        {CADENCE_PRESETS.map((p) => (
                                          <CommandItem
                                            key={p.value}
                                            value={p.label}
                                            onSelect={() => {
                                              setProjectionScheduleFormCadence(p.value);
                                              setProjectionScheduleCadenceMenuOpen(false);
                                            }}
                                            className="cursor-pointer"
                                          >
                                            <Checkbox
                                              checked={projectionScheduleFormCadence === p.value}
                                              className="mr-2 pointer-events-none"
                                            />
                                            <span className="text-white/90">{p.label}</span>
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div>
                              <div className="flex flex-col gap-2">
                                {cadenceUsesMonthDay(projectionScheduleFormCadence) && (
                                  <div>
                                    <label className="text-[11px] text-white/50 block mb-1">Day of month</label>
                                    <select
                                      value={projectionScheduleFormRunAtMonthDay}
                                      onChange={(e) => setProjectionScheduleFormRunAtMonthDay(Number(e.target.value))}
                                      className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
                                    >
                                      {MONTH_DAY_OPTIONS.map((d) => (
                                        <option key={d.value} value={d.value}>
                                          {d.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                {cadenceUsesWeekday(projectionScheduleFormCadence) && (
                                  <div>
                                    <label className="text-[11px] text-white/50 block mb-1">Day of week</label>
                                    <select
                                      value={projectionScheduleFormRunAtWeekday}
                                      onChange={(e) => setProjectionScheduleFormRunAtWeekday(Number(e.target.value))}
                                      className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
                                    >
                                      {WEEKDAY_OPTIONS.map((d) => (
                                        <option key={d.value} value={d.value}>
                                          {d.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                <div>
                                  <label className="text-[11px] text-white/50 block mb-1">Time (UTC)</label>
                                  <input
                                    type="time"
                                    value={projectionScheduleFormRunAtTime}
                                    onChange={(e) => setProjectionScheduleFormRunAtTime(e.target.value)}
                                    className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none [color-scheme:dark]"
                                  />
                                </div>
                              </div>
                            </div>
                            <div>
                              <SidebarGroupLabel className="text-xs text-white/60 mb-1.5">Sources</SidebarGroupLabel>
                              <Popover open={projectionScheduleSourceMenuOpen} onOpenChange={setProjectionScheduleSourceMenuOpen}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="w-full justify-between border-white/20 bg-neutral-800 hover:bg-neutral-700 hover:border-white/30 text-white text-sm"
                                  >
                                    <span className="truncate">
                                      {projectionScheduleFormSourceIds.length > 0
                                        ? `${projectionScheduleFormSourceIds.length} source${projectionScheduleFormSourceIds.length === 1 ? '' : 's'} selected`
                                        : 'Choose sources'}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 border-white/10 bg-neutral-900" align="start">
                                  <Command>
                                    <CommandInput placeholder="Search sources..." className="text-white" />
                                    <CommandList>
                                      <CommandEmpty>No sources found.</CommandEmpty>
                                      <CommandGroup>
                                        {sources.map((src) => {
                                          const checked = projectionScheduleFormSourceIds.includes(src.id);
                                          return (
                                            <CommandItem
                                              key={src.id}
                                              value={`${src.name} ${src.provider}`}
                                              onSelect={() => toggleProjectionScheduleFormSource(src.id)}
                                              className="cursor-pointer"
                                            >
                                              <Checkbox checked={checked} onCheckedChange={() => toggleProjectionScheduleFormSource(src.id)} className="mr-2" />
                                              <span className="flex-1 truncate text-white/90">[{src.provider}] {src.name}</span>
                                            </CommandItem>
                                          );
                                        })}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </div>
                            {audienceOptions.length > 0 && (
                              <div>
                                <label className="text-xs text-white/60 block mb-1.5">Audiences</label>
                                <Popover open={projectionScheduleAudienceMenuOpen} onOpenChange={setProjectionScheduleAudienceMenuOpen}>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      role="combobox"
                                      aria-expanded={projectionScheduleAudienceMenuOpen}
                                      className="w-full justify-between border-white/20 bg-neutral-800 hover:bg-neutral-700 hover:border-white/30 text-white text-sm h-9"
                                    >
                                      <span className="truncate">
                                        {projectionScheduleFormAudiences.length > 0
                                          ? `${projectionScheduleFormAudiences.length} audience${projectionScheduleFormAudiences.length === 1 ? '' : 's'} selected`
                                          : 'Choose audiences'}
                                      </span>
                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 border-white/10 bg-neutral-900" align="start">
                                    <Command>
                                      <CommandInput placeholder="Search audiences..." className="text-white" />
                                      <CommandList>
                                        <CommandEmpty>No audiences found.</CommandEmpty>
                                        <CommandGroup>
                                          {audienceOptions.map((aud) => {
                                            const checked = projectionScheduleFormAudiences.includes(aud);
                                            return (
                                              <CommandItem
                                                key={aud}
                                                value={aud}
                                                onSelect={() => toggleProjectionScheduleFormAudience(aud)}
                                                className="cursor-pointer"
                                              >
                                                <Checkbox
                                                  checked={checked}
                                                  onCheckedChange={() => toggleProjectionScheduleFormAudience(aud)}
                                                  className="mr-2"
                                                />
                                                <span className="flex-1 truncate text-white/90">{aud}</span>
                                              </CommandItem>
                                            );
                                          })}
                                        </CommandGroup>
                                      </CommandList>
                                    </Command>
                                    <Separator />
                                    <div className="flex items-center justify-between px-3 py-2">
                                      <span className="text-xs text-white/60">
                                        {projectionScheduleFormAudiences.length} of {audienceOptions.length} selected
                                      </span>
                                      <div className="flex gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setProjectionScheduleFormAudiences([])}
                                        >
                                          Clear
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => {
                                            setProjectionScheduleFormAudiences([...audienceOptions]);
                                            setProjectionScheduleAudienceMenuOpen(false);
                                          }}
                                        >
                                          {projectionScheduleFormAudiences.length === audienceOptions.length ? 'Deselect all' : 'Select all'}
                                        </Button>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                            )}
                            <div>
                              <label className="text-xs text-white/60 block mb-1.5">Units</label>
                              <Popover open={projectionScheduleUnitsMenuOpen} onOpenChange={setProjectionScheduleUnitsMenuOpen}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={projectionScheduleUnitsMenuOpen}
                                    className="w-full justify-between border-white/20 bg-neutral-800 hover:bg-neutral-700 hover:border-white/30 text-white text-sm h-9"
                                  >
                                    <span className="truncate">
                                      {projectionScheduleFormUnits.length > 0
                                        ? `${projectionScheduleFormUnits.length} unit${projectionScheduleFormUnits.length === 1 ? '' : 's'} selected`
                                        : 'Choose units'}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 border-white/10 bg-neutral-900" align="start">
                                  {categories.length > 0 ? (
                                    <>
                                      <Command>
                                        <CommandInput placeholder="Search units..." className="text-white" />
                                        <CommandList>
                                          <CommandEmpty>No units found.</CommandEmpty>
                                          <CommandGroup>
                                            {categories.map((cat) => {
                                              const checked = projectionScheduleFormUnits.includes(cat);
                                              return (
                                                <CommandItem
                                                  key={cat}
                                                  value={cat}
                                                  onSelect={() => toggleProjectionScheduleFormUnit(cat)}
                                                  className="cursor-pointer"
                                                >
                                                  <Checkbox
                                                    checked={checked}
                                                    onCheckedChange={() => toggleProjectionScheduleFormUnit(cat)}
                                                    className="mr-2"
                                                  />
                                                  <span className="flex-1 truncate text-white/90">{cat}</span>
                                                </CommandItem>
                                              );
                                            })}
                                          </CommandGroup>
                                        </CommandList>
                                      </Command>
                                      <Separator />
                                      <div className="flex items-center justify-between px-3 py-2">
                                        <span className="text-xs text-white/60">
                                          {projectionScheduleFormUnits.length} of {categories.length} selected
                                        </span>
                                        <div className="flex gap-2">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setProjectionScheduleFormUnits([])}
                                          >
                                            Clear
                                          </Button>
                                          <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => {
                                              setProjectionScheduleFormUnits([...categories]);
                                              setProjectionScheduleUnitsMenuOpen(false);
                                            }}
                                          >
                                            {projectionScheduleFormUnits.length === categories.length ? 'Deselect all' : 'Select all'}
                                          </Button>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="px-3 py-4 text-sm text-white/60">
                                      No units available yet. Units will appear once knowledge is generated for selected sources.
                                    </div>
                                  )}
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div>
                              <label className="text-xs text-white/60 block mb-1.5">Communication</label>
                              <div className="flex flex-wrap gap-2">
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-white/80">
                                  <Checkbox
                                    checked={projectionScheduleFormCommunication.email ?? false}
                                    onCheckedChange={(c) => setProjectionScheduleFormCommunication((prev) => ({ ...prev, email: !!c }))}
                                  />
                                  Email
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-white/80">
                                  <Checkbox
                                    checked={projectionScheduleFormCommunication.kb ?? false}
                                    onCheckedChange={(c) => {
                                      const kb = !!c;
                                      setProjectionScheduleFormCommunication((prev) => ({ ...prev, kb }));
                                      if (!kb) {
                                        setProjectionScheduleFormKbProvider('');
                                        setProjectionScheduleFormKbResourceId('');
                                        setProjectionScheduleFormKbResources([]);
                                        setProjectionScheduleFormKbRootMetadata(undefined);
                                      }
                                    }}
                                  />
                                  KB
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-white/80">
                                  <Checkbox
                                    checked={projectionScheduleFormCommunication.slack ?? false}
                                    onCheckedChange={(c) => setProjectionScheduleFormCommunication((prev) => ({ ...prev, slack: !!c }))}
                                  />
                                  Slack
                                </label>
                              </div>
                              {projectionScheduleFormCommunication.kb && (
                                <div className="mt-3 space-y-2 rounded-md border border-white/10 bg-white/5 p-3">
                                  <span className="text-xs text-white/60">KB target</span>
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      variant={projectionScheduleFormKbProvider === 'notion' ? 'secondary' : 'ghost'}
                                      size="sm"
                                      className={projectionScheduleFormKbProvider === 'notion' ? 'border-white/30 bg-white/10 text-white' : 'text-white/70 hover:text-white'}
                                      onClick={() => {
                                        setProjectionScheduleFormKbProvider('notion');
                                        loadProjectionScheduleKbResources('notion');
                                      }}
                                    >
                                      Notion
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={projectionScheduleFormKbProvider === 'confluence' ? 'secondary' : 'ghost'}
                                      size="sm"
                                      className={projectionScheduleFormKbProvider === 'confluence' ? 'border-white/30 bg-white/10 text-white' : 'text-white/70 hover:text-white'}
                                      onClick={() => {
                                        setProjectionScheduleFormKbProvider('confluence');
                                        loadProjectionScheduleKbResources('confluence');
                                      }}
                                    >
                                      Confluence
                                    </Button>
                                  </div>
                                  {projectionScheduleFormKbProvider && (
                                    <div>
                                      <label className="text-xs text-white/60 block mb-1">Page or space</label>
                                      {projectionScheduleFormKbResourcesLoading ? (
                                        <span className="text-sm text-white/60">Loading...</span>
                                      ) : projectionScheduleFormKbResources.length === 0 ? (
                                        <span className="text-sm text-white/60">No resources found. Connect {projectionScheduleFormKbProvider} in Settings.</span>
                                      ) : (
                                        <select
                                          className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
                                          value={projectionScheduleFormKbResourceId}
                                          onChange={(e) => {
                                            const id = e.target.value;
                                            const r = projectionScheduleFormKbResources.find((res) => res.id === id);
                                            setProjectionScheduleFormKbResourceId(id);
                                            setProjectionScheduleFormKbRootMetadata(r?.metadata);
                                          }}
                                        >
                                          {projectionScheduleFormKbResources.map((r) => (
                                            <option key={r.id} value={r.id}>
                                              {r.title || r.id}
                                            </option>
                                          ))}
                                        </select>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 pt-1">
                              <Button variant="secondary" size="sm" className="flex-1 border-white/20 bg-white/10 text-white hover:bg-white/15" onClick={saveProjectionSchedule}>
                                Save
                              </Button>
                              <Button variant="ghost" size="sm" className="text-white/70 hover:text-white" onClick={closeProjectionScheduleForm}>
                                Cancel
                              </Button>
                            </div>
                          </SidebarGroupContent>
                        </SidebarGroup>
                      )}
                    </>
                  )}

                </SidebarContent>

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
              Select where to publish your audience views.
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
                      Destination
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
                    <select
                      className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
                      value={selectedResourceId}
                      onChange={(e) => setSelectedResourceId(e.target.value)}
                    >
                      {resources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title || r.id}
                          {r.type ? ` (${r.type})` : ''}
                        </option>
                      ))}
                    </select>
                  )}

                  {pushProvider === 'confluence' && selectedResourceId && (
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <label className="text-sm text-white/70 block">Folder (optional)</label>
                      <p className="text-xs text-white/50">
                        Export under a specific page/folder in this space, or use the space root.
                      </p>
                      {loadingConfluenceFolders ? (
                        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/60">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading pages…
                        </div>
                      ) : (
                        <select
                          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
                          value={confluenceFolderId}
                          onChange={(e) => setConfluenceFolderId(e.target.value)}
                        >
                          <option value="">Space root</option>
                          {confluenceFolderOptions.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.title || f.id}
                            </option>
                          ))}
                        </select>
                      )}
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
                        {pushResult.details.map((d: PushResultDetail, idx: number) => (
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
