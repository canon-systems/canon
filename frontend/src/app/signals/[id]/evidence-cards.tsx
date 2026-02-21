'use client';

import { useMemo, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { DateTime } from 'luxon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MetricLabelTooltip } from '@/components/metric-label-tooltip';

type EvidencePayload = {
  tickets: Array<{ id: string; summary: string | null; occurred_at: string | null; url: string | null }>;
  prs: Array<{ id: string; repo: string | null; occurred_at: string | null; kind: string | null; url: string | null }>;
  repos: Array<{ id: string; activity: number }>;
  domains: Array<{ id: string; activity: number }>;
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
    tip: 'Repositories with activity in this signal window.',
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

function EvidenceList({ panel, evidence, timeZone }: { panel: PanelId; evidence: EvidencePayload; timeZone: string }) {
  if (panel === 'tickets') {
    if (evidence.tickets.length === 0) return <p>{PANEL_META.tickets.empty}</p>;
    return (
      <>
        {evidence.tickets.map((ticket) => (
          <div key={`${ticket.id}-${ticket.occurred_at}`} className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
            {ticket.url ? (
              <a
                href={ticket.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-white underline decoration-white/35 underline-offset-2 hover:text-white"
              >
                {ticket.id}
              </a>
            ) : (
              <div className="font-medium text-white">{ticket.id}</div>
            )}
            <div className="text-white/70">{ticket.summary || 'No summary'}</div>
            <div className="text-xs text-white/55">{formatTimestamp(ticket.occurred_at, timeZone)}</div>
          </div>
        ))}
      </>
    );
  }

  if (panel === 'prs') {
    if (evidence.prs.length === 0) return <p>{PANEL_META.prs.empty}</p>;
    return (
      <>
        {evidence.prs.map((pr) => (
          <div key={`${pr.id}-${pr.occurred_at}-${pr.kind}`} className="rounded border border-white/10 bg-zinc-800 px-3 py-2">
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
            <div className="text-white/70">{pr.repo || 'Unknown repo'} · {pr.kind || 'event'}</div>
            <div className="text-xs text-white/55">{formatTimestamp(pr.occurred_at, timeZone)}</div>
          </div>
        ))}
      </>
    );
  }

  if (panel === 'repos') {
    if (evidence.repos.length === 0) return <p>{PANEL_META.repos.empty}</p>;
    return (
      <>
        {evidence.repos.map((repo) => (
          <div key={repo.id} className="flex items-center justify-between rounded border border-white/10 bg-zinc-800 px-3 py-2">
            <span className="text-white">{repo.id}</span>
            <span className="text-white/70">{repo.activity}</span>
          </div>
        ))}
      </>
    );
  }

  if (evidence.domains.length === 0) return <p>{PANEL_META.domains.empty}</p>;
  const total = evidence.domains.reduce((sum, domain) => sum + domain.activity, 0);
  return (
    <>
      {evidence.domains.map((domain) => {
        const percentage = total > 0 ? ((domain.activity / total) * 100).toFixed(2) : '0.00';
        return (
          <div key={domain.id} className="flex items-center justify-between rounded border border-white/10 bg-zinc-800 px-3 py-2">
            <span className="text-white">{domain.id}</span>
            <span className="text-white/70">{domain.activity} ({percentage}%)</span>
          </div>
        );
      })}
    </>
  );
}

export default function EvidenceCards({ evidence, timeZone }: { evidence: EvidencePayload; timeZone: string }) {
  const [expandedPanel, setExpandedPanel] = useState<PanelId | null>(null);
  const expandedMeta = useMemo(() => (expandedPanel ? PANEL_META[expandedPanel] : null), [expandedPanel]);

  return (
    <>
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        {PANEL_ORDER.map((panel) => {
          const meta = PANEL_META[panel];
          return (
            <Card key={panel} className="h-[24rem] min-h-0 border-white/10 bg-zinc-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base text-white">
                  <MetricLabelTooltip label={meta.label} tip={meta.tip} />
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
        <DialogContent className="max-h-[85vh] max-w-5xl border-white/10 bg-black/95 p-0">
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
