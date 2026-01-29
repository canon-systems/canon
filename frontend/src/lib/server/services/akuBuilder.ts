import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
type Evidence = {
  id: string;
  source_id: string;
  kind: 'code' | 'issue';
  title: string;
  body: string;
  scope_ref: string;
};

const audienceTemplates: Record<string, (title: string, sections: StructuredBody) => string> = {
  Executive: (title, sections) =>
    `Capability: ${title}\nImpact: ${sections.summary}\nRisks: ${sections.failure_modes || 'TBD'}\nOwner: TBD`,
  Sales: (_title, sections) =>
    `Problem: ${sections.summary}\nDifferentiators: ${sections.dependencies || 'TBD'}\nDisqualifiers: TBD\nIntegration reqs: ${sections.dependencies || 'TBD'}`,
  Marketing: (_title, sections) =>
    `Positioning: ${sections.summary}\nClaims allowed: TBD\nDo-not-claim: TBD\nTarget persona: TBD`,
  Engineering: (_title, sections) =>
    `Summary:\n${sections.summary}\nInterfaces:\n${sections.interfaces || 'TBD'}\nDependencies:\n${sections.dependencies || 'TBD'}\nFailure modes:\n${sections.failure_modes || 'TBD'}`,
  Support: (_title, sections) =>
    `Common breakage: ${sections.failure_modes || 'TBD'}\nSignals/alerts: TBD\nRunbook:\n${sections.summary}`,
  Customer: (_title, sections) =>
    `Benefit: ${sections.summary}\nHow to use safely: TBD\nLimits: TBD\nContact: Support`,
};

const criticalKeywords = ['auth', 'token', 'jwt', 'billing', 'payment', 'invoice', 'stripe', 'permission', 'acl', 'sso', 'saml', 'pii', 'data loss', 'encryption', 'backup'];
const promiseKeywords = ['sla', 'uptime', 'latency', 'throughput', 'compliance', 'gdpr', 'hipaa', 'pci', 'security', 'privacy', 'durable', 'idempotent'];
const blastKeywords = ['queue', 'kafka', 'sqs', 'pubsub', 'cron', 'job', 'worker', 'migration', 'database', 'cache', 'redis', 'memcached', 'gateway', 'ingress', 'load balancer'];

function scoreText(text: string, keys: string[]) {
  const lower = text.toLowerCase();
  return keys.reduce((acc, k) => (lower.includes(k) ? acc + 1 : acc), 0);
}

function audienceSurface(title: string, body: string) {
  const lower = (title + ' ' + body).toLowerCase();
  const map: Record<string, number> = {
    Executive: scoreText(lower, ['billing', 'revenue', 'risk', 'security', 'compliance']),
    Sales: scoreText(lower, ['integration', 'api', 'sso', 'sla', 'limits', 'pricing']),
    Marketing: scoreText(lower, ['position', 'claim', 'brand', 'security', 'uptime']),
    Engineering: scoreText(lower, ['api', 'job', 'queue', 'cache', 'db', 'schema', 'migration', 'deploy']),
    Support: scoreText(lower, ['error', 'retry', 'timeout', 'alert', 'incident', 'log']),
    Customer: scoreText(lower, ['api', 'usage', 'limit', 'auth', 'token']),
  };
  const count = Object.values(map).filter((v) => v > 0).length;
  return { map, count };
}

type StructuredBody = {
  summary: string;
  interfaces: string;
  dependencies: string;
  invariants: string;
  failure_modes: string;
  notes: string;
};

type ClusterKey = { key: string; label: string; reason: string };

function classifyFile(path: string): ClusterKey {
  const lower = path.toLowerCase();
  const parts = path.split('/').filter(Boolean);
  const top = parts[0] || 'root';

  const integrationNames = ['modal', 'stripe', 'supabase', 'github', 'jira', 'confluence', 'notion', 'slack'];
  const featureNames = ['auth', 'billing', 'ingest', 'summarize', 'docs', 'automation'];

  if (lower.includes('/api/') || lower.includes('routes') || lower.includes('controller') || lower.includes('handler')) {
    return { key: `route:${top}`, label: `${top} routes`, reason: 'route' };
  }
  if (lower.includes('job') || lower.includes('worker') || lower.includes('cron')) {
    return { key: `job:${top}`, label: `${top} jobs`, reason: 'job' };
  }
  const integrationHit = integrationNames.find((n) => lower.includes(n));
  if (integrationHit) {
    return { key: `integration:${integrationHit}`, label: `${integrationHit} integration`, reason: 'integration' };
  }
  const featureHit = featureNames.find((n) => lower.startsWith(`${n}/`) || lower.includes(`/${n}/`));
  if (featureHit) {
    return { key: `feature:${featureHit}`, label: `${featureHit}`, reason: 'feature' };
  }
  return { key: `folder:${top}`, label: top, reason: 'folder' };
}

function buildStructuredBody(clusterLabel: string, items: Evidence[]): StructuredBody {
  const summaries = items.map((e) => e.body).filter(Boolean);
  const summaryText = summaries.join(' ') || `Capability: ${clusterLabel}`;

  const interfaceItems = items
    .filter((e) => e.scope_ref.toLowerCase().includes('api') || e.scope_ref.toLowerCase().includes('route'))
    .map((e) => `- ${e.scope_ref}`)
    .join('\n');

  const depsCandidates = ['modal', 'stripe', 'supabase', 'github', 'jira', 'confluence', 'notion', 'slack', 'queue', 'kafka', 'sqs'];
  const deps = depsCandidates
    .filter((d) => summaries.some((s) => s.toLowerCase().includes(d)) || items.some((e) => e.scope_ref.toLowerCase().includes(d)))
    .map((d) => `- ${d}`)
    .join('\n');

  return {
    summary: summaryText,
    interfaces: interfaceItems || 'TBD',
    dependencies: deps || 'TBD',
    invariants: 'TBD',
    failure_modes: 'TBD',
    notes: `Sources: ${items.map((e) => e.scope_ref).join(', ')}`,
  };
}

