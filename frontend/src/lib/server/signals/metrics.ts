import type { SupabaseClient } from '@supabase/supabase-js';
import { runDiffForSources } from '@/lib/server/diff/runDiffForSources';
import type { ComputeMetricsInput, MetricSnapshot } from '@/lib/server/signals/types';
import { canonicalEventEntityType, loadAkuEvidenceRefMap } from '@/lib/server/signals/akuEvidenceRefs';

type CanonicalEventRow = {
  provider: string | null;
  event_kind: string | null;
  entity_id: string | null;
  repo_full_name: string | null;
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
      aku_distribution: {},
    };
  }

  const { data: eventRows } = (await supabase
    .from('diff_event_canonical')
    .select('provider, event_kind, entity_id, repo_full_name')
    .in('source_id', sourceIds)
    .gte('occurred_at', window.start)
    .lte('occurred_at', window.end)) as { data: CanonicalEventRow[] | null };

  const repoCounts = new Map<string, number>();
  const githubKinds = new Set(['pr_opened', 'pr_merged', 'pr_closed', 'commit']);

  for (const row of eventRows || []) {
    const provider = String(row.provider || '').toLowerCase();
    const eventKind = String(row.event_kind || '');
    const repoFullName = typeof row.repo_full_name === 'string' ? row.repo_full_name : null;

    if (provider === 'github' && repoFullName && githubKinds.has(eventKind)) {
      repoCounts.set(repoFullName, (repoCounts.get(repoFullName) || 0) + 1);
    }
  }

  const refsByEventKey = await loadAkuEvidenceRefMap({
    supabase,
    userId,
    sourceIds,
  });

  const akuCounts = new Map<string, number>();
  for (const row of eventRows || []) {
    const provider = String(row.provider || '').toLowerCase();
    const eventKind = String(row.event_kind || '');
    const entityId = typeof row.entity_id === 'string' ? row.entity_id : null;
    const repoFullName = typeof row.repo_full_name === 'string' ? row.repo_full_name : null;

    const entityType = canonicalEventEntityType(eventKind);
    const matchedAkuIds = new Set<string>();

    if (entityType && entityId) {
      const key = `${provider}:${entityType}:${entityId}`;
      const direct = refsByEventKey.get(key);
      if (direct) {
        for (const akuId of direct) matchedAkuIds.add(akuId);
      }
    }

    if (provider === 'github' && repoFullName) {
      const repoKey = `github:repo:${repoFullName}`;
      const repoMatches = refsByEventKey.get(repoKey);
      if (repoMatches) {
        for (const akuId of repoMatches) matchedAkuIds.add(akuId);
      }
    }

    for (const akuId of matchedAkuIds) {
      akuCounts.set(akuId, (akuCounts.get(akuId) || 0) + 1);
    }
  }

  const ticketsCompleted = Number(aggregate.tickets_completed || 0);
  const ticketsRegressed = Number(aggregate.tickets_regressed || 0);

  return {
    window,
    tickets_completed: ticketsCompleted,
    tickets_regressed: ticketsRegressed,
    regression_rate: ticketsRegressed / Math.max(ticketsCompleted, 1),
    prs_opened: Number(aggregate.prs_opened || 0),
    prs_merged: Number(aggregate.prs_merged || 0),
    repos_touched: Array.isArray(aggregate.repos_touched) ? aggregate.repos_touched.length : 0,
    repo_distribution: toDistribution(repoCounts),
    aku_distribution: toDistribution(akuCounts),
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

  const { data: rows } = await supabase
    .from('diff_daily_metrics')
    .select('day, feature_counts')
    .in('source_id', sourceIds)
    .gte('day', window.start.slice(0, 10))
    .lte('day', window.end.slice(0, 10));

  if (!rows) return {};

  const counts = new Map<string, number>();
  for (const row of rows) {
    const featureCounts = (row.feature_counts as Record<string, unknown>) || {};
    for (const [key, val] of Object.entries(featureCounts)) {
      if (typeof val !== 'object' || val === null) continue;
      const bucket = val as Record<string, number>;
      const total =
        Number(bucket.prs_opened || 0) +
        Number(bucket.prs_merged || 0) +
        Number(bucket.commits_default || 0) +
        Number(bucket.tickets_moved || 0) +
        Number(bucket.tickets_completed || 0) +
        Number(bucket.tickets_regressed || 0) +
        Number(bucket.tickets_created || 0);
      if (total > 0) counts.set(key, (counts.get(key) || 0) + total);
    }
  }

  return toDistribution(counts);
}
