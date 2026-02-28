'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Maximize2 } from 'lucide-react';
import { DateTime } from 'luxon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MetricLabelTooltip } from '@/components/metric-label-tooltip';

type EvidencePayload = {
  tickets: Array<{
    id: string;
    summary: string | null;
    occurred_at: string | null;
    kind: string | null;
    from_status: string | null;
    to_status: string | null;
    url: string | null;
  }>;
  tickets_baseline: Array<{
    id: string;
    summary: string | null;
    occurred_at: string | null;
    kind: string | null;
    from_status: string | null;
    to_status: string | null;
    url: string | null;
  }>;
  prs: Array<{
    id: string;
    repo: string | null;
    occurred_at: string | null;
    kind: string | null;
    from_branch: string | null;
    to_branch: string | null;
    url: string | null;
  }>;
  prs_baseline: Array<{
    id: string;
    repo: string | null;
    occurred_at: string | null;
    kind: string | null;
    from_branch: string | null;
    to_branch: string | null;
    url: string | null;
  }>;
  repos: Array<{ id: string; activity: number; baseline_activity: number }>;
  domains: Array<{ id: string; activity: number; baseline_activity: number }>;
  windows?: Array<{
    id: string;
    label: string;
    window_start: string;
    window_end: string;
    tickets: Array<{
      id: string;
      summary: string | null;
      occurred_at: string | null;
      kind: string | null;
      from_status: string | null;
      to_status: string | null;
      url: string | null;
    }>;
    prs: Array<{
      id: string;
      repo: string | null;
      occurred_at: string | null;
      kind: string | null;
      from_branch: string | null;
      to_branch: string | null;
      url: string | null;
    }>;
    repos: Array<{ id: string; activity: number }>;
    domains: Array<{ id: string; activity: number }>;
  }>;
};

type WindowEvidence = NonNullable<EvidencePayload['windows']>[number];
type PanelId = 'tickets' | 'prs' | 'repos' | 'domains';
const ALL_SOURCES_VALUE = '__all_sources__';

const PANEL_ORDER: PanelId[] = ['tickets', 'prs', 'repos', 'domains'];

const PANEL_META: Record<
  PanelId,
  { label: string; tip: string; empty: string; dialogDescription: string }
> = {
  tickets: {
    label: 'Ticket Activity',
    tip: 'Ticket events for the selected window.',
    empty: 'No ticket evidence for this window.',
    dialogDescription: 'Detailed ticket evidence by window.',
  },
  prs: {
    label: 'Pull Request Activity',
    tip: 'Pull request events for the selected window.',
    empty: 'No PR evidence for this window.',
    dialogDescription: 'Detailed pull request evidence by window.',
  },
  repos: {
    label: 'Active Surfaces',
    tip: 'Surfaces with activity in the selected window.',
    empty: 'No active surface evidence for this window.',
    dialogDescription: 'Detailed surface activity by window.',
  },
  domains: {
    label: 'Domain Breakdown',
    tip: 'Domain activity for the selected window.',
    empty: 'No domain activity for this window.',
    dialogDescription: 'Detailed domain distribution by window.',
  },
};

function formatTimestamp(value: string | null, timeZone: string): string {
  if (!value) return 'Unknown time';
  const parsed = DateTime.fromISO(value, { zone: 'utc' }).setZone(timeZone);
  if (!parsed.isValid) return value;
  return parsed.toFormat('MMM d, yyyy h:mm a');
}

function formatWindowRange(start: string, end: string, timeZone: string): string {
  if (!start || !end) return '';
  const startDate = DateTime.fromISO(start, { zone: 'utc' }).setZone(timeZone);
  const endDate = DateTime.fromISO(end, { zone: 'utc' }).setZone(timeZone);
  if (!startDate.isValid || !endDate.isValid) return '';
  return `${startDate.toFormat('MMM d')} - ${endDate.toFormat('MMM d, yyyy')}`;
}

function ticketKindLabel(kind: string | null): string {
  if (kind === 'ticket_moved') return 'Moved';
  if (kind === 'ticket_completed') return 'Completed';
  if (kind === 'ticket_regressed') return 'Regressed';
  if (kind === 'ticket_created') return 'Created';
  return 'Event';
}

