'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Maximize2 } from 'lucide-react';
import { DateTime } from 'luxon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
};

type PanelId = 'tickets' | 'prs' | 'repos' | 'domains';

const PANEL_ORDER: PanelId[] = ['tickets', 'prs', 'repos', 'domains'];

const PANEL_META: Record<
  PanelId,
  { label: string; tip: string; empty: string; dialogDescription: string }
> = {
  tickets: {
    label: 'Ticket Activity',
    tip: 'Ticket events included in this signal window.',
    empty: 'No ticket evidence in this signal window.',
    dialogDescription: 'Detailed ticket evidence for the current signal window.',
  },
  prs: {
    label: 'Pull Request Activity',
    tip: 'Pull request events included in this signal window.',
    empty: 'No PR evidence in this signal window.',
    dialogDescription: 'Detailed pull request evidence for the current signal window.',
  },
  repos: {
    label: 'Active Surfaces',
    tip: 'Surfaces with activity in this signal window.',
    empty: 'No active surface evidence in this signal window.',
    dialogDescription: 'Detailed activity across touched repositories and surfaces.',
  },
  domains: {
    label: 'Domain Breakdown',
    tip: 'Activity grouped by domain for this signal window.',
    empty: 'No domain activity in this signal window.',
    dialogDescription: 'Detailed domain distribution for the current signal window.',
  },
};

function formatTimestamp(value: string | null, timeZone: string): string {
  if (!value) return 'Unknown time';
  const parsed = DateTime.fromISO(value, { zone: 'utc' }).setZone(timeZone);
  if (!parsed.isValid) return value;
  return parsed.toFormat('MMM d, yyyy h:mm a');
}

function ticketKindLabel(kind: string | null): string {
  if (kind === 'ticket_moved') return 'Moved';
  if (kind === 'ticket_completed') return 'Completed';
  if (kind === 'ticket_regressed') return 'Regressed';
  if (kind === 'ticket_created') return 'Created';
  return 'Event';
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

function TicketEvidenceList({
  tickets,
  timeZone,
  selectedLabels,
  onToggleLabel,
  onClearFilters,
}: {
  tickets: EvidencePayload['tickets'];
  timeZone: string;
  selectedLabels: string[];
  onToggleLabel: (label: string) => void;
  onClearFilters: () => void;
}) {
  if (tickets.length === 0) return <p className="text-white/70">No ticket evidence in this window.</p>;
  const summary = ticketActivitySummary(tickets);
  const filteredTickets =
    selectedLabels.length === 0
      ? tickets
      : tickets.filter((ticket) => selectedLabels.includes(ticketKindLabel(ticket.kind)));
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
  onToggleLabel,
  onClearFilters,
}: {
  prs: EvidencePayload['prs'];
  timeZone: string;
  selectedLabels: string[];
  onToggleLabel: (label: string) => void;
  onClearFilters: () => void;
}) {
  if (prs.length === 0) return <p className="text-white/70">No pull request evidence in this window.</p>;
  const summary = prActivitySummary(prs);
  const filteredPrs =
    selectedLabels.length === 0
      ? prs
      : prs.filter((pr) => selectedLabels.includes(prKindLabel(pr.kind)));
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

function TicketEvidenceTabs({
  currentTickets,
  baselineTickets,
  timeZone,
}: {
  currentTickets: EvidencePayload['tickets'];
  baselineTickets: EvidencePayload['tickets'];
  timeZone: string;
}) {
  const [activeTab, setActiveTab] = useState<'current' | 'baseline'>('current');
  const [selectedLabelsByTab, setSelectedLabelsByTab] = useState<{ current: string[]; baseline: string[] }>({
    current: [],
    baseline: [],
  });

  const toggleLabel = (label: string): void => {
    setSelectedLabelsByTab((prev) => {
      const currentLabels = prev[activeTab];
      const nextLabels = currentLabels.includes(label)
        ? currentLabels.filter((item) => item !== label)
        : [...currentLabels, label];
      return { ...prev, [activeTab]: nextLabels };
    });
  };

  const clearFilters = (): void => {
    setSelectedLabelsByTab((prev) => ({ ...prev, [activeTab]: [] }));
  };

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'current' | 'baseline')} className="space-y-2">
      <TabsList className="border border-white/10 bg-zinc-800">
        <TabsTrigger value="current" className="data-[state=active]:!bg-white">
          Current Window ({currentTickets.length})
        </TabsTrigger>
        <TabsTrigger value="baseline" className="data-[state=active]:!bg-white">
          Baseline Window ({baselineTickets.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="current" className="mt-0 space-y-2">
        <TicketEvidenceList
          tickets={currentTickets}
          timeZone={timeZone}
          selectedLabels={selectedLabelsByTab.current}
          onToggleLabel={toggleLabel}
          onClearFilters={clearFilters}
        />
      </TabsContent>
      <TabsContent value="baseline" className="mt-0 space-y-2">
        <TicketEvidenceList
          tickets={baselineTickets}
          timeZone={timeZone}
          selectedLabels={selectedLabelsByTab.baseline}
          onToggleLabel={toggleLabel}
          onClearFilters={clearFilters}
        />
      </TabsContent>
    </Tabs>
  );
}

