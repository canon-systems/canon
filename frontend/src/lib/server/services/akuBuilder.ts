import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'crypto';
import { UndirectedGraph } from 'graphology';
import louvain from 'graphology-communities-louvain';
import { LLMGateway, type Message } from './llmGateway';
import { buildExtractionTargetsFromSourceIds, fetchSourceCodeArtifacts, type SourceExtractionTarget } from './sourceCodeArtifacts';
import { TreeSitterAnalyzer, type DependencyInfo } from './treeSitterAnalyzer';

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
  cluster_ref: string;
};

type GraphCluster = {
  key: string;
  label: string;
  reason: string;
  files: string[];
};

type EvidenceBlock = {
  evidence_id: string;
  source_id: string;
  kind: 'code' | 'issue';
  scope_ref: string;
  title: string;
  snippet: string;
};

type CanonicalEvidence = {
  aku_title: string;
  evidence_count: number;
  code_evidence_count: number;
  issue_evidence_count: number;
  scope_refs: string[];
  evidence: EvidenceBlock[];
};

type AudienceSchema = {
  name: string;
  sections: Array<{ key: string; label: string; instructions: string; maxChars: number }>;
};

const PROJECTION_MIN_WORDS = 800;
const PROJECTION_MAX_WORDS = 1400;

const AUDIENCE_SCHEMAS: Record<string, AudienceSchema> = {
  Executive: {
    name: 'Executive',
    sections: [
      { key: 'capability', label: 'Capability', instructions: 'Business capability in clear language; avoid technical jargon.', maxChars: 2600 },
      { key: 'impact', label: 'Impact', instructions: 'Business impact; user value; revenue/risk/cost effects.', maxChars: 2600 },
      { key: 'risks', label: 'Risks', instructions: 'Only risks supported by evidence; business framing.', maxChars: 2200 },
      { key: 'owner', label: 'Owner', instructions: 'Only explicit owner evidence; otherwise empty.', maxChars: 1400 },
    ],
  },
  Sales: {
    name: 'Sales',
    sections: [
      { key: 'problem', label: 'Problem', instructions: 'Customer problem solved; business terms, not technical.', maxChars: 2600 },
      { key: 'differentiators', label: 'Differentiators', instructions: 'Only evidence-backed differentiators.', maxChars: 2600 },
      { key: 'disqualifiers', label: 'Disqualifiers', instructions: 'When NOT to sell; limits/risks from evidence.', maxChars: 2200 },
      { key: 'integration', label: 'Integration', instructions: 'Setup/requirements expressed simply.', maxChars: 2200 },
    ],
  },
  Marketing: {
    name: 'Marketing',
    sections: [
      { key: 'positioning', label: 'Positioning', instructions: 'Market-facing positioning in plain language.', maxChars: 2600 },
      { key: 'claims_allowed', label: 'Claims allowed', instructions: 'Only claims supported by evidence.', maxChars: 2200 },
      { key: 'do_not_claim', label: 'Do-not-claim', instructions: 'Statements to avoid (evidence-backed).', maxChars: 2200 },
      { key: 'persona', label: 'Persona', instructions: 'Target persona/business buyer.', maxChars: 1800 },
    ],
  },
  Engineering: {
    name: 'Engineering',
    sections: [
      { key: 'summary', label: 'Summary', instructions: 'Technical overview with enough context.', maxChars: 2800 },
      { key: 'interfaces', label: 'Interfaces', instructions: 'APIs/routes/call sites.', maxChars: 2400 },
      { key: 'dependencies', label: 'Dependencies', instructions: 'Services, env vars, secrets, infra.', maxChars: 2200 },
      { key: 'failure_modes', label: 'Failure modes', instructions: 'Only explicitly evidenced failures or mitigations; otherwise empty.', maxChars: 2200 },
    ],
  },
  Support: {
    name: 'Support',
    sections: [
      { key: 'breakage', label: 'Common breakage', instructions: 'Only breakage explicitly present in evidence; otherwise empty.', maxChars: 2600 },
      { key: 'signals', label: 'Signals/alerts', instructions: 'Detection cues.', maxChars: 2200 },
      { key: 'runbook', label: 'Runbook', instructions: 'Concrete steps; no inventions.', maxChars: 2800 },
    ],
  },
  Customer: {
    name: 'Customer',
    sections: [
      { key: 'benefit', label: 'Benefit', instructions: 'Plain language benefit and outcome.', maxChars: 2800 },
      { key: 'how_to_use', label: 'How to use', instructions: 'Safe usage, step-like, no jargon.', maxChars: 2800 },
      { key: 'limits', label: 'Limits', instructions: 'Known constraints only.', maxChars: 2400 },
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

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.?\//, '');
}

function sanitizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/_:-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length >= 3);
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const TITLE_STOPWORDS = new Set([
  'src', 'lib', 'app', 'server', 'client', 'api', 'index', 'main', 'core', 'services',
  'utils', 'types', 'common', 'file', 'files', 'module', 'modules', 'source', 'sources',
  'frontend', 'backend', 'component', 'components', 'route', 'routes', 'issue', 'issues',
  'tsx', 'ts', 'jsx', 'js', 'py', 'java', 'go', 'rb', 'php', 'cs', 'cpp',
  'page', 'layout', 'readme', 'config', 'test', 'spec'
]);

function humanizeClusterLabel(label: string): string {
  const cleaned = label
    .replace(/\([^)]*\)/g, '')
    .replace(/[\/:_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Knowledge Unit';
  return toTitleCase(cleaned);
}

function extractTitleKeywords(items: Evidence[]): string[] {
  const freq = new Map<string, number>();
  for (const item of items) {
    const scope = item.scope_ref.replace(/\.[a-z0-9]+$/i, '').replace(/[\/:_-]+/g, ' ');
    const tokens = tokenize(`${item.title} ${scope}`);
    for (const token of tokens) {
      if (TITLE_STOPWORDS.has(token)) continue;
      freq.set(token, (freq.get(token) || 0) + 1);
    }
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([token]) => toTitleCase(token));
}

function buildHumanReadableAkuTitle(clusterLabel: string, items: Evidence[]): string {
  const base = humanizeClusterLabel(clusterLabel);
  const keywords = extractTitleKeywords(items);
  if (keywords.length === 0) return base;
  if (['Src', 'Lib', 'App', 'Server', 'Client', 'Api'].includes(base)) {
    return keywords.length === 1 ? keywords[0] : `${keywords[0]} & ${keywords[1]}`;
  }
  if (keywords.length === 1) return `${base}: ${keywords[0]}`;
  return `${base}: ${keywords.slice(0, 2).join(' & ')}`;
}

function resolveImportToFile(importPath: string, sourceFile: string, fileMap: Map<string, DependencyInfo>): string | null {
  if (fileMap.has(importPath)) return importPath;
  const sourceDir = sourceFile.split('/').slice(0, -1).join('/');
  const possiblePaths = [
    `${sourceDir}/${importPath}`,
    `${sourceDir}/${importPath}.js`,
    `${sourceDir}/${importPath}.ts`,
    `${sourceDir}/${importPath}.jsx`,
    `${sourceDir}/${importPath}.tsx`,
    `${sourceDir}/${importPath}.py`,
    `${sourceDir}/${importPath}.java`,
    `${sourceDir}/${importPath}.go`,
    `${sourceDir}/${importPath}.rs`,
    `${sourceDir}/${importPath}.rb`,
    `${sourceDir}/${importPath}.php`,
    `${sourceDir}/${importPath}.cs`,
    `${sourceDir}/${importPath}/index.js`,
    `${sourceDir}/${importPath}/index.ts`,
    `${sourceDir}/${importPath}/index.tsx`,
    `${sourceDir}/${importPath}/index.jsx`,
  ].map(normalizePath);

  for (const candidate of possiblePaths) {
    if (fileMap.has(candidate)) return candidate;
  }
  return null;
}

function fileStemTokens(filePath: string): Set<string> {
  const fileName = normalizePath(filePath).split('/').pop() || '';
  const stem = fileName.replace(/\.[a-z0-9]+$/i, '');
  return new Set(tokenize(stem));
}

function topLevelBucket(filePath: string): string {
  const parts = normalizePath(filePath).split('/').filter(Boolean);
  if (parts.length <= 1) return parts[0] || 'root';
  return `${parts[0]}/${parts[1]}`;
}

function parentDirectory(filePath: string): string {
  const parts = normalizePath(filePath).split('/').filter(Boolean);
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  if (inter === 0) return 0;
  return inter / (a.size + b.size - inter);
}

function mostCommonPrefix(files: string[]): string {
  if (files.length === 0) return 'root';
  const parts = files.map((f) => normalizePath(f).split('/').filter(Boolean));
  const maxDepth = Math.min(...parts.map((p) => p.length));
  const prefix: string[] = [];
  for (let i = 0; i < maxDepth; i++) {
    const seg = parts[0][i];
    if (!seg) break;
    if (parts.every((p) => p[i] === seg)) {
      prefix.push(seg);
      continue;
    }
    break;
  }
  if (prefix.length === 0) return parts[0][0] || 'root';
  return prefix.slice(0, 3).join('/');
}

function baseExternalPackage(importPath: string): string | null {
  if (!importPath || importPath.startsWith('.') || importPath.startsWith('/')) return null;
  const trimmed = importPath.replace(/^@/, '');
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  return parts.slice(0, Math.min(2, parts.length)).join('/');
}

function bestSemanticSegment(prefix: string): string {
  const ignored = new Set([
    'src', 'lib', 'app', 'server', 'client', 'api', 'routes', 'route', 'pages', 'components', 'internal', 'root'
  ]);
  const parts = normalizePath(prefix).split('/').filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (/^[0-9a-f-]{8,}$/i.test(part)) continue;
    if (ignored.has(part.toLowerCase())) continue;
    return part;
  }
  return parts.filter((p) => !/^[0-9a-f-]{8,}$/i.test(p)).pop() || 'subsystem';
}

function clusterLabelFromAnchor(prefix: string, tool: string | null): string {
  const leaf = bestSemanticSegment(prefix);
  if (tool) return `${leaf} (${tool})`;
  return leaf;
}

function buildGraphClusters(dependencies: DependencyInfo[], allKnownFiles: string[]): GraphCluster[] {
  const fileMap = new Map<string, DependencyInfo>(dependencies.map((d) => [normalizePath(d.filePath), { ...d, filePath: normalizePath(d.filePath) }]));
  const allFiles = new Set<string>(allKnownFiles.map(normalizePath));
  for (const f of fileMap.keys()) allFiles.add(f);
  const files = Array.from(allFiles);
  if (files.length === 0) return [];
  const adjacency = new Map<string, Map<string, number>>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const externalByFile = new Map<string, string[]>();
  const edgeWeights = new Map<string, { from: string; to: string; weight: number }>();

  const addWeight = (from: string, to: string, weight = 1) => {
    if (!adjacency.has(from)) adjacency.set(from, new Map());
    const row = adjacency.get(from)!;
    row.set(to, (row.get(to) || 0) + weight);
  };
  const addUndirectedEdgeWeight = (a: string, b: string, weight = 1) => {
    const from = a < b ? a : b;
    const to = a < b ? b : a;
    const key = `${from}->${to}`;
    const existing = edgeWeights.get(key);
    if (existing) {
      existing.weight += weight;
    } else {
      edgeWeights.set(key, { from, to, weight });
    }
  };

  for (const dep of fileMap.values()) {
    const source = dep.filePath;
    if (!adjacency.has(source)) adjacency.set(source, new Map());
    const external: string[] = [];
    for (const imp of dep.imports || []) {
      const resolved = resolveImportToFile(imp, source, fileMap);
      if (resolved && fileMap.has(resolved)) {
        addWeight(source, resolved, 1);
        addWeight(resolved, source, 1);
        addUndirectedEdgeWeight(source, resolved, 1);
        outDegree.set(source, (outDegree.get(source) || 0) + 1);
        inDegree.set(resolved, (inDegree.get(resolved) || 0) + 1);
      } else {
        const pkg = baseExternalPackage(imp);
        if (pkg) external.push(pkg);
      }
    }
    externalByFile.set(source, external);
  }

  // Add non-import structural/semantic edges so repos with sparse imports still cluster naturally.
  const byDirectory = new Map<string, string[]>();
  const byTopLevel = new Map<string, string[]>();
  for (const file of files) {
    const dir = parentDirectory(file);
    const top = topLevelBucket(file);
    if (!byDirectory.has(dir)) byDirectory.set(dir, []);
    byDirectory.get(dir)!.push(file);
    if (!byTopLevel.has(top)) byTopLevel.set(top, []);
    byTopLevel.get(top)!.push(file);
    if (!adjacency.has(file)) adjacency.set(file, new Map());
  }

  for (const group of byDirectory.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        addWeight(group[i], group[j], 0.4);
        addWeight(group[j], group[i], 0.4);
        addUndirectedEdgeWeight(group[i], group[j], 0.4);
      }
    }
  }

  for (const group of byTopLevel.values()) {
    if (group.length < 2) continue;
    const tokenCache = new Map<string, Set<string>>(group.map((f) => [f, fileStemTokens(f)]));
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const sim = jaccardSimilarity(tokenCache.get(a) || new Set(), tokenCache.get(b) || new Set());
        if (sim < 0.34) continue;
        const weight = 0.2 + sim * 0.6;
        addWeight(a, b, weight);
        addWeight(b, a, weight);
        addUndirectedEdgeWeight(a, b, weight);
      }
    }
  }

  const fileCount = files.length;
  const degreeValues = files.map((f) => (inDegree.get(f) || 0) + (outDegree.get(f) || 0)).sort((a, b) => a - b);
  const hubCutoff = degreeValues[Math.max(0, Math.floor(degreeValues.length * 0.9) - 1)] || 0;
  const hubByPattern = /(\/|^)(index|types?|constants?|utils?|helpers?|common)\.[a-z0-9]+$/i;
  const hubs = new Set(
    files.filter((f) => {
      const degree = (inDegree.get(f) || 0) + (outDegree.get(f) || 0);
      return hubByPattern.test(f) || degree >= Math.max(8, hubCutoff) || (fileCount > 40 && degree >= Math.ceil(fileCount * 0.15));
    })
  );

  const coreNodes = files.filter((f) => !hubs.has(f));
  const graph = new UndirectedGraph();
  for (const node of coreNodes) {
    if (!graph.hasNode(node)) graph.addNode(node);
  }
  for (const edge of edgeWeights.values()) {
    if (!graph.hasNode(edge.from) || !graph.hasNode(edge.to)) continue;
    graph.addEdgeWithKey(`${edge.from}->${edge.to}`, edge.from, edge.to, { weight: edge.weight });
  }

  const baseResolution = Math.min(3.5, Math.max(1.1, 1 + Math.log10(Math.max(10, graph.order)) * 0.9));
  const candidateResolutions = [baseResolution - 0.5, baseResolution - 0.2, baseResolution, baseResolution + 0.3, baseResolution + 0.6]
    .filter((r, idx, arr) => r > 0 && arr.findIndex((x) => Math.abs(x - r) < 0.001) === idx);

  const scoreCommunities = (communityMap: Map<string, string>): number => {
    let weightedSame = 0;
    let weightedTotal = 0;
    const clusterCounts = new Map<string, number>();
    for (const node of graph.nodes()) {
      const c = communityMap.get(node) || node;
      clusterCounts.set(c, (clusterCounts.get(c) || 0) + 1);
      let nodeTotal = 0;
      let nodeSame = 0;
      for (const nbr of graph.neighbors(node)) {
        const edge = graph.edge(node, nbr);
        if (edge === undefined) continue;
        const w = Number(graph.getEdgeAttribute(edge, 'weight') || 1);
        nodeTotal += w;
        const nbrC = communityMap.get(nbr) || nbr;
        if (nbrC === c) nodeSame += w;
      }
      if (nodeTotal > 0) {
        weightedSame += nodeSame;
        weightedTotal += nodeTotal;
      }
    }

    const cohesion = weightedTotal > 0 ? weightedSame / weightedTotal : 0;
    const totalNodes = graph.order || 1;
    const probs = Array.from(clusterCounts.values()).map((n) => n / totalNodes);
    const entropyRaw = probs.reduce((sum, p) => (p > 0 ? sum - p * Math.log(p) : sum), 0);
    const entropyNorm = clusterCounts.size > 1 ? entropyRaw / Math.log(clusterCounts.size) : 0;
    return cohesion * 0.82 + entropyNorm * 0.18;
  };

  let communitiesByNode = new Map<string, string>();
  let bestScore = -1;
  if (graph.order > 0) {
    for (const resolution of candidateResolutions) {
      try {
        const communities = louvain(graph, {
          getEdgeWeight: 'weight',
          resolution,
          rng: () => 0.42,
        }) as Record<string, string | number>;
        const map = new Map<string, string>(
          Object.entries(communities).map(([node, community]) => [node, String(community)])
        );
        const score = scoreCommunities(map);
        if (score > bestScore) {
          bestScore = score;
          communitiesByNode = map;
        }
      } catch (error) {
        console.warn('[AKU builder] Louvain clustering failed for resolution', resolution, error);
      }
    }
  }

  if (communitiesByNode.size === 0) {
    communitiesByNode = new Map<string, string>(coreNodes.map((n) => [n, n]));
  }

  const clustersByLabel = new Map<string, Set<string>>();
  for (const node of coreNodes) {
    const label = communitiesByNode.get(node) || node;
    if (!clustersByLabel.has(label)) clustersByLabel.set(label, new Set());
    clustersByLabel.get(label)!.add(node);
  }

  const clusterOfCoreNode = new Map<string, string>();
  for (const [label, nodes] of clustersByLabel.entries()) {
    for (const node of nodes) clusterOfCoreNode.set(node, label);
  }

  for (const hub of hubs) {
    const neighbors = adjacency.get(hub);
    if (!neighbors) continue;
    const scoreByCluster = new Map<string, number>();
    for (const [nbr, weight] of neighbors.entries()) {
      const cluster = clusterOfCoreNode.get(nbr);
      if (!cluster) continue;
      scoreByCluster.set(cluster, (scoreByCluster.get(cluster) || 0) + weight);
    }
    if (scoreByCluster.size === 0) continue;
    const bestCluster = Array.from(scoreByCluster.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })[0][0];
    clustersByLabel.get(bestCluster)?.add(hub);
  }

  const normalizedClusters = Array.from(clustersByLabel.values()).map((set) => Array.from(set).sort());

  const result: GraphCluster[] = [];
  for (const filesInCluster of normalizedClusters) {
    if (filesInCluster.length === 0) continue;
    const prefix = mostCommonPrefix(filesInCluster);

    const central = filesInCluster
      .slice()
      .sort((a, b) => {
        const da = (inDegree.get(a) || 0) + (outDegree.get(a) || 0);
        const db = (inDegree.get(b) || 0) + (outDegree.get(b) || 0);
        if (db !== da) return db - da;
        return a.localeCompare(b);
      })[0];

    const toolCounts = new Map<string, number>();
    for (const file of filesInCluster) {
      const externals = externalByFile.get(file) || [];
      for (const ext of externals) toolCounts.set(ext, (toolCounts.get(ext) || 0) + 1);
    }
    const dominantTool = Array.from(toolCounts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })[0]?.[0] || null;
    const key = sanitizeKey(`graph:${prefix}:${central.split('/').pop() || 'entry'}:${dominantTool || 'none'}`);
    result.push({
      key,
      label: clusterLabelFromAnchor(prefix, dominantTool),
      reason: 'graph',
      files: filesInCluster,
    });
  }

  return result;
}