function ticketSourceLabel(ticketId: string | null | undefined): string {
  if (typeof ticketId !== 'string') return 'Unknown Source';
  const trimmed = ticketId.trim();
  if (!trimmed) return 'Unknown Source';
  const dashIndex = trimmed.indexOf('-');
  if (dashIndex <= 0) return 'Unknown Source';
  return trimmed.slice(0, dashIndex).toUpperCase();
}

function ticketActivitySummary(tickets: EvidencePayload['tickets']): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>([
    ['Moved', 0],
    ['Created', 0],
    ['Completed', 0],
    ['Regressed', 0],
  ]);

  for (const ticket of tickets) {
    const label = ticketKindLabel(ticket.kind);
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count }));
}

function prKindLabel(kind: string | null): string {
  if (kind === 'pr_opened') return 'Opened';
  if (kind === 'pr_merged') return 'Merged';
  if (kind === 'pr_closed') return 'Closed';
  return 'Event';
}

function prActivitySummary(prs: EvidencePayload['prs']): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>([
    ['Opened', 0],
    ['Merged', 0],
    ['Closed', 0],
  ]);

  for (const pr of prs) {
    const label = prKindLabel(pr.kind);
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count }));
}

function buildWindowTabs(evidence: EvidencePayload): WindowEvidence[] {
  if (Array.isArray(evidence.windows) && evidence.windows.length > 0) {
    return evidence.windows;
  }

  return [
    {
      id: 'prior',
      label: 'Prior Window',
      window_start: '',
      window_end: '',
      tickets: evidence.tickets_baseline,
      prs: evidence.prs_baseline,
      repos: evidence.repos.map((repo) => ({ id: repo.id, activity: repo.baseline_activity })),
      domains: evidence.domains.map((domain) => ({ id: domain.id, activity: domain.baseline_activity })),
    },
    {
      id: 'current',
      label: 'Current Window',
      window_start: '',
      window_end: '',
      tickets: evidence.tickets,
      prs: evidence.prs,
      repos: evidence.repos.map((repo) => ({ id: repo.id, activity: repo.activity })),
      domains: evidence.domains.map((domain) => ({ id: domain.id, activity: domain.activity })),
    },
  ];
}

