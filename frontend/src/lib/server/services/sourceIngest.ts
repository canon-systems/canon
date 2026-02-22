import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/server/logging';

const ingestLog = createLogger('source.ingest', {
  label: 'Source Ingest',
  eventLabels: {
    github_start: 'GitHub Ingest Started',
    github_complete: 'GitHub Ingest Completed',
    github_failed: 'GitHub Ingest Failed',
    issue_start: 'Issue Ingest Started',
    issue_complete: 'Issue Ingest Completed',
    issue_failed: 'Issue Ingest Failed',
  },
});

function slugifyLabel(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'feature'
  );
}

const JS_ENTRY_PATTERNS = [
  /src\/app\/(.*)\/page\.(tsx|ts|jsx|js)$/,
  /src\/app\/page\.(tsx|ts|jsx|js)$/,
  /src\/app\/api\/(.*)\/route\.(tsx|ts|jsx|js)$/,
];

const SVELTE_ENTRY_PATTERNS = [
  /src\/routes\/(.*)\+page\.(svelte|ts|js)$/,
  /src\/routes\/(.*)\+page\.(server|client)\.(ts|js)$/,
  /src\/routes\/(.*)\+server\.(ts|js)$/,
];

const NUXT_ENTRY_PATTERN = /(?:^|\/)pages\/(.*)\.vue$/;

function normalizeRouteFromAppPath(fullPath: string): string | null {
  const appIndex = fullPath.indexOf('src/app/');
  if (appIndex === -1) return null;
  const sub = fullPath.slice(appIndex + 'src/app/'.length);
  const parts = sub.split('/');
  if (parts.length === 0) return null;
  const isApi = parts[0] === 'api';
  const dropFile = parts.slice(0, -1);
  const segments: string[] = [];
  for (const seg of dropFile) {
    if (!seg) continue;
    if (seg.startsWith('(') && seg.endsWith(')')) continue;
    if (seg.startsWith('[')) {
      const clean = seg.replace(/^\[+\.\.\.\/?|\]+$/g, '').replace(/^\[|\]$/g, '');
      segments.push(clean ? `:${clean}` : '*');
      continue;
    }
    segments.push(seg);
  }
  const route = '/' + segments.filter(Boolean).join('/');
  return isApi ? route || '/' : route === '' ? '/' : route;
}

function normalizeSvelteRoute(fullPath: string): string | null {
  const match = fullPath.match(/src\/routes\/(.*)\+[^/]+$/);
  if (!match) return null;
  const raw = match[1] || '';
  const cleaned = raw
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (seg.startsWith('[') && seg.endsWith(']')) {
        const inner = seg.slice(1, -1).replace(/^\.\.\./, '');
        return inner ? `:${inner}` : '*';
      }
      return seg;
    });
  return '/' + cleaned.join('/');
}

function normalizeNuxtRoute(fullPath: string): string | null {
  const match = fullPath.match(/(?:^|\/)pages\/(.*)\.vue$/);
  if (!match) return null;
  const raw = match[1] || '';
  const cleaned = raw
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (seg.startsWith('[') && seg.endsWith(']')) return `:${seg.slice(1, -1)}`;
      if (seg === 'index') return '';
      return seg;
    })
    .filter(Boolean);
  const route = '/' + cleaned.join('/');
  return route === '' ? '/' : route;
}

export function featureKeyFromPath(p: string): string | null {
  const norm = p.replace(/\\/g, '/').replace(/^\/+/, '');
  const jobMatch = norm.match(/src\/(?:inngest\/functions|jobs|workers|queues)\/([^.]+)\.(t|j)sx?$/);
  if (jobMatch) {
    const jobPath = jobMatch[1];
    const parts = jobPath.split('/');
    const jobName = parts[parts.length - 1];
    return slugifyLabel(`background-${jobName}`);
  }

  const featureMatch = norm.match(/src\/(features|modules|services|domains|packages|apps)\/([^/.]+)/);
  if (featureMatch) {
    return slugifyLabel(featureMatch[2]);
  }

  if (JS_ENTRY_PATTERNS.some((re) => re.test(norm))) {
    const route = normalizeRouteFromAppPath(norm);
    if (!route) return null;
    if (route === '/') return 'home';
    const seg = route.split('/').filter(Boolean)[0];
    if (seg) return slugifyLabel(seg);
  }

  if (SVELTE_ENTRY_PATTERNS.some((re) => re.test(norm))) {
    const route = normalizeSvelteRoute(norm);
    if (!route) return null;
    if (route === '/') return 'home';
    const seg = route.split('/').filter(Boolean)[0];
    if (seg) return slugifyLabel(seg);
  }

  if (NUXT_ENTRY_PATTERN.test(norm)) {
    const route = normalizeNuxtRoute(norm);
    if (!route) return null;
    if (route === '/') return 'home';
    const seg = route.split('/').filter(Boolean)[0];
    if (seg) return slugifyLabel(seg);
  }

  if (norm.includes('/api/')) {
    const afterApi = norm.split('/api/')[1];
    const seg = afterApi?.split('/').filter(Boolean)[0];
    if (seg) return slugifyLabel(`api-${seg}`);
  }

  return null;
}