function PullRequestEvidenceTabs({
  currentPrs,
  baselinePrs,
  timeZone,
}: {
  currentPrs: EvidencePayload['prs'];
  baselinePrs: EvidencePayload['prs'];
  timeZone: string;
}) {
  const [activeTab, setActiveTab] = useState<'current' | 'baseline'>('current');
  const [selectedLabelsByTab, setSelectedLabelsByTab] = useState<{ current: string[]; baseline: string[] }>({
    current: [],
    baseline: [],
  });

  const toggleLabel = (label: string): void => {
    setSelectedLabelsByTab((prev) => {
      const currentLabels = prev[activeTab];
      const nextLabels = currentLabels.includes(label)
        ? currentLabels.filter((item) => item !== label)
        : [...currentLabels, label];
      return { ...prev, [activeTab]: nextLabels };
    });
  };

  const clearFilters = (): void => {
    setSelectedLabelsByTab((prev) => ({ ...prev, [activeTab]: [] }));
  };

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'current' | 'baseline')} className="space-y-2">
      <TabsList className="border border-white/10 bg-zinc-800">
        <TabsTrigger value="current" className="data-[state=active]:!bg-white">
          Current Window ({currentPrs.length})
        </TabsTrigger>
        <TabsTrigger value="baseline" className="data-[state=active]:!bg-white">
          Baseline Window ({baselinePrs.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="current" className="mt-0 space-y-2">
        <PullRequestEvidenceList
          prs={currentPrs}
          timeZone={timeZone}
          selectedLabels={selectedLabelsByTab.current}
          onToggleLabel={toggleLabel}
          onClearFilters={clearFilters}
        />
      </TabsContent>
      <TabsContent value="baseline" className="mt-0 space-y-2">
        <PullRequestEvidenceList
          prs={baselinePrs}
          timeZone={timeZone}
          selectedLabels={selectedLabelsByTab.baseline}
          onToggleLabel={toggleLabel}
          onClearFilters={clearFilters}
        />
      </TabsContent>
    </Tabs>
  );
}

function EvidenceList({ panel, evidence, timeZone }: { panel: PanelId; evidence: EvidencePayload; timeZone: string }) {
  if (panel === 'tickets') {
    return (
      <TicketEvidenceTabs
        currentTickets={evidence.tickets}
        baselineTickets={evidence.tickets_baseline}
        timeZone={timeZone}
      />
    );
  }

  if (panel === 'prs') {
    return (
      <PullRequestEvidenceTabs
        currentPrs={evidence.prs}
        baselinePrs={evidence.prs_baseline}
        timeZone={timeZone}
      />
    );
  }

  if (panel === 'repos') {
    if (evidence.repos.length === 0) return <p>{PANEL_META.repos.empty}</p>;
    const maxActivity = Math.max(
      1,
      ...evidence.repos.flatMap((repo) => [repo.activity, repo.baseline_activity])
    );
    return (
      <>
        {evidence.repos.map((repo) => (
          <div key={repo.id} className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-white">{repo.id}</span>
              <span className="text-xs text-white/65">{repo.activity} vs {repo.baseline_activity}</span>
            </div>
            <div className="mt-2 space-y-1.5">
              <div className="grid grid-cols-[4rem_1fr_auto] items-center gap-2 text-[11px] text-white/65">
                <span>Current</span>
                <Progress value={(repo.activity / maxActivity) * 100} className="h-1.5" />
                <span className="font-mono text-white/70">{repo.activity}</span>
              </div>
              <div className="grid grid-cols-[4rem_1fr_auto] items-center gap-2 text-[11px] text-white/55">
                <span>Baseline</span>
                <Progress value={(repo.baseline_activity / maxActivity) * 100} className="h-1.5 opacity-70" />
                <span className="font-mono text-white/60">{repo.baseline_activity}</span>
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  if (evidence.domains.length === 0) return <p>{PANEL_META.domains.empty}</p>;
  const maxActivity = Math.max(
    1,
    ...evidence.domains.flatMap((domain) => [domain.activity, domain.baseline_activity])
  );
  return (
    <>
      {evidence.domains.map((domain) => {
        return (
          <div key={domain.id} className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-white">{domain.id}</span>
              <span className="text-xs text-white/65">{domain.activity} vs {domain.baseline_activity}</span>
            </div>
            <div className="mt-2 space-y-1.5">
              <div className="grid grid-cols-[4rem_1fr_auto] items-center gap-2 text-[11px] text-white/65">
                <span>Current</span>
                <Progress value={(domain.activity / maxActivity) * 100} className="h-1.5" />
                <span className="font-mono text-white/70">{domain.activity}</span>
              </div>
              <div className="grid grid-cols-[4rem_1fr_auto] items-center gap-2 text-[11px] text-white/55">
                <span>Baseline</span>
                <Progress value={(domain.baseline_activity / maxActivity) * 100} className="h-1.5 opacity-70" />
                <span className="font-mono text-white/60">{domain.baseline_activity}</span>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function panelActivityCount(panel: PanelId, evidence: EvidencePayload): number {
  if (panel === 'tickets') return evidence.tickets.length;
  if (panel === 'prs') return evidence.prs.length;
  if (panel === 'repos') return evidence.repos.length;
  return evidence.domains.length;
}

export default function EvidenceCards({ evidence, timeZone }: { evidence: EvidencePayload; timeZone: string }) {
  const [expandedPanel, setExpandedPanel] = useState<PanelId | null>(null);
  const expandedMeta = useMemo(() => (expandedPanel ? PANEL_META[expandedPanel] : null), [expandedPanel]);

  return (
    <>
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        {PANEL_ORDER.map((panel) => {
          const meta = PANEL_META[panel];
          const activityCount = panelActivityCount(panel, evidence);
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