async function extractGraphDependencies(
  supabase: SupabaseClient,
  userId: string,
  sourceIds: string[],
  providedTargets: SourceExtractionTarget[] = []
): Promise<DependencyInfo[]> {
  const providedBySourceId = new Map<string, SourceExtractionTarget>(
    providedTargets.map((t) => [t.sourceId, t])
  );
  const missingSourceIds = sourceIds.filter((id) => !providedBySourceId.has(id));
  const lookedUpTargets =
    missingSourceIds.length > 0
      ? await buildExtractionTargetsFromSourceIds(supabase, userId, missingSourceIds)
      : [];
  const targets = [
    ...providedTargets,
    ...lookedUpTargets.filter((t) => !providedBySourceId.has(t.sourceId)),
  ];
  if (targets.length === 0) {
    console.warn(`[AKU builder] No extraction targets resolved for sourceIds=${JSON.stringify(sourceIds)}`);
    return [];
  }
  const analyzer = new TreeSitterAnalyzer();
  const deps: DependencyInfo[] = [];
  for (const target of targets) {
    try {
      const { codeFiles } = await fetchSourceCodeArtifacts(supabase, userId, [target], 'sourceId');
      if (codeFiles.length === 0) continue;
      const sourceDeps = await analyzer.extractDependencyInfo(codeFiles);
      console.log(`[AKU builder] Source dependency extraction: source=${target.sourceId} files=${codeFiles.length} deps=${sourceDeps.length}`);
      deps.push(...sourceDeps);
    } catch (error) {
      console.warn('[AKU builder] Graph extraction skipped for source', target.sourceId, error);
    }
  }

  return deps;
}