export type SourceSetupStage =
  | 'queueing'
  | 'fetching'
  | 'indexing'
  | 'summarizing'
  | 'ready'
  | 'failed';

export type WorkspaceSource = {
  id: string;
  user_id: string;
  name?: string | null;
  provider: string;
  scope: Record<string, unknown>;
  source_identifier?: string | null;
  domain?: string | null;
  connection_id?: string | null;
  status_payload?: Record<string, unknown> | null;
  last_error?: string | null;
};

async function updateStatus(
  supabase: SupabaseClient,
  sourceId: string,
  status: SourceSetupStage | string,
  progress: number | null = null,
  extras: Record<string, unknown> = {}
) {
  const payload = {
    status,
    ...(progress !== null ? { progress_pct: progress } : {}),
    ...extras,
  };

  const { data: existing, error: readError } = await supabase
    .from('workspace_sources')
    .select('status_payload')
    .eq('id', sourceId)
    .maybeSingle();
  if (readError) {
    throw new Error(`Failed to read source status for ${sourceId}: ${readError.message}`);
  }

  const existingPayload =
    existing?.status_payload && typeof existing.status_payload === 'object'
      ? (existing.status_payload as Record<string, unknown>)
      : {};

  const mergedPayload = {
    ...existingPayload,
    ...payload,
  };

  const { error: writeError } = await supabase
    .from('workspace_sources')
    .update({
      status_payload: mergedPayload,
      last_error: ('error' in mergedPayload
        ? (mergedPayload as Record<string, unknown>).error
        : null) as string | null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceId);
  if (writeError) {
    throw new Error(`Failed to update source status for ${sourceId}: ${writeError.message}`);
  }
}

async function updateStage(
  supabase: SupabaseClient,
  sourceId: string,
  stage: SourceSetupStage,
  progress: number,
  stepLabel: string,
  extras: Record<string, unknown> = {}
) {
  await updateStatus(supabase, sourceId, stage, progress, { step_label: stepLabel, ...extras });
}

export async function ingestGitHubSource(
  supabase: SupabaseClient,
  source: WorkspaceSource
) {
  const repo = typeof source.scope?.repo === 'string' ? source.scope.repo : '';
  const branch = typeof source.scope?.branch === 'string' ? source.scope.branch : 'main';
  if (!repo) {
    await updateStatus(supabase, source.id, 'failed', 0, { error: 'Missing repo in scope' });
    throw new Error('Missing repo in scope');
  }

  try {
    ingestLog.info('github_start', { sourceId: source.id, repo, branch });
    await updateStage(supabase, source.id, 'ready', 100, 'Setup complete');
    ingestLog.info('github_complete', { sourceId: source.id, repo, branch });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ingestLog.error('github_failed', {
      sourceId: source.id,
      repo,
      branch,
      error: message,
    });
    await updateStatus(supabase, source.id, 'failed', 0, {
      error: message,
    });
    throw err instanceof Error ? err : new Error(message);
  }
}

export async function ingestIssueSource(
  supabase: SupabaseClient,
  source: WorkspaceSource
) {
  const provider = source.provider.toLowerCase();
  if (!['jira', 'linear', 'asana'].includes(provider)) {
    return;
  }

  try {
    ingestLog.info('issue_start', {
      sourceId: source.id,
      provider,
      projectKey: typeof source.scope?.project === 'string' ? source.scope.project : null,
    });
    await updateStage(supabase, source.id, 'ready', 100, 'Setup complete');
    ingestLog.info('issue_complete', { sourceId: source.id, provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ingestLog.error('issue_failed', {
      sourceId: source.id,
      provider,
      error: message,
    });
    await updateStatus(supabase, source.id, 'failed', 0, {
      error: message,
    });
    throw err instanceof Error ? err : new Error(message);
  }
}

export async function ingestSource(supabase: SupabaseClient, source: WorkspaceSource) {
  const provider = source.provider.toLowerCase();
  if (provider === 'github') {
    await ingestGitHubSource(supabase, source);
  } else if (['jira', 'linear', 'asana'].includes(provider)) {
    await ingestIssueSource(supabase, source);
  } else {
    await updateStage(supabase, source.id, 'ready', 100, 'Setup complete');
  }
}
