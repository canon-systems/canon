import { createServiceRoleClient } from '@/lib/supabase/server';
import { getProviderAccessToken, withConfluenceAccessToken } from '@/lib/server/oauth/tokenStore';

export type JiraSite = {
  id: string;
  name: string;
  url: string;
  scopes: string[];
};

async function getJiraConnection(userId: string) {
  const supabase = createServiceRoleClient();
  const { data: connection } = await supabase
    .from('oauth_connections')
    .select('connection_id')
    .eq('user_id', userId)
    .eq('provider', 'confluence')
    .eq('status', 'active')
    .maybeSingle();

  if (!connection?.connection_id) {
    return null;
  }

  return { connectionId: connection.connection_id };
}

export async function listJiraSitesForUser(userId: string): Promise<JiraSite[]> {
  const connection = await getJiraConnection(userId);
  if (!connection) return [];

  const accessToken = await getProviderAccessToken({
    provider: 'confluence',
    connectionId: connection.connectionId,
  });

  if (!accessToken) {
    throw new Error('Missing Jira access token.');
  }

  const response = await withConfluenceAccessToken({
    connectionId: connection.connectionId,
    run: async (token) =>
      fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Failed to load Jira sites.');
    throw new Error(message);
  }

  const data = await response.json().catch(() => []);
  if (!Array.isArray(data)) return [];

  const sites = data
    .map((resource: { id?: string | number; name?: string; url?: string; scopes?: unknown[] }) => {
      const id = resource?.id ? String(resource.id) : null;
      const name = resource?.name ? String(resource.name) : null;
      const url = resource?.url ? String(resource.url) : null;
      const scopes = Array.isArray(resource?.scopes) ? resource.scopes.map((scope: unknown) => String(scope)) : [];
      if (!id || !url) return null;
      return {
        id,
        name: name || url,
        url,
        scopes,
      } as JiraSite;
    })
    .filter(Boolean) as JiraSite[];

  // Deduplicate by id, keeping the first occurrence
  const uniqueSites = new Map<string, JiraSite>();
  for (const site of sites) {
    if (!uniqueSites.has(site.id)) {
      uniqueSites.set(site.id, site);
    }
  }

  return Array.from(uniqueSites.values());
}
