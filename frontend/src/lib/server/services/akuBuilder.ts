import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { LLMGateway } from './llmGateway';

type Evidence = {
  id: string;
  source_id: string;
  kind: 'code' | 'issue';
  title: string;
  body: string;
  scope_ref: string;
};

type StructuredBody = {
  purpose: string;
  interfaces: string;
  dependencies: string;
  operational: string;
  failure_modes: string;
  data: string;
  ownership: string;
};

type AudienceSchema = {
  name: string;
  sections: Array<{ key: string; label: string; instructions: string; maxChars: number }>;
};

const AUDIENCE_SCHEMAS: Record<string, AudienceSchema> = {
  Executive: {
    name: 'Executive',
    sections: [
      { key: 'capability', label: 'Capability', instructions: 'One sentence, business capability.', maxChars: 220 },
      { key: 'impact', label: 'Impact', instructions: 'Business impact; user value; cost/risk mitigation. No tech jargon.', maxChars: 260 },
      { key: 'risks', label: 'Risks', instructions: 'Pull only from failure modes or operational concerns.', maxChars: 200 },
      { key: 'owner', label: 'Owner', instructions: 'Owner inferred from ownership signals or leave empty.', maxChars: 120 },
    ],
  },
  Sales: {
    name: 'Sales',
    sections: [
      { key: 'problem', label: 'Problem', instructions: 'Customer problem solved (plain language).', maxChars: 220 },
      { key: 'differentiators', label: 'Differentiators', instructions: 'Only facts in canonical evidence.', maxChars: 220 },
      { key: 'disqualifiers', label: 'Disqualifiers', instructions: 'When NOT to sell; pull from failure modes/limits.', maxChars: 200 },
      { key: 'integration', label: 'Integration', instructions: 'Key dependencies/setup from interfaces/dependencies.', maxChars: 200 },
    ],
  },
  Marketing: {
    name: 'Marketing',
    sections: [
      { key: 'positioning', label: 'Positioning', instructions: 'Market-facing positioning.', maxChars: 220 },
      { key: 'claims_allowed', label: 'Claims allowed', instructions: 'Only claims supported by evidence.', maxChars: 200 },
      { key: 'do_not_claim', label: 'Do-not-claim', instructions: 'Statements to avoid.', maxChars: 200 },
      { key: 'persona', label: 'Persona', instructions: 'Target persona.', maxChars: 140 },
    ],
  },
  Engineering: {
    name: 'Engineering',
    sections: [
      { key: 'summary', label: 'Summary', instructions: 'Technical overview.', maxChars: 320 },
      { key: 'interfaces', label: 'Interfaces', instructions: 'APIs/routes/call sites.', maxChars: 320 },
      { key: 'dependencies', label: 'Dependencies', instructions: 'Services, env vars, secrets, infra.', maxChars: 260 },
      { key: 'failure_modes', label: 'Failure modes', instructions: 'Likely failures and mitigations.', maxChars: 260 },
    ],
  },
  Support: {
    name: 'Support',
    sections: [
      { key: 'breakage', label: 'Common breakage', instructions: 'What typically breaks.', maxChars: 220 },
      { key: 'signals', label: 'Signals/alerts', instructions: 'Detection cues.', maxChars: 200 },
      { key: 'runbook', label: 'Runbook', instructions: 'Concrete steps; no inventions.', maxChars: 260 },
    ],
  },
  Customer: {
    name: 'Customer',
    sections: [
      { key: 'benefit', label: 'Benefit', instructions: 'Plain language benefit.', maxChars: 200 },
      { key: 'how_to_use', label: 'How to use', instructions: 'Safe usage from interfaces/data/operational.', maxChars: 220 },
      { key: 'limits', label: 'Limits', instructions: 'Known constraints only.', maxChars: 180 },
    ],
  },
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
  if (integrationHit) return { key: `integration:${integrationHit}`, label: `${integrationHit} integration`, reason: 'integration' };
  const featureHit = featureNames.find((n) => lower.startsWith(`${n}/`) || lower.includes(`/${n}/`));
  if (featureHit) return { key: `feature:${featureHit}`, label: `${featureHit}`, reason: 'feature' };
  return { key: `folder:${top}`, label: top, reason: 'folder' };
}