/**
 * Build AKUs and optional audience projections for the given sources.
 * Designed to be called from ingest flows and HTTP handlers.
 */
export async function buildAkusForSources(
  supabase: SupabaseClient,
  userId: string,
  sourceIds: string[],
  audiences: string[] = []
) {
  console.log('[AKU builder] start', { userId, sourceIds, audiences });
  if (sourceIds.length === 0) return { akus: [], projections: [] };

  const evidence: Evidence[] = [];

  // Resolve source keys from workspace_sources (repo_url/external_url) for fallback matching
  const { data: summaries } = await supabase
    .from('repo_file_summaries')
    .select('id, source_id, file_path, summary_text');

  summaries
    ?.filter((s) => {
      return s.source_id && sourceIds.includes(s.source_id);
    })
    .forEach((s) => {
      evidence.push({
        id: s.id,
        source_id: s.source_id || 'unknown',
        kind: 'code',
        title: s.file_path,
        body: s.summary_text || '',
        scope_ref: s.file_path,
      });
    });

  if (evidence.length === 0 && (summaries || []).length > 0) {
    console.log('[AKU builder] note: no summaries matched source ids', {
      requestedSourceIds: sourceIds,
      summaryCount: summaries?.length || 0,
    });
  }

  const { data: issues } = await supabase
    .from('issue_index')
    .select('id, source_id, issue_key, title, description')
    .in('source_id', sourceIds);

  issues?.forEach((i) => {
    evidence.push({
      id: i.id,
      source_id: i.source_id,
      kind: 'issue',
      title: i.title || i.issue_key,
      body: i.description || '',
      scope_ref: i.issue_key || i.title || 'issue',
    });
  });

  // cluster by capability heuristics
  const clusters = new Map<string, { items: Evidence[]; label: string; reason: string }>();
  evidence.forEach((e) => {
    const cls = classifyFile(e.scope_ref);
    if (!clusters.has(cls.key)) clusters.set(cls.key, { items: [], label: cls.label, reason: cls.reason });
    clusters.get(cls.key)!.items.push(e);
  });

  type Aku = {
    id: string;
    title: string;
    body: string;
    type: 'issue' | 'code_summary';
    source_ids: string[];
    scope_refs: string[];
    hash: string;
    status: string;
    scores: Record<string, unknown>;
  };

  type AudienceProjection = {
    id: string;
    aku_id: string;
    audience: string;
    projection: string;
    status: string;
  };

  const akus: Aku[] = [];
  const projections: AudienceProjection[] = [];

  for (const [, cluster] of clusters.entries()) {
    const items = cluster.items;
    if (items.length === 0) continue;
    const hasIssue = items.some((e) => e.kind === 'issue');
    if (!hasIssue && items.length < 2) continue;

    const title = cluster.label.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const structured = buildStructuredBody(title, items);
    const body = `## Summary\n${structured.summary}\n\n## Interfaces\n${structured.interfaces}\n\n## Dependencies\n${structured.dependencies}\n\n## Invariants\n${structured.invariants}\n\n## Failure modes\n${structured.failure_modes}\n\n## Notes\n${structured.notes}`;
    const source_ids = Array.from(new Set(items.map((i) => i.source_id)));
    const scope_refs = Array.from(new Set(items.map((i) => i.scope_ref)));
    const hash = `${items.map((i) => i.id).sort().join(':')}`;
    const akuId = randomUUID();

    // scoring
    const crit = scoreText(title + ' ' + body, criticalKeywords);
    const promise = scoreText(title + ' ' + body, promiseKeywords);
    const blast = scoreText(title + ' ' + body, blastKeywords);
    const audSurface = audienceSurface(title, body);
    const scores = {
      business_criticality: crit,
      promise_surface: promise,
      blast_radius: blast,
      audience_surface: audSurface.count,
      audience_map: audSurface.map,
      total: crit * 0.35 + promise * 0.2 + blast * 0.2 + audSurface.count * 0.25,
    };

    akus.push({
      id: akuId,
      title,
      body,
      type: hasIssue ? 'issue' : 'code_summary',
      source_ids,
      scope_refs,
      hash,
      status: 'draft',
      scores,
    });

    audiences.forEach((aud: string) => {
      const tmpl = audienceTemplates[aud] || (() => body);
      projections.push({
        id: randomUUID(),
        aku_id: akuId,
        audience: aud,
        projection: tmpl(title, structured),
        status: 'draft',
      });
    });
  }

  console.log('[AKU builder] stats', {
    evidence: evidence.length,
    clusters: clusters.size,
    promoted: akus.length,
    projections: projections.length,
  });

  if (akus.length > 0) {
    const { error: akuErr } = await supabase.from('akus').upsert(
      akus.map((a) => ({
        ...a,
        user_id: userId,
      })),
      { onConflict: 'hash' }
    );
    if (akuErr) {
      console.error('[AKU builder] upsert akus error', akuErr);
    }
  }

  if (projections.length > 0) {
    const { error: projErr } = await supabase.from('audience_views').upsert(
      projections.map((p) => ({
        ...p,
        user_id: userId,
      })),
      { onConflict: 'aku_id,audience' }
    );
    if (projErr) {
      console.error('[AKU builder] upsert projections error', projErr);
    }
  }

  console.log('[AKU builder] done', { userId, akus: akus.length, projections: projections.length });
  return { akus, projections };
}