function chooseIssueCluster(issue: Evidence, clusters: GraphCluster[]): string | null {
  if (clusters.length === 0) return null;
  const issueTokens = new Set(tokenize(`${issue.title} ${issue.body} ${issue.scope_ref}`));
  if (issueTokens.size === 0) return null;

  let best: { key: string; score: number } | null = null;
  for (const cluster of clusters) {
    const clusterTokenText = `${cluster.label} ${cluster.files.join(' ')}`;
    const clusterTokens = new Set(tokenize(clusterTokenText));
    let overlap = 0;
    for (const token of issueTokens) {
      if (clusterTokens.has(token)) overlap++;
    }
    const score = overlap + (issueTokens.has('api') && cluster.label.toLowerCase().includes('api') ? 1 : 0);
    if (!best || score > best.score) best = { key: cluster.key, score };
  }
  return best && best.score > 0 ? best.key : null;
}

function truncateSnippet(text: string, maxLen = 260): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length <= maxLen ? normalized : `${normalized.slice(0, maxLen)}...`;
}

function rankEvidence(items: Evidence[]): Evidence[] {
  return items
    .slice()
    .sort((a, b) => {
      const aScore = (a.kind === 'issue' ? 1 : 0) * 20 + Math.min((a.body || '').length, 500);
      const bScore = (b.kind === 'issue' ? 1 : 0) * 20 + Math.min((b.body || '').length, 500);
      if (bScore !== aScore) return bScore - aScore;
      return a.scope_ref.localeCompare(b.scope_ref);
    });
}

