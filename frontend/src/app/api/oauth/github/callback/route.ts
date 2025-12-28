import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createGitHubOAuthClient } from '@/lib/server/oauth/githubClient';
import { encryptSecret } from '@/lib/server/oauth/tokenCrypto';
import { trackIntegrationConnected } from '@/lib/server/services/usageTracking';

export const runtime = 'nodejs';

const STATE_COOKIE = 'github_oauth_state';
const VERIFIER_COOKIE = 'github_oauth_verifier';

function redirectToSettings(origin: string, params: Record<string, string>) {
  const url = new URL('/settings', origin);
  url.searchParams.set('tab', 'integrations');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

async function fetchGitHubUser(accessToken: string) {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json().catch(() => null);
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
    const redirectUri = new URL('/api/oauth/github/callback', request.nextUrl.origin).toString();
    const client = createGitHubOAuthClient(redirectUri);

    // GitHub is OAuth2 (not OIDC), so use `oauthCallback` (no `id_token` expected).
    const tokenSet = await client.oauthCallback(
      redirectUri,
      { code, state: returnedState },
      { state: expectedState, code_verifier: codeVerifier }
    );

    const accessToken = tokenSet.access_token;
    if (!accessToken) {
      return redirectToSettings(request.nextUrl.origin, { error: 'GitHub token exchange did not return an access token.' });
    }

    const githubUser = await fetchGitHubUser(accessToken);
    const providerAccountId = githubUser?.id != null ? String(githubUser.id) : null;
    const login = typeof githubUser?.login === 'string' ? githubUser.login : null;

    const supabase = await createClient();

    const { data: existingConnection } = await supabase
      .from('oauth_connections')
      .select('connection_id, metadata')
      .eq('user_id', user.id)
      .eq('provider', 'github')
      .maybeSingle();

    const connectionId = existingConnection?.connection_id || crypto.randomUUID();
    const existingMetadata = (existingConnection?.metadata && typeof existingConnection.metadata === 'object')
      ? existingConnection.metadata
      : {};

    const { error: connectionError } = await supabase
      .from('oauth_connections')
      .upsert(
        {
          user_id: user.id,
          provider: 'github',
          connection_id: connectionId,
          status: 'active',
          metadata: {
            ...existingMetadata,
            source: 'native',
            provider_account_id: providerAccountId,
            login,
            connected_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );

    if (connectionError) {
      console.error('Failed to store GitHub connection:', connectionError);
      return redirectToSettings(request.nextUrl.origin, { error: 'Failed to store GitHub connection.' });
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
          provider: 'github',
          provider_account_id: providerAccountId,
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
      console.error('Failed to store GitHub tokens:', tokenError);
      return redirectToSettings(request.nextUrl.origin, { error: 'Failed to store GitHub tokens.' });
    }

    await trackIntegrationConnected(supabase, user.id, 'github', connectionId);

    return redirectToSettings(request.nextUrl.origin, { success: 'true', provider: 'github' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GitHub OAuth callback error:', err);
    return redirectToSettings(request.nextUrl.origin, { error: message });
  }
}
