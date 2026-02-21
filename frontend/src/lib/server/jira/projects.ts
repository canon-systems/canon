import { createServiceRoleClient } from '@/lib/supabase/server';
import { getProviderAccessToken, withConfluenceAccessToken } from '@/lib/server/oauth/tokenStore';

export type JiraProject = {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
};

async function getJiraConnection(userId: string) {
  const supabase = createServiceRoleClient();
  const { data: connection } = await supabase
    .from('oauth_connections')
    .select('connection_id, metadata')
    .eq('user_id', userId)
    .eq('provider', 'atlassian')
    .eq('status', 'active')
    .maybeSingle();

  const metadata = connection?.metadata && typeof connection.metadata === 'object'
    ? (connection.metadata as Record<string, unknown>)
    : {};

  const cloudId = typeof metadata.cloud_id === 'string' ? metadata.cloud_id : null;
  const jiraCloudId = typeof metadata.jira_cloud_id === 'string' ? metadata.jira_cloud_id : null;

  if (!connection?.connection_id) {
    return null;
  }

  return { connectionId: connection.connection_id, cloudId, jiraCloudId };
}

export type JiraProjectsResult = {
  projects: JiraProject[];
  warning?: string;
  cloudId?: string;
};

export async function listJiraProjectsForUser(userId: string, cloudIdOverride?: string | null): Promise<JiraProjectsResult> {
  const connection = await getJiraConnection(userId);
  if (!connection) return { projects: [] };

  const accessToken = await getProviderAccessToken({
    provider: 'atlassian',
    connectionId: connection.connectionId,
  });

  if (!accessToken) {
    throw new Error('Missing Jira access token.');
  }

  const resolvedCloudId = (cloudIdOverride && cloudIdOverride.trim().length > 0)
    ? cloudIdOverride.trim()
    : (connection.jiraCloudId || connection.cloudId);

  if (!resolvedCloudId) {
    return { projects: [], warning: 'Select a Jira workspace to continue.' };
  }

  const projects: JiraProject[] = [];
  let warning: string | undefined;
  let startAt = 0;
  const maxResults = 50;

  while (startAt < 1000) {
    const url = `https://api.atlassian.com/ex/jira/${resolvedCloudId}/rest/api/3/project/search?startAt=${startAt}&maxResults=${maxResults}`;
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
      if (response.status === 404) {
        warning = 'Jira projects could not be listed for this workspace. Select another Jira workspace.';
        break;
      }
      const message = await response.text().catch(() => 'Failed to fetch Jira projects.');
      throw new Error(message);
    }

    const data = await response.json().catch(() => ({}));
    // Jira API v3 /project endpoint can return either:
    // 1. A direct array of projects
    // 2. A paginated response with values array
    const values = Array.isArray(data) ? data : Array.isArray(data?.values) ? data.values : Array.isArray(data?.projects) ? data.projects : [];

    for (const project of values) {
      const id = project?.id ? String(project.id) : null;
      const key = project?.key ? String(project.key) : null;
      const name = project?.name ? String(project.name) : null;
      if (!id || !key || !name) continue;

      projects.push({
        id,
        key,
        name,
        projectTypeKey: typeof project?.projectTypeKey === 'string' ? project.projectTypeKey : undefined,
      });
    }

    // If response is a direct array (not paginated), we're done
    // Otherwise, check pagination flags
    if (Array.isArray(data)) {
      break;
    }
    if (values.length < maxResults || data?.isLast === true) break;
    startAt += maxResults;
  }

  return { projects, warning, cloudId: resolvedCloudId };
}