function buildCanonicalEvidence(clusterLabel: string, items: Evidence[]): CanonicalEvidence {
  const ranked = rankEvidence(items);
  const evidence = ranked.slice(0, 12).map((item) => ({
    evidence_id: item.id,
    source_id: item.source_id,
    kind: item.kind,
    scope_ref: item.scope_ref,
    title: item.title,
    snippet: truncateSnippet(item.body || item.title || item.scope_ref),
  }));

  const scope_refs = Array.from(new Set(items.map((i) => i.scope_ref))).sort();
  const code_evidence_count = items.filter((i) => i.kind === 'code').length;
  const issue_evidence_count = items.filter((i) => i.kind === 'issue').length;

  return {
    aku_title: clusterLabel,
    evidence_count: items.length,
    code_evidence_count,
    issue_evidence_count,
    scope_refs,
    evidence,
  };
}

function canonicalEvidenceToMarkdown(canonical: CanonicalEvidence): string {
  const lines: string[] = [];
  lines.push('## Observed Evidence');
  if (canonical.evidence.length === 0) {
    lines.push('- No direct evidence available.');
  } else {
    for (const item of canonical.evidence) {
      lines.push(`- [${item.kind}] ${item.scope_ref} (evidence ${item.evidence_id}): ${item.snippet}`);
    }
  }

  lines.push('');
  lines.push('## Observed Scope References');
  if (canonical.scope_refs.length === 0) {
    lines.push('- None');
  } else {
    for (const scope of canonical.scope_refs.slice(0, 30)) {
      lines.push(`- ${scope}`);
    }
  }

  lines.push('');
  lines.push('## Evidence Summary');
  lines.push(`- evidence_count: ${canonical.evidence_count}`);
  lines.push(`- code_evidence_count: ${canonical.code_evidence_count}`);
  lines.push(`- issue_evidence_count: ${canonical.issue_evidence_count}`);
  return lines.join('\n');
}

