import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'crypto';
import { LLMGateway, type Message } from './llmGateway';

/** Stable id for an AKU so we update the same row when evidence changes (no new record per file/ticket change). */
function deterministicAkuId(userId: string, clusterKey: string): string {
  const h = createHash('sha256').update(`${userId}:${clusterKey}`).digest('hex').slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Per-source AKU id so the same cluster key from different sources gets different rows. */
function deterministicAkuIdWithSource(userId: string, clusterKey: string, sourceId: string): string {
  const h = createHash('sha256').update(`${userId}:${clusterKey}:${sourceId}`).digest('hex').slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** 32-char hash of evidence ids for AKU uniqueness (fits btree index limit). */
function akuHashFromEvidenceIds(evidenceIds: string[]): string {
  const composite = evidenceIds.slice().sort().join(':');
  return createHash('md5').update(composite).digest('hex');
}

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
      { key: 'capability', label: 'Capability', instructions: 'Business capability in clear language; avoid technical jargon.', maxChars: 800 },
      { key: 'impact', label: 'Impact', instructions: 'Business impact; user value; revenue/risk/cost effects.', maxChars: 800 },
      { key: 'risks', label: 'Risks', instructions: 'Only risks supported by evidence; business framing.', maxChars: 600 },
      { key: 'owner', label: 'Owner', instructions: 'Owner inferred from ownership signals or state unknown.', maxChars: 300 },
    ],
  },
  Sales: {
    name: 'Sales',
    sections: [
      { key: 'problem', label: 'Problem', instructions: 'Customer problem solved; business terms, not technical.', maxChars: 800 },
      { key: 'differentiators', label: 'Differentiators', instructions: 'Only evidence-backed differentiators.', maxChars: 800 },
      { key: 'disqualifiers', label: 'Disqualifiers', instructions: 'When NOT to sell; limits/risks from evidence.', maxChars: 600 },
      { key: 'integration', label: 'Integration', instructions: 'Setup/requirements expressed simply.', maxChars: 600 },
    ],
  },
  Marketing: {
    name: 'Marketing',
    sections: [
      { key: 'positioning', label: 'Positioning', instructions: 'Market-facing positioning in plain language.', maxChars: 800 },
      { key: 'claims_allowed', label: 'Claims allowed', instructions: 'Only claims supported by evidence.', maxChars: 600 },
      { key: 'do_not_claim', label: 'Do-not-claim', instructions: 'Statements to avoid (evidence-backed).', maxChars: 600 },
      { key: 'persona', label: 'Persona', instructions: 'Target persona/business buyer.', maxChars: 400 },
    ],
  },
  Engineering: {
    name: 'Engineering',
    sections: [
      { key: 'summary', label: 'Summary', instructions: 'Technical overview with enough context.', maxChars: 900 },
      { key: 'interfaces', label: 'Interfaces', instructions: 'APIs/routes/call sites.', maxChars: 900 },
      { key: 'dependencies', label: 'Dependencies', instructions: 'Services, env vars, secrets, infra.', maxChars: 800 },
      { key: 'failure_modes', label: 'Failure modes', instructions: 'Likely failures and mitigations.', maxChars: 800 },
    ],
  },
  Support: {
    name: 'Support',
    sections: [
      { key: 'breakage', label: 'Common breakage', instructions: 'What typically breaks; user-facing language.', maxChars: 800 },
      { key: 'signals', label: 'Signals/alerts', instructions: 'Detection cues.', maxChars: 600 },
      { key: 'runbook', label: 'Runbook', instructions: 'Concrete steps; no inventions.', maxChars: 900 },
    ],
  },
  Customer: {
    name: 'Customer',
    sections: [
      { key: 'benefit', label: 'Benefit', instructions: 'Plain language benefit and outcome.', maxChars: 800 },
      { key: 'how_to_use', label: 'How to use', instructions: 'Safe usage, step-like, no jargon.', maxChars: 800 },
      { key: 'limits', label: 'Limits', instructions: 'Known constraints only.', maxChars: 600 },
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
    'Adapt language to the audience: for Executive, Sales, Marketing, Customer, Support use business/plain language and explain value/outcomes; avoid technical jargon. For Engineering, keep technical detail.',
    'Provide a full but concise picture; do not artificially truncate—cover all relevant evidence.',
  ].join(' ');

  const userContent = {
    audience: schema.name,
    title,
    schema: schema.sections.map((s) => ({ label: s.label, instructions: s.instructions, maxChars: s.maxChars })),
    canonical,
    structured,
  };

  try {
    const messages: Message[] = [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(userContent) },
    ];
    const respText = await llm.call(messages, 'openai/gpt-4o-mini', 0.2);

    const cleaned = (respText || '')
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    // Attempt to extract JSON object if extra text present
    const jsonMatch = cleaned.match(/{[\s\S]*}/);
    const jsonText = jsonMatch ? jsonMatch[0] : cleaned;

    const parsed = JSON.parse(jsonText) as { sections?: Array<{ label?: string; text?: string }> };
    if (!parsed.sections || !Array.isArray(parsed.sections)) throw new Error('Invalid projection shape');

    const projection = parsed.sections
      .filter((s): s is { label: string; text?: string } => Boolean(s?.label))
      .map((s) => `${s.label}:\n${(s.text || '').trim()}`)
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

export type BuildAkusOptions = { perSource?: boolean };

export async function buildAkusForSources(
  supabase: SupabaseClient,
  userId: string,
  sourceIds: string[],
  audiences: string[] = [],
  options: BuildAkusOptions = {}
) {
  if (sourceIds.length === 0) return { akus: [], projections: [] };
  const perSource = options.perSource === true && sourceIds.length >= 1;

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

  // console.log(`AKU builder: collected ${evidence.length} code summaries`);

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
      body: i.description || i.title || i.issue_key || '',
      scope_ref: i.issue_key || i.title || 'issue',
    });
  });

  // console.log(`AKU builder: total evidence after adding issues = ${evidence.length}`);

  const clusters = new Map<string, { items: Evidence[]; label: string; reason: string }>();
  evidence.forEach((e) => {
    const cls = classifyFile(e.scope_ref);
    if (!clusters.has(cls.key)) clusters.set(cls.key, { items: [], label: cls.label, reason: cls.reason });
    clusters.get(cls.key)!.items.push(e);
  });

  const clusterCount = clusters.size;
  const codeCount = evidence.filter((e) => e.kind === 'code').length;
  const issueCount = evidence.filter((e) => e.kind === 'issue').length;
  console.log(
    `[AKU builder] Starting: ${evidence.length} evidence (${codeCount} file summaries, ${issueCount} issues), ${clusterCount} clusters, audiences: [${audiences.join(', ')}]`
  );

  const hashesForRun: string[] = [];
  for (const [, cluster] of clusters.entries()) {
    const items = cluster.items;
    if (items.length === 0) continue;
    const hasIssue = items.some((e) => e.kind === 'issue');
    if (!hasIssue && items.length < 2) continue;
    hashesForRun.push(akuHashFromEvidenceIds(items.map((i) => i.id)));
  }
  const { data: existingByHash } =
    hashesForRun.length > 0
      ? await supabase.from('akus').select('id, hash').eq('user_id', userId).in('hash', hashesForRun)
      : { data: [] };
  const idByHash = new Map<string, string>((existingByHash || []).map((r) => [r.hash, r.id]));

  type AkuRecord = {
    id: string;
    title: string;
    body: string;
    type: 'code_summary' | 'issue';
    source_ids: string[];
    scope_refs: string[];
    hash: string;
    status: string;
    scores: Record<string, number | Record<string, number>>;
  };
  type ProjectionRecord = {
    id: string;
    aku_id: string;
    audience: string;
    projection: string;
    status: string;
  };
  const akus: AkuRecord[] = [];
  const projections: ProjectionRecord[] = [];
  const llm = new LLMGateway();

  for (const [clusterKey, cluster] of clusters.entries()) {
    const items = cluster.items;
    if (items.length === 0) continue;
    const hasIssue = items.some((e) => e.kind === 'issue');
    if (!hasIssue && items.length < 2) continue;

    const title = cluster.label.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    console.log(`[AKU builder] AKU: "${title}" (${items.length} evidence items: ${items.map((i) => i.scope_ref).slice(0, 3).join(', ')}${items.length > 3 ? '...' : ''})`);
    const structured = buildStructuredBody(title, items);
    const canonical = canonicalToMarkdown(structured);

    const source_ids = Array.from(new Set(items.map((i) => i.source_id)));
    const scope_refs = Array.from(new Set(items.map((i) => i.scope_ref)));
    const hash = akuHashFromEvidenceIds(items.map((i) => i.id));
    const akuId = perSource
      ? deterministicAkuIdWithSource(userId, clusterKey, sourceIds[0])
      : (idByHash.get(hash) ?? deterministicAkuId(userId, clusterKey));

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
      console.log(`[LLM] Generating audience projection: audience=${aud}, AKU="${title}"`);
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

  console.log(
    `[AKU builder] Summary: ${akus.length} AKU(s), ${projections.length} audience projection(s) (${audiences.length} audiences × ${akus.length} AKUs)`
  );

  if (akus.length > 0) {
    const now = new Date().toISOString();
    // Upsert by id so we update existing rows (including those with old hash) instead of
    // inserting a duplicate id when hash changed (e.g. long composite → 32-char MD5).
    const { error: akuErr } = await supabase.from('akus').upsert(
      akus.map((a) => ({
        ...a,
        user_id: userId,
        updated_at: now,
      })),
      { onConflict: 'id' }
    );
    if (akuErr) {
      console.error('AKU builder: failed to save AKUs', akuErr);
      return { akus, projections };
    }
  }

  if (projections.length > 0) {
    const now = new Date().toISOString();
    const { error: projErr } = await supabase.from('audience_views').upsert(
      projections.map((p) => ({
        ...p,
        user_id: userId,
        updated_at: now,
      })),
      { onConflict: 'aku_id,audience' }
    );
    if (projErr) console.error('AKU builder: failed to save projections', projErr);
  }

  // console.log('AKU builder: finished', { userId, akus: akus.length, projections: projections.length });
  return { akus, projections };
}
