import type { SupabaseClient } from '@supabase/supabase-js';
import type { CanonicalDiff } from '@/lib/server/diff/contracts';
import { emptyCanonicalDiff } from '@/lib/server/diff/contracts';

type CanonicalEventAggRow = {
  source_id: string | null;
  provider: string | null;
  event_kind: string | null;
  repo_full_name: string | null;
};

const PAGE_SIZE = 1000;
const MAX_PAGES = 500;

function describeSupabaseError(error: unknown): { code: string; message: string } {
  if (!error || typeof error !== 'object') return { code: '', message: '' };
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  return { code, message };
}

function isNonFatalCanonicalReadError(error: unknown): boolean {
  const { code, message } = describeSupabaseError(error);
  const normalized = message.toLowerCase();
  if (code === '42P01') return true; // relation does not exist
  if (code === '42501') return true; // insufficient_privilege / RLS denied
  if (normalized.includes('diff_event_canonical') && normalized.includes('does not exist')) return true;
  return false;
}

function addRepo(diff: CanonicalDiff, repoFullName: string | null): void {
  if (!repoFullName || !repoFullName.trim()) return;
  if (!diff.repos_touched.includes(repoFullName)) {
    diff.repos_touched = [...diff.repos_touched, repoFullName];
  }
}

function applyEventToDiff(diff: CanonicalDiff, row: CanonicalEventAggRow): void {
  const provider = String(row.provider || '').toLowerCase();
  const kind = String(row.event_kind || '');

  if (provider === 'jira') {
    if (kind === 'ticket_moved') diff.tickets_moved += 1;
    if (kind === 'ticket_completed') diff.tickets_completed += 1;
    if (kind === 'ticket_regressed') diff.tickets_regressed += 1;
    if (kind === 'ticket_created') diff.tickets_created += 1;
    return;
  }

  if (provider === 'github') {
    if (kind === 'pr_opened') diff.prs_opened += 1;
    if (kind === 'pr_merged') diff.prs_merged += 1;
    if (kind === 'pr_closed') diff.prs_closed += 1;
    if (kind === 'commit') diff.commits_default += 1;
    if (kind === 'pr_opened' || kind === 'pr_merged' || kind === 'pr_closed' || kind === 'commit') {
      addRepo(diff, row.repo_full_name);
    }
  }
}

export async function computeCanonicalDiffFromEvents(params: {
  supabase: SupabaseClient;
  sourceIds: string[];
  window: { start: string; end: string };
}): Promise<{ agg: CanonicalDiff; bySource: Record<string, CanonicalDiff>; hasRows: boolean }> {
  const { supabase, sourceIds, window } = params;
  const agg = emptyCanonicalDiff(window);
  const bySource: Record<string, CanonicalDiff> = {};

  if (sourceIds.length === 0) {
    return { agg, bySource, hasRows: false };
  }

  const sourceIdSet = new Set(sourceIds);
  let offset = 0;
  let page = 0;
  let hasRows = false;

  while (page < MAX_PAGES) {
    const { data: rows, error } = await supabase
      .from('diff_event_canonical')
      .select('source_id, provider, event_kind, repo_full_name')
      .in('source_id', sourceIds)
      .gte('occurred_at', window.start)
      .lte('occurred_at', window.end)
      .order('occurred_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error || !rows?.length) {
      if (error && !isNonFatalCanonicalReadError(error)) {
        console.warn('[computeCanonicalDiffFromEvents] canonical event read failed; returning empty aggregate', error);
      }
      break;
    }

    hasRows = true;
    for (const row of rows as CanonicalEventAggRow[]) {
      const sourceId = typeof row.source_id === 'string' ? row.source_id : '';
      if (!sourceId || !sourceIdSet.has(sourceId)) continue;

      if (!bySource[sourceId]) {
        bySource[sourceId] = emptyCanonicalDiff(window);
      }

      applyEventToDiff(bySource[sourceId], row);
      applyEventToDiff(agg, row);
    }

    if (rows.length < PAGE_SIZE) {
      break;
    }

    page += 1;
    offset += PAGE_SIZE;
  }

  return { agg, bySource, hasRows };
}