function summarizeText(texts: string[], maxLen = 600) {
  const joined = texts.join(' ');
  return joined.length <= maxLen ? joined : joined.slice(0, maxLen);
}

function buildStructuredBody(clusterLabel: string, items: Evidence[]): StructuredBody {
  const summaries = items.map((e) => e.body).filter(Boolean);
  const summaryText = summarizeText(summaries, 800) || `Capability: ${clusterLabel}`;

  const interfaceItems = items
    .filter((e) => e.scope_ref.toLowerCase().includes('api') || e.scope_ref.toLowerCase().includes('route'))
    .map((e) => `- ${e.scope_ref}`)
    .join('\n');

  const depsCandidates = ['modal', 'stripe', 'supabase', 'github', 'jira', 'confluence', 'notion', 'slack', 'queue', 'kafka', 'sqs', 'redis'];
  const deps = depsCandidates
    .filter((d) => summaries.some((s) => s.toLowerCase().includes(d)) || items.some((e) => e.scope_ref.toLowerCase().includes(d)))
    .map((d) => `- ${d}`)
    .join('\n');

  const ownership = items.map((e) => e.scope_ref.split('/')[0]).filter(Boolean);

  return {
    purpose: summaryText,
    interfaces: interfaceItems || 'Not observed',
    dependencies: deps || 'Not observed',
    operational: 'Rate limits / retries / timeouts not observed in summaries.',
    failure_modes: 'Auth failure, network/Modal outage, misconfiguration (inferred).',
    data: 'Data observed in summaries; ensure PII handling as per code.',
    ownership: ownership.length ? Array.from(new Set(ownership)).join(', ') : 'Not observed',
  };
}

function canonicalToMarkdown(c: StructuredBody) {
  return [
    '## Purpose',
    c.purpose,
    '## Interfaces',
    c.interfaces,
    '## Dependencies',
    c.dependencies,
    '## Operational concerns',
    c.operational,
    '## Failure modes',
    c.failure_modes,
    '## Data',
    c.data,
    '## Ownership',
    c.ownership,
  ].join('\n\n');
}

const FORBIDDEN_IF_NOT_PRESENT = ['sla', 'gdpr', 'hipaa', 'pci', 'encryption', 'privacy', 'compliance'];

function validateProjection(text: string, canonical: string, schema: AudienceSchema) {
  const lowerCanon = canonical.toLowerCase();
  const failures: string[] = [];
  FORBIDDEN_IF_NOT_PRESENT.forEach((term) => {
    if (text.toLowerCase().includes(term) && !lowerCanon.includes(term)) {
      failures.push(`Forbidden term without evidence: ${term}`);
    }
  });
  schema.sections.forEach((s) => {
    if (!text.toLowerCase().includes(s.label.toLowerCase().split(' ')[0])) {
      // soft check; allow
    }
  });
  return failures;
}

async function generateProjection(
  llm: LLMGateway,
  audience: string,
  schema: AudienceSchema,
  title: string,
  canonical: string,
  structured: StructuredBody
) {
  const system = [
    'You are Canon AKU projection generator.',
    'Use ONLY provided canonical facts; forbid fabrication.',
    'Output compact JSON ONLY, no code fences, no markdown.',
    'Shape: {"sections":[{"label":"<label>","text":"<short human text>"}]}',
    'Labels must match provided schema labels exactly.',
    'If a section is unsupported by evidence, use empty string.',
  ].join(' ');

  const userContent = {
    audience: schema.name,
    title,
    schema: schema.sections.map((s) => ({ label: s.label, instructions: s.instructions, maxChars: s.maxChars })),
    canonical,
    structured,
  };

  try {
    const respText = await llm.call(
      [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(userContent) },
      ] as any,
      'openai/gpt-4o-mini',
      0.2
    );

    const cleaned = (respText || '')
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    // Attempt to extract JSON object if extra text present
    const jsonMatch = cleaned.match(/{[\s\S]*}/);
    const jsonText = jsonMatch ? jsonMatch[0] : cleaned;

    const parsed = JSON.parse(jsonText);
    if (!parsed.sections || !Array.isArray(parsed.sections)) throw new Error('Invalid projection shape');

    const projection = parsed.sections
      .filter((s: any) => s?.label)
      .map((s: { label: string; text: string }) => `${s.label}:\n${(s.text || '').trim()}`)
      .join('\n\n')
      .trim();

    if (!projection) throw new Error('Empty projection');

    const validation = validateProjection(projection, canonical, schema);
    const status = validation.length === 0 ? 'draft' : 'pending_verification';
    const finalText = validation.length === 0 ? projection : `PENDING: ${validation.join('; ')}\n\n${projection}`;
    return { projection: finalText, status };
  } catch (e) {
    return {
      projection: `PENDING: projection generation failed (${(e as Error).message})`,
      status: 'pending_verification',
    };
  }
}

