import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeRepository } from './analyzeRepository';
import { FileSummaryManager } from './fileSummaryManager';
import { parseRepoUrl } from '../github/github';
import { getProviderAccessToken } from '../oauth/tokenStore';
import { buildAkusForSources } from './akuBuilder';
import { DEFAULT_AUDIENCES, type Audience } from '@/lib/constants/audiences';

function fileContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function resolvePreferredAudiences(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  try {
    const admin = (supabase as unknown as { auth?: { admin?: { getUserById: (id: string) => Promise<{ data?: { user?: { user_metadata?: Record<string, unknown> } } }>; } } }).auth?.admin;
    if (admin?.getUserById) {
      const { data } = await admin.getUserById(userId);
      const meta = data?.user?.user_metadata as Record<string, unknown> | undefined;
      const preferred = Array.isArray(meta?.preferred_audiences)
        ? meta?.preferred_audiences
        : (typeof meta?.preferred_audience === 'string' ? [meta.preferred_audience] : []);
      const cleaned = Array.from(new Set(
        (preferred || []).filter((aud): aud is string => typeof aud === 'string' && aud.trim().length > 0)
      ));
      const filtered = cleaned.filter((aud): aud is Audience =>
        (DEFAULT_AUDIENCES as readonly string[]).includes(aud)
      );
      if (filtered.length > 0) return filtered;
    }
  } catch (err) {
    console.warn('[sourceIngest] Failed to load preferred audiences; falling back to defaults', err);
  }
  return [...DEFAULT_AUDIENCES];
}

export type IngestOptions = { mode?: 'single' | 'multi'; createdSourceIds?: string[] };
export type SourceSetupStage =
  | 'queueing'
  | 'fetching'
  | 'indexing'
  | 'summarizing'
  | 'building_akus'
  | 'ready'
  | 'failed';

export type WorkspaceSource = {
  id: string;
  user_id: string;
  provider: string;
  scope: Record<string, unknown>;
  connection_id?: string | null;
  status_payload?: Record<string, unknown> | null;
  last_error?: string | null;
};

type JiraIssueFields = {
  summary?: string;
  status?: { name?: string; statusCategory?: { name?: string } };
  issuetype?: { name?: string };
  priority?: { name?: string };
  assignee?: { displayName?: string };
  reporter?: { displayName?: string };
  labels?: string[];
  project?: { key?: string };
  customfield_10016?: number | null;
  created?: string;
  updated?: string;
  [key: string]: unknown;
};

type JiraIssue = {
  id: string;
  key: string;
  fields: JiraIssueFields;
};

type JiraSearchSuccess = { ok: true; data: { issues?: JiraIssue[] } };
type JiraSearchFailure = { ok: false; status: number; body: string };

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
  await supabase
    .from('workspace_sources')
    .update({
      status_payload: payload,
      last_error: ('error' in payload ? (payload as Record<string, unknown>).error : null) as string | null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceId);
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

async function sourceStillExists(supabase: SupabaseClient, sourceId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('workspace_sources')
    .select('id')
    .eq('id', sourceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}

async function abortIfDeleted(supabase: SupabaseClient, source: WorkspaceSource, stage: string): Promise<boolean> {
  const exists = await sourceStillExists(supabase, source.id, source.user_id);
  if (exists) return false;
  console.log(`Source ingest: stopping ${source.id} at ${stage} because source was deleted`);
  return true;
}

function normalizeRepoId(repoUrl: string): string {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) throw new Error(`Invalid repo URL: ${repoUrl}`);
  return `github.com/${parsed.owner}/${parsed.repo}`;
}

async function getAllUserSourceIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('workspace_sources')
    .select('id')
    .eq('user_id', userId);
  return (data || []).map((r) => r.id);
}

