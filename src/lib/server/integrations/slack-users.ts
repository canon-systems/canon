import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';
import { createServiceRoleClient } from '@/lib/supabase/server';

export type SlackDirectoryUser = {
  id: string;
  name: string;
  email: string | null;
};

type SlackUserRaw = {
  id: string;
  name?: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  is_app_user?: boolean;
  profile?: {
    email?: string;
    display_name?: string;
    real_name?: string;
  };
};

type SlackUsersListResponse = {
  ok: boolean;
  error?: string;
  needed?: string;
  provided?: string;
  members?: SlackUserRaw[];
  response_metadata?: { next_cursor?: string };
};

export type SlackDirectoryResult = {
  users: SlackDirectoryUser[];
  reconnectRequired: boolean;
  missingScopes: string[];
  providedScopes: string[];
};

const REQUIRED_DIRECTORY_SCOPES = ['users:read', 'users:read.email'];

function scopes(value: string | null | undefined) {
  return (value ?? '')
    .split(/[ ,]/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function reconnectResult(providedScopes: string[], missingScopes: string[]): SlackDirectoryResult {
  return { users: [], reconnectRequired: true, missingScopes, providedScopes };
}

export async function listSlackUsersForOrganization(organizationId: string): Promise<SlackDirectoryResult> {
  const supabase = createServiceRoleClient();
  const { data: connection, error: connectionError } = await supabase
    .from('oauth_connections')
    .select('connection_id')
    .eq('organization_id', organizationId)
    .eq('provider', 'slack')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connectionError) throw connectionError;
  if (!connection?.connection_id) throw new Error('No active Slack connection');

  const { data: tokenRow, error: tokenError } = await supabase
    .from('oauth_provider_tokens')
    .select('scope')
    .eq('organization_id', organizationId)
    .eq('provider', 'slack')
    .eq('connection_id', connection.connection_id)
    .maybeSingle();

  if (tokenError) throw tokenError;
  const providedScopes = scopes(typeof tokenRow?.scope === 'string' ? tokenRow.scope : null);
  const missingScopes = REQUIRED_DIRECTORY_SCOPES.filter((scope) => !providedScopes.includes(scope));
  if (missingScopes.length > 0) return reconnectResult(providedScopes, missingScopes);

  const accessToken = await getProviderAccessToken({
    provider: 'slack',
    connectionId: connection.connection_id,
  });
  if (!accessToken) throw new Error('No Slack access token available');

  const users: SlackDirectoryUser[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);

    const response = await fetch(`https://slack.com/api/users.list?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await response.json()) as SlackUsersListResponse;

    if (!data.ok || !data.members) {
      if (data.error === 'missing_scope') {
        const apiMissingScopes = scopes(data.needed);
        return reconnectResult(scopes(data.provided), apiMissingScopes.length > 0 ? apiMissingScopes : REQUIRED_DIRECTORY_SCOPES);
      }
      throw new Error(`Slack could not load teammates: ${data.error ?? 'unknown_error'}`);
    }

    users.push(...data.members.flatMap((member) => {
      if (member.id === 'USLACKBOT' || member.deleted || member.is_bot || member.is_app_user) return [];
      const name = member.profile?.display_name || member.real_name || member.profile?.real_name || member.name || member.id;
      return [{ id: member.id, name, email: member.profile?.email?.trim() || null }];
    }));

    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor && users.length < 1000);

  return {
    users: users.sort((a, b) => a.name.localeCompare(b.name)),
    reconnectRequired: false,
    missingScopes: [],
    providedScopes,
  };
}