function canonicalEvidenceToText(canonical: CanonicalEvidence): string {
  return [
    canonical.aku_title,
    ...canonical.scope_refs,
    ...canonical.evidence.map((e) => `${e.scope_ref} ${e.title} ${e.snippet}`),
    `evidence_count ${canonical.evidence_count}`,
    `code_evidence_count ${canonical.code_evidence_count}`,
    `issue_evidence_count ${canonical.issue_evidence_count}`,
  ].join(' ');
}

const FORBIDDEN_IF_NOT_PRESENT = ['sla', 'gdpr', 'hipaa', 'pci', 'encryption', 'privacy', 'compliance'];

const CLAIM_VERBS = ['supports', 'enables', 'ensures', 'provides', 'guarantees', 'improves', 'reduces', 'prevents'];
const PROCEDURAL_MARKERS = ['go to', 'click', 'configure', 'select', 'install', 'open', 'run'];
const TOKEN_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'about', 'only', 'when', 'where', 'your', 'their',
  'have', 'has', 'are', 'was', 'were', 'will', 'would', 'can', 'could', 'should', 'also', 'more', 'than',
  'section', 'customer', 'business', 'system', 'service', 'feature', 'team'
]);

function hasProceduralEvidence(canonical: CanonicalEvidence): boolean {
  const text = canonicalEvidenceToText(canonical).toLowerCase();
  return /(^|\W)(step|steps|runbook|retry|configure|install|setup|command)(\W|$)/.test(text);
}

