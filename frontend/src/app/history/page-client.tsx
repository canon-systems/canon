'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Source = {
  id: string;
  name: string;
  provider: string;
};

type CanonicalDiff = {
  window: { start: string; end: string };
  tickets_moved: number;
  tickets_completed: number;
  tickets_regressed: number;
  tickets_created: number;
  prs_opened: number;
  prs_merged: number;
  prs_closed: number;
  commits_default: number;
  repos_touched: string[];
};

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

type DiffDetails = {
  jira: {
    moved: Array<{
      issue_key: string | null;
      summary: string | null;
      space: string | null;
      from: string | null;
      to: string | null;
      occurred_at: string | null;
    }>;
    completed: Array<{
      issue_key: string | null;
      summary: string | null;
      space: string | null;
      status: string | null;
      occurred_at: string | null;
    }>;
    regressed: Array<{
      issue_key: string | null;
      summary: string | null;
      space: string | null;
      status: string | null;
      occurred_at: string | null;
    }>;
    created: Array<{
      issue_key: string | null;
      summary: string | null;
      space: string | null;
      status: string | null;
      occurred_at: string | null;
    }>;
  };
  github: {
    commits: Array<{ sha: string | null; repo: string | null; message: string | null; occurred_at: string | null }>;
    prs_opened: Array<{
      number: string | null;
      repo: string | null;
      title: string | null;
      from: string | null;
      to: string | null;
      status: string | null;
      occurred_at: string | null;
    }>;
    prs_merged: Array<{
      number: string | null;
      repo: string | null;
      title: string | null;
      from: string | null;
      to: string | null;
      status: string | null;
      occurred_at: string | null;
    }>;
    prs_closed: Array<{
      number: string | null;
      repo: string | null;
      title: string | null;
      from: string | null;
      to: string | null;
      status: string | null;
      occurred_at: string | null;
    }>;
  };
};

type DiffSourceTab = 'jira' | 'github';

type JiraDetailRow = {
  issue_key: string | null;
  summary: string | null;
  space: string | null;
  occurred_at: string | null;
  from?: string | null;
  to?: string | null;
  status?: string | null;
};

type CompareResponse = {
  primary: CanonicalDiff;
  baseline: CanonicalDiff;
  delta: DiffDelta;
  details?: DiffDetails | null;
};

function toUtcDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRange(start: string, end: string): string {
  const a = toUtcDateLabel(start);
  const b = toUtcDateLabel(end);
  return a === b ? a : `${a} to ${b}`;
}

function signed(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function formatDateTimeUtc(iso: string | null | undefined): string {
  if (!iso) return 'unknown time';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderTransition(from: string | null | undefined, to: string | null | undefined): string | null {
  if (!from && !to) return null;
  return `${from || 'unknown'} -> ${to || 'unknown'}`;
}

function renderJiraTicketLabel(row: JiraDetailRow): string {
  const summary = typeof row.summary === 'string' ? row.summary.trim() : '';
  const key = typeof row.issue_key === 'string' ? row.issue_key.trim() : '';
  if (summary && key) return `${summary} (${key})`;
  if (summary) return summary;
  if (key) return key;
  return 'Untitled ticket';
}

function groupRowsBySource<T>(rows: T[], pickSource: (row: T) => string | null | undefined): Array<{ source: string; rows: T[] }> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const source = pickSource(row) || 'Unknown source';
    if (!grouped.has(source)) {
      grouped.set(source, []);
    }
    grouped.get(source)!.push(row);
  }
  return Array.from(grouped.entries()).map(([source, groupedRows]) => ({ source, rows: groupedRows }));
}

