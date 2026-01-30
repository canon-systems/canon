import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeRepository } from './analyzeRepository';
import { FileSummaryManager } from './fileSummaryManager';
import { parseRepoUrl } from '../github/github';
import { getProviderAccessToken } from '../oauth/tokenStore';
import { buildAkusForSources } from './akuBuilder';

const DEFAULT_AUDIENCES = ['Executive', 'Sales', 'Marketing', 'Engineering', 'Support', 'Customer'];

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
  status: string,
  progress: number | null = null,
  extras: Record<string, unknown> = {}
) {
  const payload = { status, ...(progress !== null ? { progress_pct: progress } : {}), ...extras };
  await supabase
    .from('workspace_sources')
    .update({
      status_payload: payload,
      last_error: ('error' in payload ? (payload as Record<string, unknown>).error : null) as string | null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceId);
}

function normalizeRepoId(repoUrl: string): string {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) throw new Error(`Invalid repo URL: ${repoUrl}`);
  return `github.com/${parsed.owner}/${parsed.repo}`;
}

export async function ingestGitHubSource(
  supabase: SupabaseClient,
  source: WorkspaceSource
) {
  const repo = typeof source.scope?.repo === 'string' ? source.scope.repo : '';
  const branch = typeof source.scope?.branch === 'string' ? source.scope.branch : 'main';
  if (!repo) {
    await updateStatus(supabase, source.id, 'failed', 0, { error: 'Missing repo in scope' });
    return;
  }

  try {
    console.log('[ingestGitHubSource] start', { sourceId: source.id, repo, branch });
    await updateStatus(supabase, source.id, 'ingesting', 0);

    const repoUrl = repo.startsWith('http') ? repo : `https://github.com/${repo}`;
    const analysis = await analyzeRepository({
      supabase,
      userId: source.user_id,
      repoUrl,
      branch,
      useZipFetch: true,
    });

    const files = analysis.rawFiles || [];
    const sourceKey = normalizeRepoId(repoUrl);
    const manager = new FileSummaryManager(supabase, source.id, sourceKey, branch);
    console.log('[ingestGitHubSource] summarizing files', { sourceId: source.id, fileCount: files.length });
    await manager.updateSummaries(
      files.map((f) => ({ path: f.path, content: f.content })),
      { model: 'openai/gpt-4o-mini', regenerationReason: 'initial' }
    );

    // Build AKUs for this source and generate default audience projections
    console.log('[ingestGitHubSource] building AKUs', { sourceId: source.id, audiences: DEFAULT_AUDIENCES });
    await buildAkusForSources(supabase, source.user_id, [source.id], DEFAULT_AUDIENCES);

    await updateStatus(supabase, source.id, 'ready', 100);
    console.log('[ingestGitHubSource] complete', { sourceId: source.id, repo, branch, files: files.length });
  } catch (err) {
    console.error('[ingestGitHubSource] failed', err);
    await updateStatus(supabase, source.id, 'failed', 0, {
      error: err instanceof Error ? err.message : String(err),
    });
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
    console.log('[ingestIssueSource] start', { sourceId: source.id, provider, scope: source.scope });
    await updateStatus(supabase, source.id, 'ingesting', 0);

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
        console.warn('[ingestIssueSource] failed to load oauth_connection for source', source.id, connError);
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

    console.log('[ingestIssueSource] fetching token', { sourceId: source.id, provider, connectionId });

    const accessToken = await getProviderAccessToken({
      provider: provider === 'jira' ? 'confluence' : provider,
      connectionId,
    });

    if (!accessToken) {
      await updateStatus(supabase, source.id, 'failed', 0, {
        error: 'Missing access token for issue source. Connect Jira/Confluence OAuth.',
      });
      console.error('[ingestIssueSource] no access token found', { sourceId: source.id, provider, connectionId });
      return;
    }

    // Minimal Jira fetch: grab first 50 issues for the project
    let issues: JiraIssue[] = [];

    if (provider === 'jira') {
      if (!cloudId) throw new Error('Missing cloudId in scope for Jira project');
      const jql = projectKey ? `project=${projectKey}` : '';
      const baseFields = [
        'summary',
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
        console.error('[ingestIssueSource] jira search failed', { sourceId: source.id, status: searchResult.status, body: searchResult.body });
        return;
      }

      const data = searchResult.data;
      issues = Array.isArray(data?.issues) ? data.issues : [];
    } else {
      // TODO: add Linear/Asana implementations
      issues = [];
    }

    // Upsert into issue_index
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
        sprint: null,
        epic_key: null,
        story_points: typeof storyPoints === 'number' ? storyPoints : null,
        created_at: fields.created || new Date().toISOString(),
        updated_at: fields.updated || new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        changelog: {},
        raw: issue,
      };
    });

    if (rows.length > 0) {
      console.log('[ingestIssueSource] upserting issues', { sourceId: source.id, count: rows.length });
      await supabase.from('issue_index').upsert(rows, { onConflict: 'source_id,issue_key' });
    } else {
      console.log('[ingestIssueSource] no issues to upsert', { sourceId: source.id });
    }

    // Build AKUs for this issue source as well (with default projections)
    console.log('[ingestIssueSource] building AKUs', { sourceId: source.id, issues: rows.length, audiences: DEFAULT_AUDIENCES });
    await buildAkusForSources(supabase, source.user_id, [source.id], DEFAULT_AUDIENCES);

    await updateStatus(supabase, source.id, 'ready', 100);
  } catch (err) {
    console.error('[ingestIssueSource] failed', err);
    await updateStatus(supabase, source.id, 'failed', 0, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function ingestSource(supabase: SupabaseClient, source: WorkspaceSource) {
  const provider = source.provider.toLowerCase();
  if (provider === 'github') {
    await ingestGitHubSource(supabase, source);
  } else if (['jira', 'linear', 'asana'].includes(provider)) {
    await ingestIssueSource(supabase, source);
  } else {
    // Unknown provider; mark ready without processing
    await updateStatus(supabase, source.id, 'ready', 100);
  }
}