function unknownClaimTerms(sentence: string, canonicalTokens: Set<string>): string[] {
  const terms = tokenize(sentence).filter((t) => !TOKEN_STOPWORDS.has(t) && !canonicalTokens.has(t));
  return Array.from(new Set(terms));
}

function validateProjection(text: string, canonical: CanonicalEvidence, schema: AudienceSchema) {
  const lowerText = text.toLowerCase();
  const lowerCanon = canonicalEvidenceToText(canonical).toLowerCase();
  const failures: string[] = [];

  FORBIDDEN_IF_NOT_PRESENT.forEach((term) => {
    if (lowerText.includes(term) && !lowerCanon.includes(term)) {
      failures.push(`Forbidden term without evidence: ${term}`);
    }
  });

  const proceduralPattern = /(^|\n)\s*(\d+[\).]|[-*]\s+)([^\n]+)/gim;
  const hasProceduralOutput = proceduralPattern.test(text) || PROCEDURAL_MARKERS.some((m) => lowerText.includes(m));
  if (hasProceduralOutput && !hasProceduralEvidence(canonical)) {
    failures.push('Procedural instructions provided without procedural evidence.');
  }

  const canonicalTokens = new Set(tokenize(lowerCanon));
  const sentences = text.split(/[\n.!?]+/).map((s) => s.trim()).filter(Boolean);
  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    const hasClaimVerb = CLAIM_VERBS.some((verb) => lowerSentence.includes(verb));
    if (!hasClaimVerb) continue;
    const unknownTerms = unknownClaimTerms(lowerSentence, canonicalTokens);
    if (unknownTerms.length >= 3) {
      failures.push(`Claim may exceed evidence: "${sentence.slice(0, 100)}"`);
    }
  }

  // Keep this as a soft guard for shape drift.
  for (const section of schema.sections) {
    const sectionToken = section.label.toLowerCase().split(' ')[0];
    if (!lowerText.includes(sectionToken)) break;
  }

  return failures;
}

