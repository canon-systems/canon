'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { DateTime } from 'luxon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, type DateRange } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Source = {
  id: string;
  name: string;
  provider: string;
  scope?: Record<string, unknown> | null;
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

type DateWindow = { start: string; end: string };

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

function toDateLabel(iso: string, timeZone: string): string {
  const date = DateTime.fromISO(iso, { zone: 'utc' }).setZone(timeZone);
  if (!date.isValid) return iso;
  return date.toFormat('MMM d, yyyy');
}

function formatRange(start: string, end: string, timeZone: string): string {
  const a = toDateLabel(start, timeZone);
  const b = toDateLabel(end, timeZone);
  return a === b ? a : `${a} to ${b}`;
}

function normalizeCalendarDay(date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function localDayStartFromIso(iso: string, timeZone: string): DateTime | null {
  const local = DateTime.fromISO(iso, { zone: 'utc' }).setZone(timeZone).startOf('day');
  if (!local.isValid) return null;
  return local;
}

function localDayToUtcRange(day: string, timeZone: string): DateWindow | null {
  const localStart = DateTime.fromISO(day, { zone: timeZone }).startOf('day');
  if (!localStart.isValid) return null;
  const localEnd = localStart.plus({ days: 1 }).minus({ milliseconds: 1 });
  const start = localStart.toUTC().toISO({ suppressMilliseconds: false });
  const end = localEnd.toUTC().toISO({ suppressMilliseconds: false });
  if (!start || !end) return null;
  return { start, end };
}

function windowToDateRange(window: DateWindow, timeZone: string): DateRange {
  const start = localDayStartFromIso(window.start, timeZone);
  const end = localDayStartFromIso(window.end, timeZone);
  if (!start || !end) return { from: undefined, to: undefined };
  return {
    from: new Date(start.year, start.month - 1, start.day),
    to: new Date(end.year, end.month - 1, end.day),
  };
}

function selectionToPrimaryWindow(range: DateRange | undefined, timeZone: string): DateWindow | null {
  if (!range?.from || !range.to) return null;
  const from = range.from;
  const to = range.to;
  const fromMs = from.getTime();
  const toMs = to.getTime();

  const startDate = fromMs <= toMs ? from : to;
  const endDate = fromMs <= toMs ? to : from;
  const startDay = normalizeCalendarDay(startDate);
  const endDay = normalizeCalendarDay(endDate);
  const startRange = localDayToUtcRange(startDay, timeZone);
  const endRange = localDayToUtcRange(endDay, timeZone);
  if (!startRange || !endRange) return null;

  return {
    start: startRange.start,
    end: endRange.end,
  };
}

function computeBaselineWindowFromPrimary(primary: DateWindow, timeZone: string): DateWindow {
  const startLocal = localDayStartFromIso(primary.start, timeZone);
  const endLocal = localDayStartFromIso(primary.end, timeZone);
  if (!startLocal || !endLocal || endLocal < startLocal) return primary;

  let dayCount = 1;
  let cursor = startLocal;
  while (cursor < endLocal) {
    cursor = cursor.plus({ days: 1 }).startOf('day');
    dayCount += 1;
    if (dayCount > 3660) break;
  }

  const baselineEndLocal = startLocal.minus({ days: 1 }).startOf('day');
  const baselineStartLocal = baselineEndLocal.minus({ days: dayCount - 1 }).startOf('day');
  const baselineStart = baselineStartLocal.toUTC().toISO({ suppressMilliseconds: false });
  const baselineEnd = baselineEndLocal
    .plus({ days: 1 })
    .minus({ milliseconds: 1 })
    .toUTC()
    .toISO({ suppressMilliseconds: false });

  if (!baselineStart || !baselineEnd) return primary;
  return { start: baselineStart, end: baselineEnd };
}

function signed(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function formatDateTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return 'unknown time';
  const date = DateTime.fromISO(iso, { zone: 'utc' }).setZone(timeZone);
  if (!date.isValid) return iso;
  return date.toFormat('MMM d, h:mm a');
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

function toExternalBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function resolveJiraSiteUrl(scope: Record<string, unknown> | null | undefined): string | null {
  if (!scope) return null;
  return (
    toExternalBaseUrl(scope.jira_site_url) ||
    toExternalBaseUrl(scope.jiraSiteUrl) ||
    toExternalBaseUrl(scope.site_url) ||
    toExternalBaseUrl(scope.siteUrl) ||
    toExternalBaseUrl(scope.url)
  );
}

function issueProjectKey(issueKey: string | null | undefined): string | null {
  if (typeof issueKey !== 'string') return null;
  const trimmed = issueKey.trim();
  const dash = trimmed.indexOf('-');
  if (dash <= 0) return null;
  return trimmed.slice(0, dash).toUpperCase();
}

function normalizeGitHubRepo(repo: string | null | undefined): string | null {
  if (typeof repo !== 'string') return null;
  const trimmed = repo.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (sshMatch) return sshMatch[1];

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.hostname.toLowerCase() === 'github.com') {
      const path = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
      if (path) return path.replace(/\.git$/i, '');
    }
  } catch {
    // fall through to plain owner/repo parsing
  }

  const plain = trimmed
    .replace(/^github\.com\//i, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const segments = plain.split('/');
  if (segments.length < 2) return null;
  const owner = segments[0];
  const name = segments[1];
  if (!owner || !name) return null;
  return `${owner}/${name}`;
}

function normalizeCommitSha(sha: string | null | undefined): string | null {
  if (typeof sha !== 'string') return null;
  const trimmed = sha.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/[a-f0-9]{7,40}/i);
  return match ? match[0] : null;
}

function splitRepo(repo: string): { owner: string; name: string } | null {
  const [owner, name] = repo.split('/');
  if (!owner || !name) return null;
  return { owner, name };
}

function githubPullRequestUrl(repo: string | null | undefined, number: string | null | undefined): string | null {
  const normalizedRepo = normalizeGitHubRepo(repo);
  const normalizedNumber = typeof number === 'string' ? number.trim() : '';
  if (!normalizedRepo || !normalizedNumber) return null;
  const parts = splitRepo(normalizedRepo);
  if (!parts) return null;
  return `https://github.com/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.name)}/pull/${encodeURIComponent(normalizedNumber)}`;
}

function githubCommitUrl(repo: string | null | undefined, sha: string | null | undefined): string | null {
  const normalizedRepo = normalizeGitHubRepo(repo);
  const normalizedSha = normalizeCommitSha(sha);
  if (!normalizedRepo || !normalizedSha) return null;
  const parts = splitRepo(normalizedRepo);
  if (!parts) return null;
  return `https://github.com/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.name)}/commit/${encodeURIComponent(normalizedSha)}`;
}

function jiraIssueUrl(
  issueKey: string | null | undefined,
  jiraBrowseBaseByProject: Map<string, string>
): string | null {
  const projectKey = issueProjectKey(issueKey);
  if (!projectKey || !issueKey) return null;
  const browseBase = jiraBrowseBaseByProject.get(projectKey);
  if (!browseBase) return null;
  return `${browseBase}/browse/${issueKey}`;
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
  const totalPrimaryMovement =
    primary.tickets_moved +
    primary.tickets_completed +
    primary.tickets_regressed +
    primary.tickets_created +
    primary.prs_opened +
    primary.prs_merged +
    primary.prs_closed +
    primary.commits_default +
    primary.repos_touched.length;
  const totalBaselineMovement =
    baseline.tickets_moved +
    baseline.tickets_completed +
    baseline.tickets_regressed +
    baseline.tickets_created +
    baseline.prs_opened +
    baseline.prs_merged +
    baseline.prs_closed +
    baseline.commits_default +
    baseline.repos_touched.length;

  if (totalPrimaryMovement === 0 && totalBaselineMovement === 0) {
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
  primaryWindow: DateWindow;
  baselineWindow: DateWindow;
  timeZone: string;
};

export default function HistoryPageClient({
  sources,
  initialData,
  initialError,
  initialLastUpdatedAt,
  primaryWindow,
  baselineWindow,
  timeZone,
}: HistoryPageClientProps) {
  const diffSources = sources;

  const sourceIds = useMemo(() => diffSources.map((s) => s.id), [diffSources]);
  const [data, setData] = useState<CompareResponse | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(initialLastUpdatedAt);
  const [activePrimaryWindow, setActivePrimaryWindow] = useState<DateWindow>(primaryWindow);
  const [activeBaselineWindow, setActiveBaselineWindow] = useState<DateWindow>(baselineWindow);
  const [selectedPrimaryRange, setSelectedPrimaryRange] = useState<DateRange>(() => windowToDateRange(primaryWindow, timeZone));
  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [requestedDiffSourceTab, setRequestedDiffSourceTab] = useState<DiffSourceTab>('jira');
  const latestRequestRef = useRef(0);

  const refreshComparison = async (nextPrimaryWindow: DateWindow, nextBaselineWindow: DateWindow) => {
    if (sourceIds.length === 0) return;
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setIsRefreshing(true);
    setError(null);
    setData(null);
    setLastUpdatedAt(null);

    try {
      const response = await fetch('/api/diffs/compare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          start_timestamp: nextPrimaryWindow.start,
          end_timestamp: nextPrimaryWindow.end,
          compare_start_timestamp: nextBaselineWindow.start,
          compare_end_timestamp: nextBaselineWindow.end,
          source_ids: sourceIds,
        }),
      });

      const payload = (await response.json().catch(() => null)) as CompareResponse | { error?: string; detail?: string } | null;
      if (!response.ok) {
        const message =
          (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' && payload.error) ||
          'Failed to load Canon History';
        throw new Error(message);
      }

      if (latestRequestRef.current !== requestId) return;
      setData((payload as CompareResponse) || null);
      setLastUpdatedAt(new Date().toISOString());
    } catch (fetchError) {
      if (latestRequestRef.current !== requestId) return;
      const message = fetchError instanceof Error ? fetchError.message : 'Failed to load Canon History';
      setError(message);
    } finally {
      if (latestRequestRef.current === requestId) {
        setIsRefreshing(false);
      }
    }
  };

  const onSelectPrimaryRange = (range: DateRange | undefined) => {
    setSelectedPrimaryRange(range || { from: undefined, to: undefined });
  };

  const onRangePickerOpenChange = (open: boolean) => {
    setIsRangePickerOpen(open);
    if (open) {
      setSelectedPrimaryRange(windowToDateRange(activePrimaryWindow, timeZone));
      return;
    }
    setSelectedPrimaryRange(windowToDateRange(activePrimaryWindow, timeZone));
  };

  const applySelectedPrimaryRange = () => {
    const nextPrimaryWindow = selectionToPrimaryWindow(selectedPrimaryRange, timeZone);
    if (!nextPrimaryWindow) return;
    const nextBaselineWindow = computeBaselineWindowFromPrimary(nextPrimaryWindow, timeZone);
    const unchanged =
      activePrimaryWindow.start === nextPrimaryWindow.start &&
      activePrimaryWindow.end === nextPrimaryWindow.end;

    setActivePrimaryWindow(nextPrimaryWindow);
    setActiveBaselineWindow(nextBaselineWindow);
    setIsRangePickerOpen(false);

    if (unchanged) return;
    if (sourceIds.length === 0) {
      setData(null);
      setError(null);
      setLastUpdatedAt(null);
      return;
    }

    void refreshComparison(nextPrimaryWindow, nextBaselineWindow);
  };

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
  const selectedPrimaryWindowDraft = useMemo(
    () => selectionToPrimaryWindow(selectedPrimaryRange, timeZone),
    [selectedPrimaryRange, timeZone]
  );
  const selectedBaselineWindowDraft = useMemo(
    () => (selectedPrimaryWindowDraft ? computeBaselineWindowFromPrimary(selectedPrimaryWindowDraft, timeZone) : null),
    [selectedPrimaryWindowDraft, timeZone]
  );
  const jiraBrowseBaseByProject = useMemo(() => {
    const byProject = new Map<string, string>();
    for (const source of diffSources) {
      if ((source.provider || '').toLowerCase() !== 'jira') continue;
      const scope = source.scope || null;
      const project = typeof scope?.project === 'string' ? scope.project.trim().toUpperCase() : '';
      const siteUrl = resolveJiraSiteUrl(scope);
      if (!project || !siteUrl) continue;
      if (!byProject.has(project)) {
        byProject.set(project, siteUrl);
      }
    }
    return byProject;
  }, [diffSources]);

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-zinc-900">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-white">Canon History</CardTitle>
            <CardDescription className="text-white/70">Pick a primary date range.</CardDescription>
          </div>
          <Popover open={isRangePickerOpen} onOpenChange={onRangePickerOpenChange}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="border-white/25 bg-zinc-800 text-white hover:bg-zinc-700">
                {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}
                Select Primary Range
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-auto border-white/10 bg-black/95 p-0">
              <Calendar
                mode="range"
                numberOfMonths={1}
                selected={selectedPrimaryRange}
                onSelect={onSelectPrimaryRange}
                defaultMonth={selectedPrimaryRange.from || windowToDateRange(activePrimaryWindow, timeZone).from}
                disabled={(date) => date > new Date()}
              />
              <div className="border-t border-white/10 p-3">
                <p className="text-xs text-white/70">
                  Primary:{' '}
                  {selectedPrimaryWindowDraft
                    ? formatRange(selectedPrimaryWindowDraft.start, selectedPrimaryWindowDraft.end, timeZone)
                    : 'Choose start and end dates'}
                </p>
                <p className="mt-1 text-xs text-white/55">
                  Baseline:{' '}
                  {selectedBaselineWindowDraft
                    ? formatRange(selectedBaselineWindowDraft.start, selectedBaselineWindowDraft.end, timeZone)
                    : 'Will be computed after selecting the full range'}
                </p>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-3 text-white/70 hover:text-white"
                    onClick={() => setIsRangePickerOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="h-8 px-3 bg-white text-black hover:bg-white/90"
                    disabled={!selectedPrimaryWindowDraft || isRefreshing}
                    onClick={applySelectedPrimaryRange}
                  >
                    Confirm Range
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {diffSources.map((source) => (
              <Badge key={source.id} variant="outline" className="border-white/20 bg-white/5 text-white/80">
                [{source.provider}] {source.name}
              </Badge>
            ))}
          </div>
          {data ? (
            <div className="space-y-3 border-t border-white/10 pt-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">Inside summary</p>
              <div className="space-y-2 text-white/85">
                {insight.map((line) => (
                  <p key={line}>- {line}</p>
                ))}
              </div>
              {lastUpdatedAt ? (
                <p className="text-xs text-white/55">
                  Updated {toDateLabel(lastUpdatedAt, timeZone)} · Primary:{' '}
                  {formatRange(activePrimaryWindow.start, activePrimaryWindow.end, timeZone)} · Baseline:{' '}
                  {formatRange(activeBaselineWindow.start, activeBaselineWindow.end, timeZone)}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {sourceIds.length === 0 ? (
        <Card className="border-white/10 bg-zinc-900">
          <CardContent className="py-10 text-center text-white/75">
            <p>No sources connected.</p>
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
          <Card className="border-white/10 bg-zinc-900">
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
              <Card key={i} className="border-white/10 bg-zinc-800">
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
          <Card className="border-white/10 bg-zinc-900">
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {metrics.map((metric) => (
              <Card key={metric.key} className="border-white/10 bg-zinc-800">
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

          <Card className="border-white/10 bg-zinc-900">
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
                      <Card key={section.label} className="border-white/10 bg-zinc-800">
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
                                        {jiraIssueUrl(row.issue_key, jiraBrowseBaseByProject) ? (
                                          <a
                                            href={jiraIssueUrl(row.issue_key, jiraBrowseBaseByProject) || undefined}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-white/90 underline decoration-white/35 underline-offset-2 hover:text-white"
                                          >
                                            {renderJiraTicketLabel(row)}
                                          </a>
                                        ) : (
                                          <p className="text-white/90">
                                            {renderJiraTicketLabel(row)}
                                          </p>
                                        )}
                                        <p className="text-white/60">{transition || status || 'No state transition provided'}</p>
                                        <p className="text-white/40">{formatDateTime(row.occurred_at, timeZone)}</p>
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
                      <Card key={section.label} className="border-white/10 bg-zinc-800">
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
                                      {githubCommitUrl(row.repo, row.sha) ? (
                                        <a
                                          href={githubCommitUrl(row.repo, row.sha) || undefined}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="font-mono text-white/90 underline decoration-white/35 underline-offset-2 hover:text-white"
                                        >
                                          {(row.sha || 'commit').slice(0, 10)}
                                        </a>
                                      ) : (
                                        <p className="font-mono text-white/90">{(row.sha || 'commit').slice(0, 10)}</p>
                                      )}
                                      <p className="text-white/60">{row.message || 'No commit message available'}</p>
                                      <p className="text-white/40">{formatDateTime(row.occurred_at, timeZone)}</p>
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
                                    const prUrl = githubPullRequestUrl(row.repo, row.number);
                                    return (
                                      <div key={`pr-${section.label}-${sourceGroup.source}-${row.number}-${row.occurred_at}-${idx}`} className="space-y-0.5">
                                        {prUrl ? (
                                          <a
                                            href={prUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-white/90 underline decoration-white/35 underline-offset-2 hover:text-white"
                                          >
                                            PR #{row.number || '?'} {row.title ? `- ${row.title}` : ''}
                                          </a>
                                        ) : (
                                          <p className="text-white/90">
                                            PR #{row.number || '?'} {row.title ? `- ${row.title}` : ''}
                                          </p>
                                        )}
                                        <p className="text-white/60">{transition || row.status || 'No transition provided'}</p>
                                        <p className="text-white/40">{formatDateTime(row.occurred_at, timeZone)}</p>
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