function insightLines(data: CompareResponse): string[] {
  const { delta, primary, baseline } = data;

  const throughputChange = delta.tickets_completed + delta.prs_merged;
  const riskChange = delta.tickets_regressed;
  const surfaceShift = delta.repos_added.length - delta.repos_removed.length;

  const lines: string[] = [];

  if (
    primary.tickets_completed + primary.prs_merged + primary.tickets_regressed + primary.commits_default === 0 &&
    baseline.tickets_completed + baseline.prs_merged + baseline.tickets_regressed + baseline.commits_default === 0
  ) {
    return ['No tracked Jira or GitHub movement was detected in either window.'];
  }

  if (throughputChange < 0) {
    lines.push(`Delivery slowed (${signed(throughputChange)} combined completed tickets + merged PRs vs baseline).`);
  } else if (throughputChange > 0) {
    lines.push(`Delivery improved (${signed(throughputChange)} combined completed tickets + merged PRs vs baseline).`);
  } else {
    lines.push('Delivery throughput held flat versus baseline.');
  }

  if (riskChange > 0) {
    lines.push(`Quality risk increased (${signed(riskChange)} regressed tickets).`);
  } else if (riskChange < 0) {
    lines.push(`Quality risk decreased (${signed(riskChange)} regressed tickets).`);
  } else {
    lines.push('Regression pressure held steady versus baseline.');
  }

  if (surfaceShift !== 0) {
    lines.push(`Execution surface shifted (${signed(surfaceShift)} net touched surfaces).`);
  }

  return lines;
}

function metricRows(data: CompareResponse): Array<{ key: string; current: number; baseline: number; delta: number }> {
  return [
    {
      key: 'Tickets completed',
      current: data.primary.tickets_completed,
      baseline: data.baseline.tickets_completed,
      delta: data.delta.tickets_completed,
    },
    {
      key: 'Tickets regressed',
      current: data.primary.tickets_regressed,
      baseline: data.baseline.tickets_regressed,
      delta: data.delta.tickets_regressed,
    },
    {
      key: 'PRs opened',
      current: data.primary.prs_opened,
      baseline: data.baseline.prs_opened,
      delta: data.delta.prs_opened,
    },
    {
      key: 'PRs merged',
      current: data.primary.prs_merged,
      baseline: data.baseline.prs_merged,
      delta: data.delta.prs_merged,
    },
    {
      key: 'Commits on default',
      current: data.primary.commits_default,
      baseline: data.baseline.commits_default,
      delta: data.delta.commits_default,
    },
    {
      key: 'Surfaces touched',
      current: data.primary.repos_touched.length,
      baseline: data.baseline.repos_touched.length,
      delta: data.primary.repos_touched.length - data.baseline.repos_touched.length,
    },
  ];
}

type HistoryPageClientProps = {
  sources: Source[];
  initialData: CompareResponse | null;
  initialError: string | null;
  initialLastUpdatedAt: string | null;
};