function parseProjectionResponse(respText: string): string {
  const cleaned = (respText || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

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
  return projection;
}

function audienceGuidance(audience: string): string[] {
  const map: Record<string, string[]> = {
    Executive: [
      'Use executive language: capabilities, strategic impact, risk exposure, operating leverage, and decision trade-offs.',
      'Translate technical facts into business outcomes (cost, speed, reliability, risk) without inventing ROI numbers.',
      'Include concrete scope references for major capabilities and constraints.',
    ],
    Sales: [
      'Use sales language: customer problem, fit, integration readiness, blockers, and qualification signals.',
      'State concrete limits and prerequisites clearly so deal teams do not overpromise.',
    ],
    Marketing: [
      'Use marketing language: positioning, narrative themes, and claim boundaries grounded in evidence.',
      'Surface concrete language from evidence that can be safely reused in positioning.',
    ],
    Engineering: [
      'Use technical engineering language: interfaces, call paths, dependency topology, operational controls, and failure evidence.',
      'Include concrete file/issue scope references where possible to aid implementation.',
    ],
    Support: [
      'Use support/runbook language: symptom, trigger, observable signal, impact, and mitigation context.',
      'Avoid speculative runbook steps; include only observed troubleshooting facts.',
    ],
    Customer: [
      'Use customer-success language: expected outcome, onboarding prerequisites, usage boundaries, and known limitations.',
      'Call out prerequisites and known boundaries without technical overreach.',
    ],
  };
  return map[audience] || map.Engineering;
}

function audienceToneInstruction(audience: string): string {
  const map: Record<string, string> = {
    Executive:
      'Tone: boardroom/business brief. Focus on capability maturity, strategic value, and business risk posture. Minimize code jargon.',
    Sales:
      'Tone: deal support brief. Focus on customer fit, integration friction, proof points, and disqualifiers. Avoid speculative claims.',
    Marketing:
      'Tone: positioning brief. Focus on message-safe claims, narrative clarity, and explicit do-not-claim boundaries.',
    Engineering:
      'Tone: technical design/operations brief. Use precise technical vocabulary and concrete implementation references.',
    Support:
      'Tone: incident/support brief. Focus on user-visible failure patterns, diagnostics, and remediation context from evidence.',
    Customer:
      'Tone: customer-facing guidance. Plain language, clear outcomes, and concrete usage limits; avoid internal-only jargon.',
  };
  return map[audience] || map.Engineering;
}

async function generateProjection(
  llm: LLMGateway,
  audience: string,
  schema: AudienceSchema,
  title: string,
  canonical: CanonicalEvidence
) {
  const system = [
    'You are Canon AKU projection generator.',
    'Use ONLY provided evidence; forbid fabrication.',
    'Output compact JSON ONLY, no code fences, no markdown.',
    'Shape: {"sections":[{"label":"<label>","text":"<human text>"}]}',
    'Labels must match provided schema labels exactly.',
    'If a section is unsupported by evidence, use empty string.',
    'Do not infer or guess any ownership, guarantees, SLAs, compliance, setup steps, or failure modes.',
    'Avoid generic SaaS benefit language unless evidence includes concrete outcomes.',
    'Do not inflate glue code, wrappers, or adapters into customer-facing capabilities.',
    'Prefer direct evidence terms from scope_ref, title, and snippet values.',
    `Target roughly ${PROJECTION_MIN_WORDS}-${PROJECTION_MAX_WORDS} words total, but prioritize evidence fidelity over length.`,
    'Maximize useful context density: include all materially relevant facts supported by evidence.',
    'Do not omit key dependencies, constraints, limitations, or major integration touchpoints when present in evidence.',
    'Be concise in wording, not in coverage: compress repetition but preserve factual breadth.',
    `Audience style requirement: ${audienceToneInstruction(audience)}`,
    'Speak the audience language while staying evidence-grounded: same facts, different framing.',
    'For non-technical audiences, translate technical details into business/customer implications without changing factual meaning.',
    'For technical audiences, preserve technical precision and include concrete implementation details from evidence.',
    'Rank evidence by relevance and include high-value facts first, then remaining relevant facts.',
  ].join(' ');

  const userContent = {
    audience,
    audience_name: schema.name,
    aku_title: title,
    schema: schema.sections.map((s) => ({ label: s.label, instructions: s.instructions, maxChars: s.maxChars })),
    evidence: canonical.evidence,
    scope_refs: canonical.scope_refs,
    evidence_summary: {
      evidence_count: canonical.evidence_count,
      code_evidence_count: canonical.code_evidence_count,
      issue_evidence_count: canonical.issue_evidence_count,
    },
    audience_guidance: audienceGuidance(audience),
    completeness_checklist: [
      'Primary capabilities grounded in evidence',
      'Interfaces and dependency touchpoints',
      'Operational constraints, limits, and risks explicitly evidenced',
      'Notable unknowns or unsupported areas left blank instead of guessed'
    ],
  };

  try {
    const baseMessages: Message[] = [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(userContent) },
    ];
    const respText = await llm.call(baseMessages, 'openai/gpt-4o-mini', 0.2);
    const projection = parseProjectionResponse(respText);
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

export type BuildAkusOptions = {
  perSource?: boolean;
  extractionTargets?: SourceExtractionTarget[];
  shouldAbort?: () => Promise<boolean>;
};

export async function buildAkusForSources(
  supabase: SupabaseClient,
  userId: string,
  sourceIds: string[],
  audiences: string[] = [],
  options: BuildAkusOptions = {}
) {
  const shouldAbort = options.shouldAbort || (async () => false);
  if (await shouldAbort()) return { akus: [], projections: [] };
  if (sourceIds.length === 0) return { akus: [], projections: [] };
  const perSource = options.perSource === true && sourceIds.length >= 1;

  const evidence: Evidence[] = [];

  const { data: summaries } = await supabase
    .from('repo_file_summaries')
    .select('id, source_id, file_path, summary_text')
    .in('source_id', sourceIds);
  if (await shouldAbort()) return { akus: [], projections: [] };

  const knownFiles = (summaries || []).map((s) => normalizePath(`${s.source_id}/${s.file_path}`));
  const graphDependencies = await extractGraphDependencies(
    supabase,
    userId,
    sourceIds,
    options.extractionTargets || []
  );
  const graphClusters = buildGraphClusters(graphDependencies, knownFiles);
  console.log(
    `[AKU builder] Graph clustering: ${graphDependencies.length} dependency nodes, ${knownFiles.length} known files -> ${graphClusters.length} clusters`
  );
  const clusterByFile = new Map<string, GraphCluster>();
  for (const cluster of graphClusters) {
    for (const file of cluster.files) clusterByFile.set(normalizePath(file), cluster);
  }

  summaries?.forEach((s) => {
    const normalized = normalizePath(`${s.source_id}/${s.file_path}`);
    evidence.push({
      id: s.id,
      source_id: s.source_id,
      kind: 'code',
      title: s.file_path,
      body: s.summary_text || '',
      scope_ref: s.file_path,
      cluster_ref: normalized,
    });
  });

  // console.log(`AKU builder: collected ${evidence.length} code summaries`);

  const { data: issues } = await supabase
    .from('issue_index')
    .select('id, source_id, issue_key, title, description')
    .in('source_id', sourceIds);
  if (await shouldAbort()) return { akus: [], projections: [] };

  issues?.forEach((i) => {
    evidence.push({
      id: i.id,
      source_id: i.source_id,
      kind: 'issue',
      title: i.title || i.issue_key,
      body: i.description || i.title || i.issue_key || '',
      scope_ref: i.issue_key || i.title || 'issue',
      cluster_ref: i.issue_key || i.title || 'issue',
    });
  });

  // console.log(`AKU builder: total evidence after adding issues = ${evidence.length}`);

  const clusters = new Map<string, { items: Evidence[]; label: string; reason: string }>();
  for (const graphCluster of graphClusters) {
    clusters.set(graphCluster.key, { items: [], label: graphCluster.label, reason: graphCluster.reason });
  }

  let unmatchedCodeEvidence = 0;
  let unmatchedIssueEvidence = 0;
  evidence.forEach((e) => {
    if (e.kind === 'code') {
      const graphCluster = clusterByFile.get(normalizePath(e.cluster_ref));
      if (graphCluster) {
        clusters.get(graphCluster.key)?.items.push(e);
        return;
      }
      unmatchedCodeEvidence += 1;
      return;
    }

    if (e.kind === 'issue') {
      const bestGraphClusterKey = chooseIssueCluster(e, graphClusters);
      if (bestGraphClusterKey && clusters.has(bestGraphClusterKey)) {
        clusters.get(bestGraphClusterKey)!.items.push(e);
        return;
      }
      unmatchedIssueEvidence += 1;
      return;
    }
  });

  const clusterCount = clusters.size;
  const codeCount = evidence.filter((e) => e.kind === 'code').length;
  const issueCount = evidence.filter((e) => e.kind === 'issue').length;
  console.log(
    `[AKU builder] Starting: ${evidence.length} evidence (${codeCount} file summaries, ${issueCount} issues), ${clusterCount} clusters, unmatched: ${unmatchedCodeEvidence} code / ${unmatchedIssueEvidence} issue, audiences: [${audiences.join(', ')}]`
  );

  const hashesForRun: string[] = [];
  for (const [, cluster] of clusters.entries()) {
    const items = cluster.items;
    if (items.length === 0) continue;
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
    if (await shouldAbort()) {
      console.log('[AKU builder] Aborting AKU generation due to source cancellation');
      return { akus: [], projections: [] };
    }
    const items = cluster.items;
    if (items.length === 0) continue;
    const hasIssue = items.some((e) => e.kind === 'issue');

    const title = buildHumanReadableAkuTitle(cluster.label, items);
    console.log(`[AKU builder] AKU: "${title}" (${items.length} evidence items: ${items.map((i) => i.scope_ref).slice(0, 3).join(', ')}${items.length > 3 ? '...' : ''})`);
    const canonicalEvidence = buildCanonicalEvidence(title, items);
    const canonical = canonicalEvidenceToMarkdown(canonicalEvidence);

    const source_ids = Array.from(new Set(items.map((i) => i.source_id)));
    const scope_refs = Array.from(new Set(items.map((i) => i.scope_ref)));
    const hash = akuHashFromEvidenceIds(items.map((i) => i.id));
    const akuId = perSource
      ? deterministicAkuIdWithSource(userId, clusterKey, sourceIds[0])
      : (idByHash.get(hash) ?? deterministicAkuId(userId, clusterKey));

    const factualText = canonicalEvidenceToText(canonicalEvidence);
    const crit = scoreText(title + factualText, criticalKeywords);
    const promise = scoreText(title + factualText, promiseKeywords);
    const blast = scoreText(title + factualText, blastKeywords);
    const audSurface = audienceSurface(title, factualText);
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
      if (await shouldAbort()) {
        console.log('[AKU builder] Aborting projection generation due to source cancellation');
        return { akus: [], projections: [] };
      }
      const schema = AUDIENCE_SCHEMAS[aud] || AUDIENCE_SCHEMAS.Engineering;
      console.log(`[LLM] Generating audience projection: audience=${aud}, AKU="${title}"`);
      const { projection, status } = await generateProjection(llm, aud, schema, title, canonicalEvidence);
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
