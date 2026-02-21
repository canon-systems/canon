import type { SupabaseClient } from '@supabase/supabase-js';
import { runDiffForSources } from '@/lib/server/diff/runDiffForSources';
import type { ComputeMetricsInput, MetricSnapshot } from '@/lib/server/signals/types';
import { computeWeightedEffort } from '@/lib/server/signals/effortWeights';
import { featureKeyFromPath } from '@/lib/server/services/sourceIngest';

type CanonicalEventRow = {
  source_id: string | null;
  provider: string | null;
  event_kind: string | null;
  source_full_name: string | null;
};

function toDistribution(counts: Map<string, number>): Record<string, number> {
  const total = Array.from(counts.values()).reduce((acc, value) => acc + value, 0);
  if (total <= 0) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of counts.entries()) {
    out[key] = value / total;
  }
  return out;
}

export async function computeMetrics(
  params: ComputeMetricsInput & { supabase: SupabaseClient }
): Promise<MetricSnapshot> {
  const { supabase, userId, sourceIds, window } = params;

  const aggregate = await runDiffForSources(userId, sourceIds, window, supabase);

  if (sourceIds.length === 0) {
    return {
      window,
      tickets_completed: 0,
      tickets_regressed: 0,
      regression_rate: 0,
      prs_opened: 0,
      prs_merged: 0,
      repos_touched: 0,
      repo_distribution: {},
      domain_distribution: {},
    };
  }

  const { data: sourceRows } = (await supabase
    .from('workspace_sources')
    .select('id, domain')
    .eq('user_id', userId)
    .in('id', sourceIds)) as {
    data: Array<{ id: string; domain: string | null }> | null;
  };
  const sourceDomainById = new Map<string, string>();
  for (const row of sourceRows || []) {
    const domain = typeof row.domain === 'string' ? row.domain.trim() : '';
    if (!domain) continue;
    sourceDomainById.set(row.id, domain);
  }

  const { data: eventRows } = (await supabase
    .from('diff_event_canonical')
    .select('source_id, provider, event_kind, source_full_name')
    .in('source_id', sourceIds)
    .gte('occurred_at', window.start)
    .lte('occurred_at', window.end)) as { data: CanonicalEventRow[] | null };

  const repoCounts = new Map<string, number>();
  const domainCounts = new Map<string, number>();
  const githubKinds = new Set(['pr_opened', 'pr_merged', 'pr_closed', 'commit']);

  for (const row of eventRows || []) {
    const provider = String(row.provider || '').toLowerCase();
    const eventKind = String(row.event_kind || '');
    const repoFullName = typeof row.source_full_name === 'string' ? row.source_full_name : null;

    if (provider === 'github' && repoFullName && githubKinds.has(eventKind)) {
      repoCounts.set(repoFullName, (repoCounts.get(repoFullName) || 0) + 1);
    }

    const effort = computeWeightedEffort({
      prs_opened: eventKind === 'pr_opened' ? 1 : 0,
      prs_merged: eventKind === 'pr_merged' ? 1 : 0,
      commits_default: eventKind === 'commit' ? 1 : 0,
      tickets_completed: eventKind === 'ticket_completed' ? 1 : 0,
      tickets_regressed: eventKind === 'ticket_regressed' ? 1 : 0,
    });
    const sourceId = typeof row.source_id === 'string' ? row.source_id : '';
    const domain = sourceDomainById.get(sourceId);
    if (domain && effort > 0) {
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + effort);
    }
  }

  const ticketsCompleted = Number(aggregate.tickets_completed || 0);
  const ticketsRegressed = Number(aggregate.tickets_regressed || 0);

  return {
    window,
    tickets_completed: ticketsCompleted,
    tickets_regressed: ticketsRegressed,
    regression_rate: ticketsRegressed / Math.max(ticketsCompleted + ticketsRegressed, 1),
    prs_opened: Number(aggregate.prs_opened || 0),
    prs_merged: Number(aggregate.prs_merged || 0),
    repos_touched: Array.isArray(aggregate.repos_touched) ? aggregate.repos_touched.length : 0,
    repo_distribution: toDistribution(repoCounts),
    domain_distribution: toDistribution(domainCounts),
  };
}

export async function computeFeatureDistribution(params: {
  supabase: SupabaseClient;
  userId: string;
  sourceIds: string[];
  window: { start: string; end: string };
}): Promise<Record<string, number>> {
  const { supabase, sourceIds, window } = params;
  if (sourceIds.length === 0) return {};

  const counts = new Map<string, number>();
  const pageSize = 1000;
  const maxPages = 300;
  let offset = 0;
  let page = 0;

  while (page < maxPages) {
    const { data: rows, error } = await supabase
      .from('diff_event_canonical')
      .select('event_kind, metadata')
      .in('source_id', sourceIds)
      .gte('occurred_at', window.start)
      .lte('occurred_at', window.end)
      .order('occurred_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error || !rows?.length) {
      if (error) {
        console.error('[computeFeatureDistribution] failed to load canonical events', error);
      }
      break;
    }

    for (const row of rows) {
      const metadata = (row.metadata as Record<string, unknown>) || {};
      const pathsRaw = metadata.paths;
      const paths = Array.isArray(pathsRaw) ? pathsRaw.filter((path): path is string => typeof path === 'string') : [];
      const feature = paths.map((path) => featureKeyFromPath(path)).find((key) => key) || null;
      if (!feature) continue;

      const kind = String(row.event_kind || '');
      const effort = computeWeightedEffort({
        prs_opened: kind === 'pr_opened' ? 1 : 0,
        prs_merged: kind === 'pr_merged' ? 1 : 0,
        commits_default: kind === 'commit' ? 1 : 0,
        tickets_completed: kind === 'ticket_completed' ? 1 : 0,
        tickets_regressed: kind === 'ticket_regressed' ? 1 : 0,
      });
      if (effort > 0) {
        counts.set(feature, (counts.get(feature) || 0) + effort);
      }
    }

    if (rows.length < pageSize) break;
    page += 1;
    offset += pageSize;
  }

  return toDistribution(counts);
}