export default function HistoryPageClient({
  sources,
  initialData,
  initialError,
  initialLastUpdatedAt,
}: HistoryPageClientProps) {
  const diffSources = useMemo(
    () =>
      sources.filter((s) => {
        const provider = String(s.provider || '').toLowerCase();
        return provider === 'github' || provider === 'jira';
      }),
    [sources]
  );

  const sourceIds = useMemo(() => diffSources.map((s) => s.id), [diffSources]);
  const data = initialData;
  const error = initialError;
  const lastUpdatedAt = initialLastUpdatedAt;
  const [requestedDiffSourceTab, setRequestedDiffSourceTab] = useState<DiffSourceTab>('jira');

  const providerTabs = useMemo<DiffSourceTab[]>(() => {
    const providers = new Set(diffSources.map((source) => source.provider.toLowerCase()));
    const tabs: DiffSourceTab[] = [];
    if (providers.has('jira')) tabs.push('jira');
    if (providers.has('github')) tabs.push('github');
    return tabs.length > 0 ? tabs : ['jira', 'github'];
  }, [diffSources]);

  const diffSourceTab = providerTabs.includes(requestedDiffSourceTab) ? requestedDiffSourceTab : providerTabs[0];

  const insight = useMemo(() => (data ? insightLines(data) : []), [data]);
  const metrics = useMemo(() => (data ? metricRows(data) : []), [data]);

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white">Canon History</CardTitle>
          <CardDescription className="text-white/70">
            Fixed diagnostic view of the last 7 full UTC days against the previous 7-day baseline.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {diffSources.map((source) => (
              <Badge key={source.id} variant="outline" className="border-white/20 bg-white/5 text-white/80">
                [{source.provider}] {source.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {sourceIds.length === 0 ? (
        <Card className="border-white/10 bg-white/5">
          <CardContent className="py-10 text-center text-white/75">
            <p>No Jira or GitHub sources connected.</p>
            <Button asChild className="mt-4 bg-white text-black hover:bg-white/90">
              <Link href="/sources">Connect Sources</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-red-500/40 bg-red-500/10">
          <CardContent className="py-6 text-sm text-red-100">{error}</CardContent>
        </Card>
      ) : null}

      {sourceIds.length > 0 && !data && !error ? (
        <>
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <Skeleton className="h-6 w-36 bg-white/20" />
              <Skeleton className="mt-2 h-4 w-full max-w-2xl bg-white/10" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full bg-white/10" />
              <Skeleton className="h-4 w-4/5 max-w-md bg-white/10" />
              <Skeleton className="h-4 w-3/4 max-w-sm bg-white/10" />
            </CardContent>
          </Card>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="border-white/10 bg-black/30">
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-28 bg-white/20" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-full bg-white/10" />
                  <Skeleton className="h-4 w-5/6 bg-white/10" />
                  <Skeleton className="h-4 w-1/3 bg-white/10" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <Skeleton className="h-6 w-32 bg-white/20" />
              <Skeleton className="mt-2 h-4 w-full max-w-xl bg-white/10" />
            </CardHeader>
            <CardContent className="space-y-5">
              <Skeleton className="h-10 w-full max-w-xs rounded-2xl bg-white/10" />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-32 rounded-xl bg-white/5" />
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {data ? (
        <>
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-white">Insight Summary</CardTitle>
              <CardDescription className="text-white/60">
                Current window: {formatRange(data.primary.window.start, data.primary.window.end)} | Baseline:{' '}
                {formatRange(data.baseline.window.start, data.baseline.window.end)}
                {lastUpdatedAt ? ` | Updated ${toUtcDateLabel(lastUpdatedAt)}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-white/85">
              {insight.map((line) => (
                <p key={line}>- {line}</p>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {metrics.map((metric) => (
              <Card key={metric.key} className="border-white/10 bg-black/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-white/80">{metric.key}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p className="text-white">Current: {metric.current}</p>
                  <p className="text-white/70">Baseline: {metric.baseline}</p>
                  <p className={metric.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                    Delta: {signed(metric.delta)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-white">Detailed View</CardTitle>
              <CardDescription className="text-white/60">
                Event-level movement captured in the current window, grouped by source provider for investigation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Tabs value={diffSourceTab} onValueChange={(value) => setRequestedDiffSourceTab(value as DiffSourceTab)} className="w-full">
                <TabsList className="mb-4 border border-white/10 bg-white/5">
                  {providerTabs.includes('jira') ? (
                    <TabsTrigger value="jira" className="!text-[10px] uppercase tracking-[0.2em] text-white/60 data-[state=active]:bg-white/10 data-[state=active]:[&_span]:text-black">
                      Jira
                      <span className="ml-2 text-white/40">
                        {(
                          (data.details?.jira.moved.length ?? 0) +
                          (data.details?.jira.completed.length ?? 0) +
                          (data.details?.jira.regressed.length ?? 0) +
                          (data.details?.jira.created.length ?? 0)
                        )}
                      </span>
                    </TabsTrigger>
                  ) : null}
                  {providerTabs.includes('github') ? (
                    <TabsTrigger value="github" className="!text-[10px] uppercase tracking-[0.2em] text-white/60 data-[state=active]:bg-white/10 data-[state=active]:[&_span]:text-black">
                      GitHub
                      <span className="ml-2 text-white/40">
                        {(
                          (data.details?.github.commits.length ?? 0) +
                          (data.details?.github.prs_opened.length ?? 0) +
                          (data.details?.github.prs_merged.length ?? 0) +
                          (data.details?.github.prs_closed.length ?? 0)
                        )}
                      </span>
                    </TabsTrigger>
                  ) : null}
                </TabsList>

                <TabsContent value="jira" className="mt-0">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: 'Moved', rows: (data.details?.jira.moved || []) as JiraDetailRow[] },
                      { label: 'Completed', rows: (data.details?.jira.completed || []) as JiraDetailRow[] },
                      { label: 'Regressed', rows: (data.details?.jira.regressed || []) as JiraDetailRow[] },
                      { label: 'Created', rows: (data.details?.jira.created || []) as JiraDetailRow[] },
                    ].map((section) => (
                      <Card key={section.label} className="border-white/10 bg-black/30">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm text-white/80">
                            {section.label} ({section.rows.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-xs text-white/70">
                          {section.rows.length === 0 ? (
                            <p>No items in this window.</p>
                          ) : (
                            groupRowsBySource(section.rows, (row) => row.space).map((sourceGroup) => (
                              <details key={`${section.label}-${sourceGroup.source}`} className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                                <summary className="cursor-pointer text-white/85">
                                  {sourceGroup.source} ({sourceGroup.rows.length})
                                </summary>
                                <div className="mt-2 space-y-2">
                                  {sourceGroup.rows.map((row, idx) => {
                                    const lineKey = `${section.label}-${sourceGroup.source}-${row.issue_key}-${row.occurred_at}-${idx}`;
                                    const transition = renderTransition(row.from, row.to);
                                    const status = row.status || null;
                                    return (
                                      <div key={lineKey} className="space-y-0.5">
                                        <p className="text-white/90">
                                          {renderJiraTicketLabel(row)}
                                        </p>
                                        <p className="text-white/60">{transition || status || 'No state transition provided'}</p>
                                        <p className="text-white/40">{formatDateTimeUtc(row.occurred_at)}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              </details>
                            ))
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="github" className="mt-0">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: 'Commits', rows: data.details?.github.commits || [] },
                      { label: 'PRs Opened', rows: data.details?.github.prs_opened || [] },
                      { label: 'PRs Merged', rows: data.details?.github.prs_merged || [] },
                      { label: 'PRs Closed', rows: data.details?.github.prs_closed || [] },
                    ].map((section) => (
                      <Card key={section.label} className="border-white/10 bg-black/30">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm text-white/80">
                            {section.label} ({section.rows.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-xs text-white/70">
                          {section.rows.length === 0 ? (
                            <p>No items in this window.</p>
                          ) : section.label === 'Commits' ? (
                            groupRowsBySource(section.rows as DiffDetails['github']['commits'], (row) => row.repo).map((sourceGroup) => (
                              <details key={`${section.label}-${sourceGroup.source}`} className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                                <summary className="cursor-pointer text-white/85">
                                  {sourceGroup.source} ({sourceGroup.rows.length})
                                </summary>
                                <div className="mt-2 space-y-2">
                                  {sourceGroup.rows.map((row, idx) => (
                                    <div key={`commit-${sourceGroup.source}-${row.sha}-${row.occurred_at}-${idx}`} className="space-y-0.5">
                                      <p className="font-mono text-white/90">{(row.sha || 'commit').slice(0, 10)}</p>
                                      <p className="text-white/60">{row.message || 'No commit message available'}</p>
                                      <p className="text-white/40">{formatDateTimeUtc(row.occurred_at)}</p>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            ))
                          ) : (
                            groupRowsBySource(section.rows as DiffDetails['github']['prs_opened'], (row) => row.repo).map((sourceGroup) => (
                              <details key={`${section.label}-${sourceGroup.source}`} className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                                <summary className="cursor-pointer text-white/85">
                                  {sourceGroup.source} ({sourceGroup.rows.length})
                                </summary>
                                <div className="mt-2 space-y-2">
                                  {sourceGroup.rows.map((row, idx) => {
                                    const transition = renderTransition(row.from, row.to);
                                    return (
                                      <div key={`pr-${section.label}-${sourceGroup.source}-${row.number}-${row.occurred_at}-${idx}`} className="space-y-0.5">
                                        <p className="text-white/90">
                                          PR #{row.number || '?'} {row.title ? `- ${row.title}` : ''}
                                        </p>
                                        <p className="text-white/60">{transition || row.status || 'No transition provided'}</p>
                                        <p className="text-white/40">{formatDateTimeUtc(row.occurred_at)}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              </details>
                            ))
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