export async function buildAkusForSources(
  supabase: SupabaseClient,
  userId: string,
  sourceIds: string[],
  audiences: string[] = []
) {
  console.log('[AKU builder] start', { userId, sourceIds, audiences });
  if (sourceIds.length === 0) return { akus: [], projections: [] };

  const evidence: Evidence[] = [];

  const { data: summaries } = await supabase
    .from('repo_file_summaries')
    .select('id, source_id, file_path, summary_text')
    .in('source_id', sourceIds);

  summaries?.forEach((s) => {
    evidence.push({
      id: s.id,
      source_id: s.source_id,
      kind: 'code',
      title: s.file_path,
      body: s.summary_text || '',
      scope_ref: s.file_path,
    });
  });

  console.log('[AKU builder] evidence from summaries', { count: evidence.length });

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

  console.log('[AKU builder] total evidence after issues', { count: evidence.length });

  const clusters = new Map<string, { items: Evidence[]; label: string; reason: string }>();
  evidence.forEach((e) => {
    const cls = classifyFile(e.scope_ref);
    if (!clusters.has(cls.key)) clusters.set(cls.key, { items: [], label: cls.label, reason: cls.reason });
    clusters.get(cls.key)!.items.push(e);
  });

  const akus: any[] = [];
  const projections: any[] = [];
  const llm = new LLMGateway();

  for (const [key, cluster] of clusters.entries()) {
    const items = cluster.items;
    if (items.length === 0) continue;
    const hasIssue = items.some((e) => e.kind === 'issue');
    if (!hasIssue && items.length < 2) continue;

    console.log('[AKU builder] cluster', { key, label: cluster.label, reason: cluster.reason, size: items.length });

    const title = cluster.label.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const structured = buildStructuredBody(title, items);
    const canonical = canonicalToMarkdown(structured);

    const source_ids = Array.from(new Set(items.map((i) => i.source_id)));
    const scope_refs = Array.from(new Set(items.map((i) => i.scope_ref)));
    const hash = `${items.map((i) => i.id).sort().join(':')}`;
    const akuId = randomUUID();

    const crit = scoreText(title + canonical, criticalKeywords);
    const promise = scoreText(title + canonical, promiseKeywords);
    const blast = scoreText(title + canonical, blastKeywords);
    const audSurface = audienceSurface(title, canonical);
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
      body: canonical,
      type: hasIssue ? 'issue' : 'code_summary',
      source_ids,
      scope_refs,
      hash,
      status: 'draft',
      scores,
    });

    for (const aud of audiences) {
      const schema = AUDIENCE_SCHEMAS[aud] || AUDIENCE_SCHEMAS.Engineering;
      const { projection, status } = await generateProjection(llm, aud, schema, title, canonical, structured);
      projections.push({
        id: randomUUID(),
        aku_id: akuId,
        audience: aud,
        projection,
        status,
      });
    }
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
    if (akuErr) console.error('[AKU builder] upsert akus error', akuErr);
  }

  if (projections.length > 0) {
    const { error: projErr } = await supabase.from('audience_views').upsert(
      projections.map((p) => ({
        ...p,
        user_id: userId,
      })),
      { onConflict: 'aku_id,audience' }
    );
    if (projErr) console.error('[AKU builder] upsert projections error', projErr);
  }

  console.log('[AKU builder] done', { userId, akus: akus.length, projections: projections.length });
  return { akus, projections };
}
