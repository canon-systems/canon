import { createHash } from 'crypto';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeRepository } from './analyzeRepository';
import { parseRepoUrl } from '../github/github';
import { TreeSitterAnalyzer } from './treeSitterAnalyzer';
import { createLogger } from '../logging';

export type FeatureMapInputFile = {
  path: string;
  content: string;
  sourceId: string;
};

export type FeatureBucket = {
  name: string;
  route: string;
  entry: string;
  files: string[];
};

export type FeatureMapResult = {
  runHash: string;
  features: FeatureBucket[];
  shared: string[];
};

type Door = { route: string; entry: string };

type SourceRow = { id: string; provider?: string | null; scope?: Record<string, unknown> | null };

const SHARED_KEYWORDS = ['auth', 'logger', 'logging', 'db', 'database', 'config', 'utils', 'shared', 'types', 'hooks', 'pkg/common'];
const log = createLogger('feature_map', {
  label: 'Feature Map',
  eventLabels: {
    build_start: 'Feature Map Build Started',
    build_complete: 'Feature Map Build Completed',
    build_empty: 'Feature Map Empty',
  },
});

const JS_ENTRY_PATTERNS = [
  /src\/app\/(.*)\/page\.(tsx|ts|jsx|js)$/,
  /src\/app\/page\.(tsx|ts|jsx|js)$/,
  /src\/app\/api\/(.*)\/route\.(tsx|ts|jsx|js)$/,
];

function normalizeRouteFromAppPath(fullPath: string): string | null {
  const appIndex = fullPath.indexOf('src/app/');
  if (appIndex === -1) return null;
  const sub = fullPath.slice(appIndex + 'src/app/'.length);
  const parts = sub.split('/');
  if (parts.length === 0) return null;
  const isApi = parts[0] === 'api';
  const dropFile = parts.slice(0, -1); // remove page/route file name
  const segments: string[] = [];
  for (const seg of dropFile) {
    if (!seg) continue;
    if (seg.startsWith('(') && seg.endsWith(')')) continue; // group
    if (seg.startsWith('[')) {
      const clean = seg.replace(/^\[+\.\.\.\/?|\]+$/g, '').replace(/^\[|\]$/g, '');
      segments.push(clean ? `:${clean}` : '*');
      continue;
    }
    segments.push(seg);
  }
  const route = '/' + segments.filter(Boolean).join('/');
  return isApi ? route : route === '/' ? '/' : route;
}

