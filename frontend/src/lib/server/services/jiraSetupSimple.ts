import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getProviderAccessToken, withConfluenceAccessToken } from '@/lib/server/oauth/tokenStore';

type JiraSetupParams = {
  repoId: string;
  userId: string;
  projectKey?: string | null;
  cloudId?: string | null;
};

type JiraIssueRecord = {
  key: string;
  summary: string | null;
  status: string | null;
  created: string | null;
  updated: string | null;
};

function hashIssue(issue: JiraIssueRecord): string {
  const payload = `${issue.key}|${issue.summary || ''}|${issue.status || ''}|${issue.updated || ''}`;
  return createHash('sha256').update(payload).digest('hex');
}

function buildProjectJql(params: JiraSetupParams): string {
  if (!params.projectKey) {
    throw new Error('Missing Jira project key.');
  }
  return `project = ${params.projectKey} ORDER BY updated DESC`;
}

async function getJiraConnection(userId: string) {
  const supabase = createServiceRoleClient();
  const { data: connection } = await supabase
    .from('oauth_connections')
    .select('connection_id, metadata')
    .eq('user_id', userId)
    .eq('provider', 'confluence')
    .eq('status', 'active')
    .maybeSingle();

  const metadata = connection?.metadata && typeof connection.metadata === 'object'
    ? (connection.metadata as Record<string, unknown>)
    : {};

  const cloudId = typeof metadata.cloud_id === 'string' ? metadata.cloud_id : null;
  const jiraCloudId = typeof metadata.jira_cloud_id === 'string' ? metadata.jira_cloud_id : null;

  if (!connection?.connection_id || !cloudId) {
    return null;
  }

  return { connectionId: connection.connection_id, cloudId, jiraCloudId };
}

export async function setupJiraSourceSimple(
  supabase: SupabaseClient,
  setupId: string,
  params: JiraSetupParams
) {
  const connection = await getJiraConnection(params.userId);
  const cloudId = params.cloudId || connection?.jiraCloudId || connection?.cloudId || null;

  if (!connection?.connectionId || !cloudId) {
    throw new Error('Jira connection not found.');
  }

  const accessToken = await getProviderAccessToken({
    provider: 'confluence',
    connectionId: connection.connectionId,
  });

  if (!accessToken) {
    throw new Error('Missing Jira access token.');
  }

  const jql = buildProjectJql(params);
  const baseUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`;
  const issueRepoId = `jira:${params.repoId}`;
  const branch = 'jira';

  let startAt = 0;
  const maxResults = 50;
  let processed = 0;
  let total = 0;

  const admin = createServiceRoleClient();

  while (startAt < 10000) {
    const url = `${baseUrl}?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=${encodeURIComponent('summary,status,updated,created')}`;
    const response = await withConfluenceAccessToken({
      connectionId: connection.connectionId,
      run: async (token) =>
        fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => 'Failed to fetch Jira issues.');
      throw new Error(message);
    }

    const data = await response.json().catch(() => ({}));
    const issues = Array.isArray(data?.issues) ? data.issues : [];
    if (startAt === 0) {
      total = typeof data?.total === 'number' ? data.total : issues.length;
      await supabase
        .from('source_setup')
        .update({
          total_files: total,
          summarized_files: 0,
          processing_status: 'scanning',
          progress_percentage: 0,
          current_item: null,
          last_progress_update: new Date().toISOString(),
        })
        .eq('id', setupId);
    }

    if (!issues.length) break;

    for (const issue of issues) {
      const record: JiraIssueRecord = {
        key: issue?.key ? String(issue.key) : '',
        summary: issue?.fields?.summary ?? null,
        status: issue?.fields?.status?.name ?? null,
        created: issue?.fields?.created ?? null,
        updated: issue?.fields?.updated ?? null,
      };

      if (!record.key) continue;

      const fileHash = hashIssue(record);
      const summaryText = JSON.stringify(record);

      await admin
        .from('repo_file_summaries')
        .upsert(
          {
            repo_id: issueRepoId,
            file_path: record.key,
            file_hash: fileHash,
            summary_text: summaryText,
            summary_model: 'jira',
            branch,
            regeneration_reason: 'initial',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'repo_id,file_path,branch' }
        );

      processed += 1;

      if (processed % 25 === 0 || processed === total) {
        await supabase
          .from('source_setup')
          .update({
            summarized_files: processed,
            current_item: record.key,
            processing_status: 'scanning',
            progress_percentage: total ? Math.round((processed / total) * 100) : 0,
            last_progress_update: new Date().toISOString(),
          })
          .eq('id', setupId);
      }
    }

    if (issues.length < maxResults) break;
    startAt += maxResults;
  }

  await supabase
    .from('source_setup')
    .update({
      setup_status: 'ready',
      setup_completed_at: new Date().toISOString(),
      last_analyzed: new Date().toISOString(),
      summarized_files: processed,
      total_files: total || processed,
      processing_status: 'ready',
      progress_percentage: 100,
      current_item: null,
      last_progress_update: new Date().toISOString(),
    })
    .eq('id', setupId);
}