function TicketEvidenceList({
  tickets,
  timeZone,
  selectedLabels,
  selectedSource,
  onToggleLabel,
  onClearFilters,
}: {
  tickets: EvidencePayload['tickets'];
  timeZone: string;
  selectedLabels: string[];
  selectedSource: string;
  onToggleLabel: (label: string) => void;
  onClearFilters: () => void;
}) {
  if (tickets.length === 0) return <p className="text-white/70">No ticket evidence in this window.</p>;
  const summary = ticketActivitySummary(tickets);
  const sourceFilteredTickets = selectedSource === ALL_SOURCES_VALUE
    ? tickets
    : tickets.filter((ticket) => ticketSourceLabel(ticket.id) === selectedSource);
  const filteredTickets =
    selectedLabels.length === 0
      ? sourceFilteredTickets
      : sourceFilteredTickets.filter((ticket) => selectedLabels.includes(ticketKindLabel(ticket.kind)));
  return (
    <>
      {summary.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pb-1">
          {summary.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => onToggleLabel(item.label)}
              className={`rounded border px-2 py-0.5 text-[11px] uppercase tracking-[0.06em] transition ${selectedLabels.includes(item.label)
                ? 'border-white/45 bg-white !text-black'
                : 'border-white/15 bg-white/5 text-white/75 hover:border-white/30 hover:bg-white/10'
                }`}
            >
              {item.label}: {item.count}
            </button>
          ))}
          {selectedLabels.length > 0 ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded border border-white/20 bg-transparent px-2 py-0.5 text-[11px] uppercase tracking-[0.06em] text-white/70 hover:border-white/35 hover:text-white"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
      {filteredTickets.length === 0 ? (
        <p className="text-white/70">No ticket events match the selected filters.</p>
      ) : null}
      {filteredTickets.map((ticket) => (
        <div key={`${ticket.id}-${ticket.occurred_at}-${ticket.kind}`} className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              {ticket.url ? (
                <a
                  href={ticket.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-white underline decoration-white/35 underline-offset-2 hover:text-white"
                >
                  {ticket.summary || 'Untitled Ticket'}
                </a>
              ) : (
                <div className="font-medium text-white">{ticket.summary || 'Untitled Ticket'}</div>
              )}
              <div className="text-sm text-white/65">
                {ticket.id} · {ticketKindLabel(ticket.kind)}
              </div>
              {ticket.from_status || ticket.to_status ? (
                <div className="text-sm text-white/65">
                  Status: {ticket.from_status || 'Unknown'} -&gt; {ticket.to_status || 'Unknown'}
                </div>
              ) : null}
            </div>
            {ticket.url ? (
              <a
                href={ticket.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${ticket.id} in source`}
                title="Open in source"
                className="mt-0.5 rounded border border-white/15 p-1.5 text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
          <div className="text-xs text-white/55">{formatTimestamp(ticket.occurred_at, timeZone)}</div>
        </div>
      ))}
    </>
  );
}

function PullRequestEvidenceList({
  prs,
  timeZone,
  selectedLabels,
  selectedSource,
  onToggleLabel,
  onClearFilters,
}: {
  prs: EvidencePayload['prs'];
  timeZone: string;
  selectedLabels: string[];
  selectedSource: string;
  onToggleLabel: (label: string) => void;
  onClearFilters: () => void;
}) {
  if (prs.length === 0) return <p className="text-white/70">No pull request evidence in this window.</p>;
  const summary = prActivitySummary(prs);
  const sourceFilteredPrs = selectedSource === ALL_SOURCES_VALUE
    ? prs
    : prs.filter((pr) => (pr.repo || 'Unknown Source') === selectedSource);
  const filteredPrs =
    selectedLabels.length === 0
      ? sourceFilteredPrs
      : sourceFilteredPrs.filter((pr) => selectedLabels.includes(prKindLabel(pr.kind)));
  return (
    <>
      {summary.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pb-1">
          {summary.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => onToggleLabel(item.label)}
              className={`rounded border px-2 py-0.5 text-[11px] uppercase tracking-[0.06em] transition ${selectedLabels.includes(item.label)
                ? 'border-white/45 bg-white !text-black'
                : 'border-white/15 bg-white/5 text-white/75 hover:border-white/30 hover:bg-white/10'
                }`}
            >
              {item.label}: {item.count}
            </button>
          ))}
          {selectedLabels.length > 0 ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded border border-white/20 bg-transparent px-2 py-0.5 text-[11px] uppercase tracking-[0.06em] text-white/70 hover:border-white/35 hover:text-white"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
      {filteredPrs.length === 0 ? (
        <p className="text-white/70">No pull request events match the selected filters.</p>
      ) : null}
      {filteredPrs.map((pr) => (
        <div key={`${pr.id}-${pr.occurred_at}-${pr.kind}`} className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              {pr.url ? (
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-white underline decoration-white/35 underline-offset-2 hover:text-white"
                >
                  PR {pr.id}
                </a>
              ) : (
                <div className="font-medium text-white">PR {pr.id}</div>
              )}
              <div className="text-white/70">{pr.repo || 'Unknown repo'} · {prKindLabel(pr.kind)}</div>
              {pr.from_branch || pr.to_branch ? (
                <div className="text-sm text-white/65">
                  Branch: {pr.from_branch || 'Unknown'} -&gt; {pr.to_branch || 'Unknown'}
                </div>
              ) : null}
            </div>
            {pr.url ? (
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open PR ${pr.id} in source`}
                title="Open in source"
                className="mt-0.5 rounded border border-white/15 p-1.5 text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
          <div className="text-xs text-white/55">{formatTimestamp(pr.occurred_at, timeZone)}</div>
        </div>
      ))}
    </>
  );
}

function TicketEvidenceTabs({ windows, timeZone }: { windows: WindowEvidence[]; timeZone: string }) {
  const windowsLatestFirst = useMemo(() => [...windows].reverse(), [windows]);
  const [selectedId, setSelectedId] = useState<string>(windowsLatestFirst[0]?.id || '');
  const [selectedLabelsByTab, setSelectedLabelsByTab] = useState<Record<string, string[]>>({});
  const [selectedSourceByTab, setSelectedSourceByTab] = useState<Record<string, string>>({});
  const activeTab = windows.some((w) => w.id === selectedId) ? selectedId : windowsLatestFirst[0]?.id ?? '';

  const toggleLabel = (label: string): void => {
    setSelectedLabelsByTab((prev) => {
      const currentLabels = prev[activeTab] || [];
      const nextLabels = currentLabels.includes(label)
        ? currentLabels.filter((item) => item !== label)
        : [...currentLabels, label];
      return { ...prev, [activeTab]: nextLabels };
    });
  };

  const clearFilters = (): void => {
    setSelectedLabelsByTab((prev) => ({ ...prev, [activeTab]: [] }));
  };

  const selectedWindow = windows.find((w) => w.id === activeTab);
  const sourceOptions = useMemo(() => {
    if (!selectedWindow) return [];
    return Array.from(new Set(selectedWindow.tickets.map((ticket) => ticketSourceLabel(ticket.id)))).sort();
  }, [selectedWindow]);
  const selectedSource = selectedSourceByTab[activeTab] || ALL_SOURCES_VALUE;
  const resolvedSource = sourceOptions.includes(selectedSource) ? selectedSource : ALL_SOURCES_VALUE;

  return (
    <div className="space-y-2">
      <Select value={activeTab} onValueChange={setSelectedId}>
        <SelectTrigger className="inline-flex h-10 w-auto min-w-[12rem] rounded-2xl border border-white/10 bg-zinc-800 px-3 text-white/70 hover:bg-zinc-700 hover:text-white/90">
          <SelectValue placeholder="Select window" />
        </SelectTrigger>
        <SelectContent>
          {windowsLatestFirst.map((window) => (
            <SelectItem key={window.id} value={window.id}>
              {window.label} ({window.tickets.length})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {sourceOptions.length > 0 ? (
        <Select
          value={resolvedSource}
          onValueChange={(value) => setSelectedSourceByTab((prev) => ({ ...prev, [activeTab]: value }))}
        >
          <SelectTrigger className="inline-flex h-10 w-auto min-w-[12rem] rounded-2xl border border-white/10 bg-zinc-800 px-3 text-white/70 hover:bg-zinc-700 hover:text-white/90">
            <SelectValue placeholder="Filter by source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SOURCES_VALUE}>All Sources</SelectItem>
            {sourceOptions.map((source) => (
              <SelectItem key={source} value={source}>
                {source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {selectedWindow ? (
        <div className="mt-0 space-y-2">
          {selectedWindow.window_start && selectedWindow.window_end ? (
            <p className="text-xs text-white/55">{formatWindowRange(selectedWindow.window_start, selectedWindow.window_end, timeZone)}</p>
          ) : null}
          <TicketEvidenceList
            tickets={selectedWindow.tickets}
            timeZone={timeZone}
            selectedLabels={selectedLabelsByTab[selectedWindow.id] || []}
            selectedSource={resolvedSource}
            onToggleLabel={toggleLabel}
            onClearFilters={clearFilters}
          />
        </div>
      ) : null}
    </div>
  );
}

function PullRequestEvidenceTabs({ windows, timeZone }: { windows: WindowEvidence[]; timeZone: string }) {
  const windowsLatestFirst = useMemo(() => [...windows].reverse(), [windows]);
  const [selectedId, setSelectedId] = useState<string>(windowsLatestFirst[0]?.id || '');
  const [selectedLabelsByTab, setSelectedLabelsByTab] = useState<Record<string, string[]>>({});
  const [selectedSourceByTab, setSelectedSourceByTab] = useState<Record<string, string>>({});
  const activeTab = windows.some((w) => w.id === selectedId) ? selectedId : windowsLatestFirst[0]?.id ?? '';

  const toggleLabel = (label: string): void => {
    setSelectedLabelsByTab((prev) => {
      const currentLabels = prev[activeTab] || [];
      const nextLabels = currentLabels.includes(label)
        ? currentLabels.filter((item) => item !== label)
        : [...currentLabels, label];
      return { ...prev, [activeTab]: nextLabels };
    });
  };

  const clearFilters = (): void => {
    setSelectedLabelsByTab((prev) => ({ ...prev, [activeTab]: [] }));
  };

  const selectedWindow = windows.find((w) => w.id === activeTab);
  const sourceOptions = useMemo(() => {
    if (!selectedWindow) return [];
    return Array.from(new Set(selectedWindow.prs.map((pr) => pr.repo || 'Unknown Source'))).sort();
  }, [selectedWindow]);
  const selectedSource = selectedSourceByTab[activeTab] || ALL_SOURCES_VALUE;
  const resolvedSource = sourceOptions.includes(selectedSource) ? selectedSource : ALL_SOURCES_VALUE;

  return (
    <div className="space-y-2">
      <Select value={activeTab} onValueChange={setSelectedId}>
        <SelectTrigger className="inline-flex h-10 w-auto min-w-[12rem] rounded-2xl border border-white/10 bg-zinc-800 px-3 text-white/70 hover:bg-zinc-700 hover:text-white/90">
          <SelectValue placeholder="Select window" />
        </SelectTrigger>
        <SelectContent>
          {windowsLatestFirst.map((window) => (
            <SelectItem key={window.id} value={window.id}>
              {window.label} ({window.prs.length})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {sourceOptions.length > 0 ? (
        <Select
          value={resolvedSource}
          onValueChange={(value) => setSelectedSourceByTab((prev) => ({ ...prev, [activeTab]: value }))}
        >
          <SelectTrigger className="inline-flex h-10 w-auto min-w-[12rem] rounded-2xl border border-white/10 bg-zinc-800 px-3 text-white/70 hover:bg-zinc-700 hover:text-white/90">
            <SelectValue placeholder="Filter by source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SOURCES_VALUE}>All Sources</SelectItem>
            {sourceOptions.map((source) => (
              <SelectItem key={source} value={source}>
                {source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {selectedWindow ? (
        <div className="mt-0 space-y-2">
          {selectedWindow.window_start && selectedWindow.window_end ? (
            <p className="text-xs text-white/55">{formatWindowRange(selectedWindow.window_start, selectedWindow.window_end, timeZone)}</p>
          ) : null}
          <PullRequestEvidenceList
            prs={selectedWindow.prs}
            timeZone={timeZone}
            selectedLabels={selectedLabelsByTab[selectedWindow.id] || []}
            selectedSource={resolvedSource}
            onToggleLabel={toggleLabel}
            onClearFilters={clearFilters}
          />
        </div>
      ) : null}
    </div>
  );
}

function ReposEvidenceTabs({ windows, timeZone }: { windows: WindowEvidence[]; timeZone: string }) {
  const windowsLatestFirst = useMemo(() => [...windows].reverse(), [windows]);
  const [selectedId, setSelectedId] = useState<string>(windowsLatestFirst[0]?.id || '');
  const [selectedSourceByTab, setSelectedSourceByTab] = useState<Record<string, string>>({});
  const activeTab = windows.some((w) => w.id === selectedId) ? selectedId : windowsLatestFirst[0]?.id ?? '';
  const selectedWindow = windows.find((w) => w.id === activeTab);
  const sourceOptions = useMemo(() => {
    if (!selectedWindow) return [];
    return Array.from(new Set(selectedWindow.repos.map((repo) => repo.id))).sort();
  }, [selectedWindow]);
  const selectedSource = selectedSourceByTab[activeTab] || ALL_SOURCES_VALUE;
  const resolvedSource = sourceOptions.includes(selectedSource) ? selectedSource : ALL_SOURCES_VALUE;

  if (windows.length === 0) return <p>{PANEL_META.repos.empty}</p>;
  return (
    <div className="space-y-2">
      <Select value={activeTab} onValueChange={setSelectedId}>
        <SelectTrigger className="inline-flex h-10 w-auto min-w-[12rem] rounded-2xl border border-white/10 bg-zinc-800 px-3 text-white/70 hover:bg-zinc-700 hover:text-white/90">
          <SelectValue placeholder="Select window" />
        </SelectTrigger>
        <SelectContent>
          {windowsLatestFirst.map((window) => (
            <SelectItem key={window.id} value={window.id}>
              {window.label} ({window.repos.length})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {sourceOptions.length > 0 ? (
        <Select
          value={resolvedSource}
          onValueChange={(value) => setSelectedSourceByTab((prev) => ({ ...prev, [activeTab]: value }))}
        >
          <SelectTrigger className="inline-flex h-10 w-auto min-w-[12rem] rounded-2xl border border-white/10 bg-zinc-800 px-3 text-white/70 hover:bg-zinc-700 hover:text-white/90">
            <SelectValue placeholder="Filter by source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SOURCES_VALUE}>All Sources</SelectItem>
            {sourceOptions.map((source) => (
              <SelectItem key={source} value={source}>
                {source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {selectedWindow ? (
        <div className="mt-0 space-y-2">
          {selectedWindow.window_start && selectedWindow.window_end ? (
            <p className="text-xs text-white/55">{formatWindowRange(selectedWindow.window_start, selectedWindow.window_end, timeZone)}</p>
          ) : null}
          {selectedWindow.repos.length === 0 ? (
            <p className="text-white/70">No surface activity in this window.</p>
          ) : (
            (() => {
              const repos = resolvedSource === ALL_SOURCES_VALUE
                ? selectedWindow.repos
                : selectedWindow.repos.filter((repo) => repo.id === resolvedSource);
              if (repos.length === 0) {
                return <p className="text-white/70">No surface activity for the selected source.</p>;
              }
              const maxActivity = Math.max(1, ...repos.map((repo) => repo.activity), 1);
              return repos.map((repo) => (
                <div key={repo.id} className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white">{repo.id}</span>
                  </div>
                  <div className="mt-2 grid min-w-0 grid-cols-[1fr_auto] items-center gap-3 text-[11px] text-white/65">
                    <Progress value={(repo.activity / maxActivity) * 100} className="h-2 min-w-0" />
                    <span className="shrink-0 font-mono text-white/70">{repo.activity}</span>
                  </div>
                </div>
              ));
            })()
          )}
        </div>
      ) : null}
    </div>
  );
}

function DomainsEvidenceTabs({ windows, timeZone }: { windows: WindowEvidence[]; timeZone: string }) {
  const windowsLatestFirst = useMemo(() => [...windows].reverse(), [windows]);
  const [selectedId, setSelectedId] = useState<string>(windowsLatestFirst[0]?.id || '');
  const [selectedSourceByTab, setSelectedSourceByTab] = useState<Record<string, string>>({});
  const activeTab = windows.some((w) => w.id === selectedId) ? selectedId : windowsLatestFirst[0]?.id ?? '';
  const selectedWindow = windows.find((w) => w.id === activeTab);
  const sourceOptions = useMemo(() => {
    if (!selectedWindow) return [];
    return Array.from(new Set(selectedWindow.domains.map((domain) => domain.id))).sort();
  }, [selectedWindow]);
  const selectedSource = selectedSourceByTab[activeTab] || ALL_SOURCES_VALUE;
  const resolvedSource = sourceOptions.includes(selectedSource) ? selectedSource : ALL_SOURCES_VALUE;

  if (windows.length === 0) return <p>{PANEL_META.domains.empty}</p>;
  return (
    <div className="space-y-2">
      <Select value={activeTab} onValueChange={setSelectedId}>
        <SelectTrigger className="inline-flex h-10 w-auto min-w-[12rem] rounded-2xl border border-white/10 bg-zinc-800 px-3 text-white/70 hover:bg-zinc-700 hover:text-white/90">
          <SelectValue placeholder="Select window" />
        </SelectTrigger>
        <SelectContent>
          {windowsLatestFirst.map((window) => (
            <SelectItem key={window.id} value={window.id}>
              {window.label} ({window.domains.length})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {sourceOptions.length > 0 ? (
        <Select
          value={resolvedSource}
          onValueChange={(value) => setSelectedSourceByTab((prev) => ({ ...prev, [activeTab]: value }))}
        >
          <SelectTrigger className="inline-flex h-10 w-auto min-w-[12rem] rounded-2xl border border-white/10 bg-zinc-800 px-3 text-white/70 hover:bg-zinc-700 hover:text-white/90">
            <SelectValue placeholder="Filter by source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SOURCES_VALUE}>All Sources</SelectItem>
            {sourceOptions.map((source) => (
              <SelectItem key={source} value={source}>
                {source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {selectedWindow ? (
        <div className="mt-0 space-y-2">
          {selectedWindow.window_start && selectedWindow.window_end ? (
            <p className="text-xs text-white/55">{formatWindowRange(selectedWindow.window_start, selectedWindow.window_end, timeZone)}</p>
          ) : null}
          {selectedWindow.domains.length === 0 ? (
            <p className="text-white/70">No domain activity in this window.</p>
          ) : (
            (() => {
              const domains = resolvedSource === ALL_SOURCES_VALUE
                ? selectedWindow.domains
                : selectedWindow.domains.filter((domain) => domain.id === resolvedSource);
              if (domains.length === 0) {
                return <p className="text-white/70">No domain activity for the selected source.</p>;
              }
              const totalActivity = Math.max(1, domains.reduce((sum, item) => sum + item.activity, 0));
              return domains.map((domain) => {
                const pct = totalActivity > 0 ? (domain.activity / totalActivity) * 100 : 0;
                const pctLabel = pct >= 10 ? pct.toFixed(0) : pct.toFixed(1);
                return (
                  <div key={domain.id} className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-white">{domain.id}</span>
                      <span className="font-mono text-[11px] text-white/70">{pctLabel}%</span>
                    </div>
                    <div className="mt-2 grid min-w-0 grid-cols-[1fr_auto] items-center gap-3 text-[11px] text-white/65">
                      <Progress value={pct} className="h-2 min-w-0" />
                      <span className="shrink-0 font-mono text-white/70">{pctLabel}%</span>
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>
      ) : null}
    </div>
  );
}

function panelActivityCount(panel: PanelId, windows: WindowEvidence[]): number {
  const current = windows[windows.length - 1];
  if (!current) return 0;
  if (panel === 'tickets') return current.tickets.length;
  if (panel === 'prs') return current.prs.length;
  if (panel === 'repos') return current.repos.length;
  return current.domains.length;
}

function EvidenceList({ panel, evidence, timeZone }: { panel: PanelId; evidence: EvidencePayload; timeZone: string }) {
  const windows = buildWindowTabs(evidence);

  if (panel === 'tickets') {
    return <TicketEvidenceTabs windows={windows} timeZone={timeZone} />;
  }

  if (panel === 'prs') {
    return <PullRequestEvidenceTabs windows={windows} timeZone={timeZone} />;
  }

  if (panel === 'repos') {
    return <ReposEvidenceTabs windows={windows} timeZone={timeZone} />;
  }

  if (panel === 'domains') {
    return <DomainsEvidenceTabs windows={windows} timeZone={timeZone} />;
  }

  return null;
}

export default function EvidenceCards({ evidence, timeZone }: { evidence: EvidencePayload; timeZone: string }) {
  const [expandedPanel, setExpandedPanel] = useState<PanelId | null>(null);
  const expandedMeta = useMemo(() => (expandedPanel ? PANEL_META[expandedPanel] : null), [expandedPanel]);
  const windows = useMemo(() => buildWindowTabs(evidence), [evidence]);

  return (
    <>
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        {PANEL_ORDER.map((panel) => {
          const meta = PANEL_META[panel];
          const activityCount = panelActivityCount(panel, windows);
          return (
            <Card key={panel} className="h-[24rem] min-h-0 border-white/10 bg-zinc-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base text-white">
                  <MetricLabelTooltip label={`${meta.label} (${activityCount})`} tip={meta.tip} />
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  className="h-7 w-7 border-white/20 bg-white/5 p-0 text-white hover:bg-white/10"
                  onClick={() => setExpandedPanel(panel)}
                  aria-label={`Expand ${meta.label}`}
                  title={`Expand ${meta.label}`}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="h-[calc(24rem-4.5rem)] overflow-y-auto space-y-2 pr-2 text-sm text-white/80">
                <EvidenceList panel={panel} evidence={evidence} timeZone={timeZone} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={expandedPanel !== null} onOpenChange={(open) => !open && setExpandedPanel(null)}>
        <DialogContent className="max-w-5xl p-0">
          {expandedPanel && expandedMeta ? (
            <>
              <DialogHeader className="border-b border-white/10 px-6 py-4">
                <DialogTitle>{expandedMeta.label}</DialogTitle>
                <DialogDescription>{expandedMeta.dialogDescription}</DialogDescription>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto p-6 text-sm text-white/80">
                <div className="space-y-2">
                  <EvidenceList panel={expandedPanel} evidence={evidence} timeZone={timeZone} />
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