function discoverDoors(files: FeatureMapInputFile[]): Door[] {
  const doors: Door[] = [];
  for (const f of files) {
    const p = f.path;
    const norm = p.replace(/\\/g, '/');
    if (JS_ENTRY_PATTERNS.some((re) => re.test(norm))) {
      const route = normalizeRouteFromAppPath(norm);
      if (route) doors.push({ route, entry: norm });
      continue;
    }

    // Python routes (FastAPI/Flask/Django-style)
    if (norm.endsWith('.py')) {
      const decoratorRoutes = Array.from(
        f.content.matchAll(/@(app|router)\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/g)
      );
      for (const m of decoratorRoutes) {
        const route = m[3] || '/';
        doors.push({ route, entry: norm });
      }
      const pathCalls = Array.from(f.content.matchAll(/path\(['"]([^'"]+)['"]/g));
      for (const m of pathCalls) doors.push({ route: m[1], entry: norm });
      continue;
    }

    // Go routes (net/http, chi)
    if (norm.endsWith('.go')) {
      const goRoutes = Array.from(f.content.matchAll(/Handle(?:Func)?\(\s*"([^"]+)"/g));
      for (const m of goRoutes) doors.push({ route: m[1], entry: norm });
      const chiRoutes = Array.from(f.content.matchAll(/Route\(\s*"([^"]+)"/g));
      for (const m of chiRoutes) doors.push({ route: m[1], entry: norm });
    }
  }
  // de-dup by (route, entry)
  const seen = new Set<string>();
  return doors.filter((d) => {
    const key = `${d.route}|${d.entry}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveImport(spec: string, fromPath: string, allFiles: Set<string>): string | null {
  // Only resolve relative or local workspace paths; skip packages
  const isRelative = spec.startsWith('.') || spec.startsWith('/');
  if (!isRelative) return null;
  const fromDir = path.posix.dirname(fromPath);
  const candidateBase = spec.startsWith('/') ? spec.replace(/^\/+/, '') : path.posix.normalize(path.posix.join(fromDir, spec));
  const candidates = [candidateBase, `${candidateBase}.ts`, `${candidateBase}.tsx`, `${candidateBase}.js`, `${candidateBase}.jsx`, `${candidateBase}.py`, `${candidateBase}.go`];
  for (const c of candidates) {
    if (allFiles.has(c)) return c;
  }
  return null;
}

async function buildBuckets(doors: Door[], files: FeatureMapInputFile[], sharedThresholdFraction = 0.4): Promise<{ features: FeatureBucket[]; shared: string[] }> {
  const fileMap = new Map<string, FeatureMapInputFile>();
  files.forEach((f) => fileMap.set(f.path, f));
  const allPaths = new Set(fileMap.keys());

  const analyzer = new TreeSitterAnalyzer();
  const deps = await analyzer
    .extractDependencyInfo(files.map((f) => ({ path: f.path, content: f.content })))
    .catch(() => [] as Array<{ filePath: string; imports: string[] }>);

  const importByPath = new Map<string, string[]>();
  for (const d of deps || []) {
    importByPath.set(d.filePath, d.imports || []);
  }

  const buckets: Map<string, Set<string>> = new Map();

  for (const door of doors) {
    const visited = new Set<string>();
    const queue: string[] = [];
    if (allPaths.has(door.entry)) queue.push(door.entry);
    while (queue.length > 0 && visited.size < 2000) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const file = fileMap.get(current);
      if (!file) continue;
      const imports = importByPath.get(current) || [];
      for (const spec of imports) {
        const resolved = resolveImport(spec, current, allPaths);
        if (resolved && !visited.has(resolved)) {
          queue.push(resolved);
        }
      }
    }
    buckets.set(door.route, visited);
  }

  // shared detection
  const usageCount = new Map<string, number>();
  for (const set of buckets.values()) {
    for (const p of set) usageCount.set(p, (usageCount.get(p) || 0) + 1);
  }
  const doorCount = buckets.size || 1;
  const shared: string[] = [];
  const sharedThreshold = Math.max(3, Math.ceil(doorCount * sharedThresholdFraction));
  for (const [p, count] of usageCount.entries()) {
    const lower = p.toLowerCase();
    const keywordHit = SHARED_KEYWORDS.some((k) => lower.includes(k));
    if (count >= sharedThreshold || keywordHit) {
      shared.push(p);
      for (const set of buckets.values()) set.delete(p);
    }
  }

  const features: FeatureBucket[] = Array.from(buckets.entries()).map(([route, set]) => {
    const filesList = Array.from(set).sort();
    const name = route === '/' ? 'Home' : route.replace(/^\//, '').split('/')[0] || 'Feature';
    return { name, route, entry: doors.find((d) => d.route === route)?.entry || route, files: filesList };
  }).filter((f) => f.files.length > 0);

  return { features, shared: shared.sort() };
}

function hashString(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function buildFeatureMapAndPersist(params: {
  supabase: SupabaseClient;
  userId: string;
  sources: SourceRow[];
}): Promise<FeatureMapResult> {
  const { supabase, userId, sources } = params;
  const allFiles: FeatureMapInputFile[] = [];

  log.info('build_start', { userId, sourceCount: sources.length });

  for (const src of sources) {
    const provider = String(src.provider || '').toLowerCase();
    if (provider !== 'github') continue;
    const scope = (src.scope || {}) as { repo?: string; branch?: string };
    const repoUrlRaw = typeof scope.repo === 'string' ? scope.repo : null;
    const repoUrl = repoUrlRaw
      ? repoUrlRaw.startsWith('http') || repoUrlRaw.startsWith('git@')
        ? repoUrlRaw
        : repoUrlRaw.includes('/') && !repoUrlRaw.includes(' ')
          ? `https://github.com/${repoUrlRaw.replace(/^\/+|\/+$/g, '')}`
          : repoUrlRaw
      : null;
    if (!repoUrl) continue;
    const branch = typeof scope.branch === 'string' ? scope.branch : undefined;
    const parsed = parseRepoUrl(repoUrl);
    const normalizedRepoUrl = parsed ? `https://github.com/${parsed.owner}/${parsed.repo}` : repoUrl;
    const analysis = await analyzeRepository({
      supabase,
      userId,
      repoUrl: normalizedRepoUrl,
      branch,
      useZipFetch: true,
    });
    for (const file of analysis.rawFiles || []) {
      const fullPath = `${src.id}/${file.path.replace(/\\/g, '/')}`;
      allFiles.push({ path: fullPath, content: file.content, sourceId: src.id });
    }
  }

  const doors = discoverDoors(allFiles);
  if (doors.length === 0) {
    log.info('build_empty', { userId, reason: 'no_doors', fileCount: allFiles.length });
    return { runHash: '', features: [], shared: [] };
  }

  const { features, shared } = await buildBuckets(doors, allFiles);

  const routesKey = features.map((f) => f.route).sort().join('|');
  const runHash = hashString(`${userId}:${Date.now()}:${routesKey}`).slice(0, 32);

  const rows = [...features.map((f) => ({
    title: f.name,
    body: JSON.stringify({ route: f.route, entry: f.entry, files: f.files, shared: false }),
    type: 'feature_map',
    user_id: userId,
    source_ids: sources.map((s) => s.id),
    scope_refs: [f.route, f.entry],
    status: 'draft',
    scores: { total: f.files.length },
    metadata: { run_hash: runHash },
    hash: hashString(`${runHash}:${f.route}:${f.entry}`).slice(0, 32),
    updated_at: new Date().toISOString(),
  })), {
    title: 'Shared plumbing',
    body: JSON.stringify({ route: 'shared', entry: 'shared', files: shared, shared: true }),
    type: 'feature_map',
    user_id: userId,
    source_ids: sources.map((s) => s.id),
    scope_refs: ['shared'],
    status: 'draft',
    scores: { total: shared.length },
    metadata: { run_hash: runHash },
    hash: hashString(`${runHash}:shared`).slice(0, 32),
    updated_at: new Date().toISOString(),
  }];

  if (rows.length > 0) {
    await supabase.from('akus').upsert(rows, { onConflict: 'hash' });
  }

  log.info('build_complete', {
    userId,
    runHash,
    doors: doors.length,
    features: features.length,
    shared: shared.length,
    sources: sources.map((s) => s.id),
  });

  return { runHash, features, shared };
}
