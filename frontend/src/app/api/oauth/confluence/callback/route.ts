import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { encryptSecret } from '@/lib/server/oauth/tokenCrypto';
import { createConfluenceOAuthClient } from '@/lib/server/oauth/confluenceClient';
import { trackIntegrationConnected } from '@/lib/server/services/usageTracking';

export const runtime = 'nodejs';

const STATE_COOKIE = 'confluence_oauth_state';
const VERIFIER_COOKIE = 'confluence_oauth_verifier';

function redirectToSettings(origin: string, params: Record<string, string>) {
  const url = new URL('/settings', origin);
  url.searchParams.set('tab', 'integrations');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

async function fetchAccessibleResources(accessToken: string) {
  const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return [];
  }

  return response.json().catch(() => []);
}

function pickJiraResource(resources: Array<{ id?: string; url?: string; name?: string; scopes?: string[] }>) {
  return resources.find((resource) =>
    Array.isArray(resource?.scopes) && resource.scopes.some((scope) => scope.includes('jira'))
  ) || null;
}

export async function GET(request: NextRequest) {
  const { user } = await getSession();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const error = request.nextUrl.searchParams.get('error');
  if (error) {
    const description = request.nextUrl.searchParams.get('error_description') || error;
    return redirectToSettings(request.nextUrl.origin, { error: description });
  }

  const code = request.nextUrl.searchParams.get('code');
  const returnedState = request.nextUrl.searchParams.get('state');

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  const codeVerifier = cookieStore.get(VERIFIER_COOKIE)?.value;

  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(VERIFIER_COOKIE);

  if (!code || !returnedState || !expectedState || !codeVerifier) {
    return redirectToSettings(request.nextUrl.origin, { error: 'Missing OAuth callback parameters.' });
  }

  if (returnedState !== expectedState) {
    return redirectToSettings(request.nextUrl.origin, { error: 'Invalid OAuth state. Please try again.' });
  }

  try {
    const redirectUri = new URL('/api/oauth/confluence/callback', request.nextUrl.origin).toString();
    const client = createConfluenceOAuthClient(redirectUri);

    const tokenSet = await client.oauthCallback(
      redirectUri,
      { code, state: returnedState },
      { state: expectedState, code_verifier: codeVerifier }
    );

    const accessToken = tokenSet.access_token;
    if (!accessToken) {
      return redirectToSettings(request.nextUrl.origin, { error: 'Confluence token exchange did not return an access token.' });
    }

    const resources = await fetchAccessibleResources(accessToken);
    const resourceList = Array.isArray(resources) ? resources : [];
    const primaryResource = resourceList[0] || null;
    const jiraResource = pickJiraResource(resourceList);

    // Debug logging (scopes + resources) to troubleshoot missing Jira webhook scope
    console.log('[confluence/oauth/callback] scopes:', tokenSet.scope);
    console.log('[confluence/oauth/callback] accessible resources count:', resourceList.length);
    console.log(
      '[confluence/oauth/callback] jira resource:',
      jiraResource ? { id: jiraResource.id, url: jiraResource.url, name: jiraResource.name } : null
    );

    const supabase = await createClient();
    const { data: existingConnection } = await supabase
      .from('oauth_connections')
      .select('connection_id, metadata')
      .eq('user_id', user.id)
      .eq('provider', 'confluence')
      .maybeSingle();

    const connectionId = existingConnection?.connection_id || crypto.randomUUID();
    const existingMetadata =
      existingConnection?.metadata && typeof existingConnection.metadata === 'object'
        ? existingConnection.metadata
        : {};

    const { error: connectionError } = await supabase
      .from('oauth_connections')
      .upsert(
        {
          user_id: user.id,
          provider: 'confluence',
          connection_id: connectionId,
          status: 'active',
          metadata: {
            ...existingMetadata,
            source: 'oauth',
            connected_at: new Date().toISOString(),
            cloud_id: primaryResource?.id || null,
            site_url: primaryResource?.url || null,
            site_name: primaryResource?.name || null,
            jira_cloud_id: jiraResource?.id || null,
            jira_site_url: jiraResource?.url || null,
            jira_site_name: jiraResource?.name || null,
            resource_count: Array.isArray(resources) ? resources.length : 0,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );

    if (connectionError) {
      console.error('Failed to store Atlassian connection:', connectionError);
      return redirectToSettings(request.nextUrl.origin, { error: 'Failed to store Atlassian connection.' });
    }

    const admin = createServiceRoleClient();
    const expiresAt =
      typeof tokenSet.expires_at === 'number' ? new Date(tokenSet.expires_at * 1000).toISOString() : null;

    const { error: tokenError } = await admin
      .from('oauth_provider_tokens')
      .upsert(
        {
          connection_id: connectionId,
          user_id: user.id,
          provider: 'confluence',
          provider_account_id: null,
          access_token: encryptSecret(accessToken),
          refresh_token: tokenSet.refresh_token ? encryptSecret(tokenSet.refresh_token) : null,
          token_type: tokenSet.token_type || null,
          scope: tokenSet.scope || null,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'connection_id' }
      );

    if (tokenError) {
      console.error('Failed to store Atlassian tokens:', tokenError);
      return redirectToSettings(request.nextUrl.origin, { error: 'Failed to store Atlassian tokens.' });
    }

    await trackIntegrationConnected(supabase, user.id, 'confluence', connectionId);
    return redirectToSettings(request.nextUrl.origin, { success: 'true', provider: 'confluence' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Atlassian OAuth callback error:', err);
    return redirectToSettings(request.nextUrl.origin, { error: message });
  }
}
