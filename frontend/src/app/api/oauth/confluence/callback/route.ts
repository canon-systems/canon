import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { encryptSecret } from '@/lib/server/oauth/tokenCrypto';
import { createAtlassianOAuthClient } from '@/lib/server/oauth/confluenceClient';
import { trackIntegrationConnected } from '@/lib/server/services/usageTracking';
import { createLogger } from '@/lib/server/logging';

export const runtime = 'nodejs';

const STATE_COOKIE = 'confluence_oauth_state';
const VERIFIER_COOKIE = 'confluence_oauth_verifier';
const log = createLogger('oauth.atlassian.callback', {
  label: 'Atlassian OAuth Callback',
});

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
    const logFields = { error, description };
    console.warn('[atlassian][oauth][callback][provider_error]', logFields);
    log.warn('provider_error', logFields);
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
    const logFields = {
      hasCode: Boolean(code),
      hasReturnedState: Boolean(returnedState),
      hasExpectedState: Boolean(expectedState),
      hasVerifier: Boolean(codeVerifier),
      userId: user.id,
    };
    console.warn('[atlassian][oauth][callback][missing_params]', logFields);
    log.warn('missing_callback_params', logFields);
    return redirectToSettings(request.nextUrl.origin, { error: 'Missing OAuth callback parameters.' });
  }

  if (returnedState !== expectedState) {
    const logFields = {
      expectedState,
      returnedState,
      userId: user.id,
    };
    console.warn('[atlassian][oauth][callback][state_mismatch]', logFields);
    log.warn('state_mismatch', logFields);
    return redirectToSettings(request.nextUrl.origin, { error: 'Invalid OAuth state. Please try again.' });
  }

  try {
    const redirectUri = new URL('/api/oauth/confluence/callback', request.nextUrl.origin).toString();
    const client = createAtlassianOAuthClient(redirectUri);

    const tokenSet = await client.oauthCallback(
      redirectUri,
      { code, state: returnedState },
      { state: expectedState, code_verifier: codeVerifier }
    );

    const accessToken = tokenSet.access_token;
    if (!accessToken) {
      const logFields = { userId: user.id, scope: tokenSet.scope };
      console.error('[atlassian][oauth][callback][no_access_token]', logFields);
      log.error('token_missing_access_token', logFields);
      return redirectToSettings(request.nextUrl.origin, { error: 'Confluence token exchange did not return an access token.' });
    }

    const tokenFields = {
      userId: user.id,
      scope: tokenSet.scope,
      expiresAt: typeof tokenSet.expires_at === 'number' ? tokenSet.expires_at : null,
    };
    console.info('[atlassian][oauth][callback][token_received]', tokenFields);
    log.info('token_received', tokenFields);

    const resources = await fetchAccessibleResources(accessToken);
    const resourceList = Array.isArray(resources) ? resources : [];
    const primaryResource = resourceList[0] || null;
    const jiraResource = pickJiraResource(resourceList);

    const resourceFields = {
      userId: user.id,
      resourceCount: resourceList.length,
      primaryResourceId: primaryResource?.id,
      primaryResourceUrl: primaryResource?.url,
      jiraResourceId: jiraResource?.id,
      jiraResourceUrl: jiraResource?.url,
    };
    console.info('[atlassian][oauth][callback][resources]', resourceFields);
    log.info('resources_resolved', resourceFields);

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
      const logFields = {
        userId: user.id,
        error: connectionError.message,
        provider: 'confluence',
      };
      console.error('[atlassian][oauth][callback][connection_upsert_failed]', logFields);
      log.error('connection_upsert_failed', logFields);
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
      const logFields = {
        userId: user.id,
        error: tokenError.message,
        provider: 'confluence',
      };
      console.error('[atlassian][oauth][callback][token_upsert_failed]', logFields);
      log.error('token_upsert_failed', logFields);
      return redirectToSettings(request.nextUrl.origin, { error: 'Failed to store Atlassian tokens.' });
    }

    await trackIntegrationConnected(supabase, user.id, 'confluence', connectionId);
    const completeFields = {
      userId: user.id,
      connectionId,
      primaryResourceId: primaryResource?.id,
      jiraResourceId: jiraResource?.id,
    };
    console.info('[atlassian][oauth][callback][complete]', completeFields);
    log.info('oauth_complete', completeFields);
    return redirectToSettings(request.nextUrl.origin, { success: 'true', provider: 'confluence' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const logFields = { userId: user.id, error: message };
    console.error('[atlassian][oauth][callback][error]', logFields);
    log.error('callback_error', logFields);
    return redirectToSettings(request.nextUrl.origin, { error: message });
  }
}
