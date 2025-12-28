import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { encryptSecret } from '@/lib/server/oauth/tokenCrypto';
import { createNotionOAuthClient } from '@/lib/server/oauth/notionClient';
import { trackIntegrationConnected } from '@/lib/server/services/usageTracking';

export const runtime = 'nodejs';

const STATE_COOKIE = 'notion_oauth_state';
const VERIFIER_COOKIE = 'notion_oauth_verifier';

function redirectToSettings(origin: string, params: Record<string, string>) {
  const url = new URL('/settings', origin);
  url.searchParams.set('tab', 'integrations');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
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
    const redirectUri = new URL('/api/oauth/notion/callback', request.nextUrl.origin).toString();
    const client = createNotionOAuthClient(redirectUri);

    const tokenSet = await client.oauthCallback(
      redirectUri,
      { code, state: returnedState },
      { state: expectedState, code_verifier: codeVerifier }
    );

    const accessToken = tokenSet.access_token;
    if (!accessToken) {
      return redirectToSettings(request.nextUrl.origin, { error: 'Notion token exchange did not return an access token.' });
    }

    const supabase = await createClient();
    const { data: existingConnection } = await supabase
      .from('oauth_connections')
      .select('connection_id, metadata')
      .eq('user_id', user.id)
      .eq('provider', 'notion')
      .maybeSingle();

    const connectionId = existingConnection?.connection_id || crypto.randomUUID();
    const existingMetadata = (existingConnection?.metadata && typeof existingConnection.metadata === 'object')
      ? existingConnection.metadata
      : {};

    const raw: any = tokenSet as any;
    const providerAccountId = raw?.bot_id || raw?.owner?.user?.id || raw?.owner?.workspace?.id || null;

    const { error: connectionError } = await supabase
      .from('oauth_connections')
      .upsert(
        {
          user_id: user.id,
          provider: 'notion',
          connection_id: connectionId,
          status: 'active',
          metadata: {
            ...existingMetadata,
            source: 'native',
            connected_at: new Date().toISOString(),
            provider_account_id: providerAccountId,
            workspace_id: raw?.workspace_id || null,
            workspace_name: raw?.workspace_name || null,
            bot_id: raw?.bot_id || null,
            owner: raw?.owner || null,
            duplicated_template_id: raw?.duplicated_template_id || null,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );

    if (connectionError) {
      console.error('Failed to store Notion connection:', connectionError);
      return redirectToSettings(request.nextUrl.origin, { error: 'Failed to store Notion connection.' });
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
          provider: 'notion',
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
      console.error('Failed to store Notion tokens:', tokenError);
      return redirectToSettings(request.nextUrl.origin, { error: 'Failed to store Notion tokens.' });
    }

    await trackIntegrationConnected(supabase, user.id, 'notion', connectionId);
    return redirectToSettings(request.nextUrl.origin, { success: 'true', provider: 'notion' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Notion OAuth callback error:', err);
    return redirectToSettings(request.nextUrl.origin, { error: message });
  }
}