export async function ingestGitHubSource(
  supabase: SupabaseClient,
  source: WorkspaceSource,
  options?: IngestOptions
) {
  const repo = typeof source.scope?.repo === 'string' ? source.scope.repo : '';
  const branch = typeof source.scope?.branch === 'string' ? source.scope.branch : 'main';
  if (!repo) {
    await updateStatus(supabase, source.id, 'failed', 0, { error: 'Missing repo in scope' });
    return;
  }

  try {
    console.log(`Source ingest: GitHub start for ${repo}@${branch}`, { sourceId: source.id });
    const preferredAudiences = await resolvePreferredAudiences(supabase, source.user_id);
    await updateStage(supabase, source.id, 'fetching', 10, 'Fetching repository');
    if (await abortIfDeleted(supabase, source, 'fetching')) return;

    const repoUrl = repo.startsWith('http') ? repo : `https://github.com/${repo}`;
    const analysis = await analyzeRepository({
      supabase,
      userId: source.user_id,
      repoUrl,
      branch,
      useZipFetch: true,
    });

    const files = analysis.rawFiles || [];
    await updateStage(supabase, source.id, 'indexing', 35, 'Indexing repository files', {
      total_files: files.length,
    });
    const sourceKey = normalizeRepoId(repoUrl);
    const manager = new FileSummaryManager(supabase, source.id, sourceKey, branch);
    console.log(`Source ingest: summarizing ${files.length} files`);
    const totalFiles = files.length;
    await updateStage(supabase, source.id, 'summarizing', 60, 'Summarizing source data', {
      total_files: totalFiles,
    });
    if (await abortIfDeleted(supabase, source, 'summarizing')) return;
    let lastPct = 60;
    await manager.updateSummaries(
      files.map((f) => ({ path: f.path, content: f.content })),
      {
        model: 'openai/gpt-4o-mini',
        regenerationReason: 'initial',
        onProgress: ({ processed, total }) => {
          if (!total) return;
          const pct = Math.min(85, 60 + Math.round((25 * processed) / total));
          if (pct <= lastPct && pct < 85) return;
          lastPct = pct;
          const stepLabel = `Summarizing files (${processed} / ${total})`;
          void updateStage(supabase, source.id, 'summarizing', pct, stepLabel, {
            total_files: total,
            summarized_files: processed,
          });
        },
      }
    );

    // Build AKUs: per-source (single tab) or merged from selected sources only (multi tab)
    await updateStage(supabase, source.id, 'building_akus', 85, 'Building Canon View outputs');
    if (await abortIfDeleted(supabase, source, 'building_akus')) return;
    let lastAkuPct = 85;
    const akuProgress = (processed: number, total: number) => {
      if (!total) return;
      const pct = Math.min(100, 85 + Math.round((15 * processed) / total));
      if (pct <= lastAkuPct && processed < total) return;
      lastAkuPct = pct;
      const stepLabel =
        total > 1 ? `Building Canon View outputs (${processed} / ${total})` : 'Building Canon View outputs';
      void updateStage(supabase, source.id, 'building_akus', pct, stepLabel, {
        aku_projections_done: processed,
        aku_projections_total: total,
      });
    };
    if (options?.mode === 'single') {
      console.log('Source ingest: building per-source AKUs for GitHub source', { audiences: preferredAudiences });
      await buildAkusForSources(supabase, source.user_id, [source.id], preferredAudiences, {
        perSource: true,
        extractionTargets: [{ sourceId: source.id, repoUrl, branch, fallbackName: source.id }],
        shouldAbort: () => sourceStillExists(supabase, source.id, source.user_id).then((exists) => !exists),
        onProgress: akuProgress,
      });
    } else {
      let sourceIds: string[];
      const createdIds = options?.createdSourceIds;
      if (createdIds && createdIds.length > 0) {
        sourceIds = createdIds;
      } else {
        sourceIds = await getAllUserSourceIds(supabase, source.user_id);
      }
      console.log('Source ingest: building merged AKUs for selected sources', { sourceCount: sourceIds.length, audiences: preferredAudiences });
      await buildAkusForSources(supabase, source.user_id, sourceIds, preferredAudiences, {
        extractionTargets: [{ sourceId: source.id, repoUrl, branch, fallbackName: source.id }],
        shouldAbort: () => sourceStillExists(supabase, source.id, source.user_id).then((exists) => !exists),
        onProgress: akuProgress,
      });
    }

    await updateStage(supabase, source.id, 'ready', 100, 'Setup complete');
    console.log(`Source ingest: finished ${repo}@${branch} (${files.length} files)`);
  } catch (err) {
    console.error('Source ingest: GitHub failed', err);
    await updateStatus(supabase, source.id, 'failed', 0, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function ingestIssueSource(
  supabase: SupabaseClient,
  source: WorkspaceSource,
  options?: IngestOptions
) {
  const provider = source.provider.toLowerCase();
  if (!['jira', 'linear', 'asana'].includes(provider)) {
    return;
  }

  try {
    console.log(`Source ingest: Issue provider start (${provider})`, { scope: source.scope });
    await updateStage(supabase, source.id, 'fetching', 10, 'Fetching source data');
    if (await abortIfDeleted(supabase, source, 'fetching')) return;

    const projectKey = typeof source.scope?.project === 'string' ? source.scope.project : null;
    const cloudId = typeof source.scope?.cloudId === 'string' ? source.scope.cloudId : null;

    // Resolve external connection_id used by tokens (oauth_connections.connection_id)
    let connectionIdForTokens: string | null = null;
    if (source.connection_id) {
      const { data: conn, error: connError } = await supabase
        .from('oauth_connections')
        .select('connection_id, provider')
        .eq('id', source.connection_id)
        .single();
      if (connError) {
        console.warn('Source ingest: no OAuth connection found', { sourceId: source.id, provider, error: connError });
      } else {
        connectionIdForTokens = conn?.connection_id || null;
      }
    }

    const connectionId = connectionIdForTokens || source.connection_id || null;

    if (!connectionId) {
      await updateStatus(supabase, source.id, 'failed', 0, {
        error: 'Missing connection_id for issue source',
      });
      return;
    }

    console.log('Source ingest: fetching access token for issues', { connectionId });

    const accessToken = await getProviderAccessToken({
      provider: provider === 'jira' ? 'confluence' : provider,
      connectionId,
    });

    if (!accessToken) {
      await updateStatus(supabase, source.id, 'failed', 0, {
        error: 'Missing access token for issue source. Connect Atlassian in Settings.',
      });
      console.error('Source ingest: missing access token for issue provider', { connectionId });
      return;
    }

    // Minimal Jira fetch: grab first 50 issues for the project
    let issues: JiraIssue[] = [];

    if (provider === 'jira') {
      if (!cloudId) throw new Error('Missing cloudId in scope for Jira project');
      const jql = projectKey ? `project=${projectKey}` : '';
      const baseFields = [
        'summary',
        'description',
        'status',
        'issuetype',
        'priority',
        'assignee',
        'reporter',
        'labels',
        'created',
        'updated',
        'customfield_10016',
        'project',
      ];

      const doSearch = async (endpoint: string): Promise<JiraSearchSuccess | JiraSearchFailure> => {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          return { ok: false as const, status: res.status, body };
        }
        const data = await res.json();
        return { ok: true as const, data };
      };

      const params = `maxResults=50&fields=${encodeURIComponent(baseFields.join(','))}&jql=${encodeURIComponent(jql)}`;
      const urlV3New = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql?${params}`;
      const urlV3 = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search?${params}`;
      const urlV2 = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/2/search?${params}`;

      // Try new JQL search GET
      let searchResult: JiraSearchSuccess | JiraSearchFailure = await doSearch(urlV3New);
      // Fallbacks
      if (!searchResult.ok && (searchResult.status === 410 || searchResult.status === 404 || searchResult.status === 400)) {
        searchResult = await doSearch(urlV3);
      }
      if (!searchResult.ok && (searchResult.status === 410 || searchResult.status === 404 || searchResult.status === 400)) {
        searchResult = await doSearch(urlV2);
      }

      if (!searchResult.ok) {
        const errMsg = `Jira search failed (${searchResult.status})${searchResult.body ? `: ${searchResult.body.slice(0, 200)}` : ''}`;
        await updateStatus(supabase, source.id, 'failed', 0, { error: errMsg });
        console.error('Source ingest: Jira search failed', { status: searchResult.status, body: searchResult.body });
        return;
      }

      const data = searchResult.data;
      issues = Array.isArray(data?.issues) ? data.issues : [];
    } else {
      // TODO: add Linear/Asana implementations
      issues = [];
    }

    await updateStage(supabase, source.id, 'indexing', 45, 'Indexing source records', {
      total_items: issues.length,
    });
    if (await abortIfDeleted(supabase, source, 'indexing')) return;

    // Upsert into issue_index (schema has no description column; full issue is in raw)
    const rows = issues.map((issue) => {
      const fields = issue.fields || {};
      const status = fields.status?.name || 'Unknown';
      const statusCategory = fields.status?.statusCategory?.name || null;
      const type = fields.issuetype?.name || null;
      const priority = fields.priority?.name || null;
      const assignee = fields.assignee?.displayName || null;
      const reporter = fields.reporter?.displayName || null;
      const labels = Array.isArray(fields.labels) ? fields.labels : [];
      const project = fields.project?.key || projectKey || null;
      const storyPoints = fields.customfield_10016 ?? null;

      return {
        source_id: source.id,
        provider,
        issue_id: issue.id,
        issue_key: issue.key || issue.id,
        title: fields.summary || '(no summary)',
        status,
        status_category: statusCategory,
        type,
        priority,
        assignee,
        reporter,
        labels,
        project,
        story_points: typeof storyPoints === 'number' ? storyPoints : null,
        created_at: fields.created || new Date().toISOString(),
        updated_at: fields.updated || new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        raw: issue,
      };
    });

    if (rows.length > 0) {
      console.log(`Source ingest: storing ${rows.length} issues`);
      await supabase.from('issue_index').upsert(rows, { onConflict: 'source_id,issue_key' });
      if (await abortIfDeleted(supabase, source, 'indexing')) return;
    } else {
      console.log('Source ingest: no issues to store for this source');
    }

    // Skip AKU build for issue-only sources to speed up ingest; projections can be run separately if needed.
    await updateStage(supabase, source.id, 'ready', 100, 'Setup complete (issues only, AKU build skipped)');
    console.log('Source ingest: issue provider finished (AKU skipped)', { provider, issues: rows.length });
  } catch (err) {
    console.error('Source ingest: issue ingest failed', err);
    await updateStatus(supabase, source.id, 'failed', 0, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function ingestSource(supabase: SupabaseClient, source: WorkspaceSource, options?: IngestOptions) {
  const provider = source.provider.toLowerCase();
  if (provider === 'github') {
    await ingestGitHubSource(supabase, source, options);
  } else if (['jira', 'linear', 'asana'].includes(provider)) {
    await ingestIssueSource(supabase, source, options);
  } else {
    // Unknown provider; mark ready without processing
    await updateStage(supabase, source.id, 'ready', 100, 'Setup complete');
  }
}

/** Normalize file path for comparison (matches FileSummaryManager) */
function normalizePath(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.?\//, '');
}

export type GitHubSyncResult = {
  added: number;
  removed: number;
  rebuilt: boolean;
  addedPaths: string[];
  removedPaths: string[];
};

/**
 * Delta sync for a GitHub source: compare current repo state to repo_file_summaries,
 * add/update changed files, remove deleted files, then rebuild AKUs if needed.
 */
export async function syncGitHubSourceDelta(
  supabase: SupabaseClient,
  source: WorkspaceSource
): Promise<GitHubSyncResult> {
  const empty = { added: 0, removed: 0, rebuilt: false, addedPaths: [], removedPaths: [] };
  const repo = typeof source.scope?.repo === 'string' ? source.scope.repo : '';
  const branch = typeof source.scope?.branch === 'string' ? source.scope.branch : 'main';
  if (!repo) return empty;

  try {
    const repoUrl = repo.startsWith('http') ? repo : `https://github.com/${repo}`;
    const preferredAudiences = await resolvePreferredAudiences(supabase, source.user_id);
    const analysis = await analyzeRepository({
      supabase,
      userId: source.user_id,
      repoUrl,
      branch,
      useZipFetch: true,
    });

    const rawFiles = analysis.rawFiles || [];
    const sourceKey = normalizeRepoId(repoUrl);
    const manager = new FileSummaryManager(supabase, source.id, sourceKey, branch);

    const currentPaths = new Set(rawFiles.map((f) => normalizePath(f.path)));

    const { data: stored } = await supabase
      .from('repo_file_summaries')
      .select('file_path')
      .eq('source_id', source.id)
      .eq('branch', branch);

    const storedPaths = new Set((stored || []).map((r) => normalizePath(r.file_path)));
    const addedPaths = [...currentPaths].filter((p) => !storedPaths.has(p));
    const removedPaths = [...storedPaths].filter((p) => !currentPaths.has(p));
    const added = addedPaths.length;

    let removed = 0;
    if (removedPaths.length > 0) {
      const { error: delErr } = await supabase
        .from('repo_file_summaries')
        .delete()
        .eq('source_id', source.id)
        .eq('branch', branch)
        .in('file_path', removedPaths);
      if (!delErr) removed = removedPaths.length;
      else console.warn('[canon-sync] GitHub: failed to remove deleted file rows', { repo, count: removedPaths.length });
    }

    const scopeLabel = typeof source.scope?.repo === 'string' ? source.scope.repo : source.id;
    console.log(`[canon-sync] Checking ${rawFiles.length} files for summary updates (hash comparison), source: ${scopeLabel}`);
    const result = await manager.updateSummariesIfNeeded(
      rawFiles.map((f) => ({
        path: f.path,
        content: f.content,
        hash: fileContentHash(f.content),
      })),
      { model: 'openai/gpt-4o-mini', regenerationReason: 'file_changed' }
    );

    const anyChange = removed > 0 || result.processed > 0;

    if (anyChange) {
      const allSourceIds = await getAllUserSourceIds(supabase, source.user_id);
      console.log(`[canon-sync] Rebuilding merged AKUs for all user sources (files changed), source: ${scopeLabel}, sourceCount: ${allSourceIds.length}`);
      await buildAkusForSources(supabase, source.user_id, allSourceIds, preferredAudiences);
      return { added, removed, rebuilt: true, addedPaths, removedPaths };
    }
    return { added, removed, rebuilt: false, addedPaths, removedPaths };
  } catch (err) {
    console.error('[canon-sync] GitHub delta sync failed', { repo: typeof source.scope?.repo === 'string' ? source.scope.repo : source.id, error: err instanceof Error ? err.message : String(err) });
    return empty;
  }
}

export type IssueSyncResult = {
  added: number;
  removed: number;
  rebuilt: boolean;
  addedKeys: string[];
  removedKeys: string[];
};

/**
 * Delta sync for an issue source: fetch current issues, upsert issue_index,
 * remove issues no longer returned, then rebuild AKUs.
 */
export async function syncIssueSourceDelta(
  supabase: SupabaseClient,
  source: WorkspaceSource
): Promise<IssueSyncResult> {
  const empty = { added: 0, removed: 0, rebuilt: false, addedKeys: [], removedKeys: [] };
  const provider = source.provider.toLowerCase();
  if (!['jira', 'linear', 'asana'].includes(provider)) return empty;

  const projectKey = typeof source.scope?.project === 'string' ? source.scope.project : null;
  const cloudId = typeof source.scope?.cloudId === 'string' ? source.scope.cloudId : null;

  let connectionIdForTokens: string | null = null;
  if (source.connection_id) {
    const { data: conn } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('id', source.connection_id)
      .single();
    connectionIdForTokens = conn?.connection_id || null;
  }
  const connectionId = connectionIdForTokens || source.connection_id || null;
  if (!connectionId) {
    console.warn('[canon-sync] Issue source skipped: no OAuth connection', { provider, project: projectKey });
    return empty;
  }
  const accessToken = await getProviderAccessToken({
    provider: provider === 'jira' ? 'confluence' : provider,
    connectionId,
  });
  if (!accessToken) {
    console.warn('[canon-sync] Issue source skipped: no access token', { provider, project: projectKey });
    return empty;
  }

  let issues: JiraIssue[] = [];
  if (provider === 'jira' && cloudId) {
    const jql = projectKey ? `project=${projectKey}` : '';
    const baseFields = [
      'summary', 'description', 'status', 'issuetype', 'priority', 'assignee', 'reporter',
      'labels', 'created', 'updated', 'customfield_10016', 'project',
    ];
    const params = `maxResults=50&fields=${encodeURIComponent(baseFields.join(','))}&jql=${encodeURIComponent(jql)}`;
    const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql?${params}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      issues = Array.isArray(data?.issues) ? data.issues : [];
    } else {
      console.warn('[canon-sync] Jira fetch failed', { project: projectKey, status: res.status });
    }
  }

  const rows = issues.map((issue) => {
    const fields = issue.fields || {};
    return {
      source_id: source.id,
      provider,
      issue_id: issue.id,
      issue_key: issue.key || issue.id,
      title: fields.summary || '(no summary)',
      status: fields.status?.name || 'Unknown',
      status_category: fields.status?.statusCategory?.name || null,
      type: fields.issuetype?.name || null,
      priority: fields.priority?.name || null,
      assignee: fields.assignee?.displayName || null,
      reporter: fields.reporter?.displayName || null,
      labels: Array.isArray(fields.labels) ? fields.labels : [],
      project: fields.project?.key || projectKey || null,
      story_points: typeof fields.customfield_10016 === 'number' ? fields.customfield_10016 : null,
      created_at: fields.created || new Date().toISOString(),
      updated_at: fields.updated || new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      raw: issue,
    };
  });

  const currentKeys = new Set(rows.map((r) => r.issue_key));

  const { data: existingBefore } = await supabase
    .from('issue_index')
    .select('issue_key')
    .eq('source_id', source.id);
  const existingKeys = new Set((existingBefore || []).map((r) => r.issue_key));
  const addedKeys = [...currentKeys].filter((k) => !existingKeys.has(k));
  const added = addedKeys.length;

  if (rows.length > 0) {
    await supabase.from('issue_index').upsert(rows, { onConflict: 'source_id,issue_key' });
  }

  const removedKeys = [...existingKeys].filter((k) => !currentKeys.has(k));
  let removed = 0;
  if (removedKeys.length > 0) {
    const { error: delErr } = await supabase
      .from('issue_index')
      .delete()
      .eq('source_id', source.id)
      .in('issue_key', removedKeys);
    if (!delErr) removed = removedKeys.length;
    else console.warn('[canon-sync] Issues: failed to remove obsolete rows', { provider, project: projectKey, count: removedKeys.length });
  }

  const anyChange = added > 0 || removed > 0;
  if (anyChange) {
    console.log('[canon-sync] Issue delta applied; skipping AKU rebuild for issue-only sources');
    return { added, removed, rebuilt: false, addedKeys, removedKeys };
  }
  return { added, removed, rebuilt: false, addedKeys, removedKeys };
}
