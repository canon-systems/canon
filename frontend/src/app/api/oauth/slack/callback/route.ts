import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { encryptSecret } from '@/lib/server/oauth/tokenCrypto';
import { exchangeSlackCode } from '@/lib/server/oauth/slackClient';
import { trackIntegrationConnected } from '@/lib/server/services/usageTracking';

export const runtime = 'nodejs';

const STATE_COOKIE = 'slack_oauth_state';

function redirectToSettings(origin: string, params: Record<string, string>) {
  const url = new URL('/settings', origin);
  url.searchParams.set('tab', 'integrations');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function computeExpiresAt(payload: { expires_in?: number; expires_at?: number }): string | null {
  if (typeof payload.expires_in === 'number') {
    return new Date(Date.now() + payload.expires_in * 1000).toISOString();
  }
  if (typeof payload.expires_at === 'number') {
    return new Date(payload.expires_at * 1000).toISOString();
  }
  return null;
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
  cookieStore.delete(STATE_COOKIE);

  if (!code || !returnedState || !expectedState) {
    return redirectToSettings(request.nextUrl.origin, { error: 'Missing OAuth callback parameters.' });
  }

  if (returnedState !== expectedState) {
    return redirectToSettings(request.nextUrl.origin, { error: 'Invalid OAuth state. Please try again.' });
  }

  try {
    const redirectUri = new URL('/api/oauth/slack/callback', request.nextUrl.origin).toString();
    const tokenSet = await exchangeSlackCode({ code, redirectUri });
    const accessToken = tokenSet.access_token;

    if (!accessToken) {
      return redirectToSettings(request.nextUrl.origin, { error: 'Slack token exchange did not return an access token.' });
    }

    const supabase = await createClient();
    const { data: existingConnection } = await supabase
      .from('oauth_connections')
      .select('connection_id, metadata')
      .eq('user_id', user.id)
      .eq('provider', 'slack')
      .maybeSingle();

    const connectionId = existingConnection?.connection_id || crypto.randomUUID();
    const existingMetadata = isRecord(existingConnection?.metadata) ? existingConnection.metadata : {};
    const team = isRecord(tokenSet.team) ? tokenSet.team : {};
    const enterprise = isRecord(tokenSet.enterprise) ? tokenSet.enterprise : {};
    const authedUser = isRecord(tokenSet.authed_user) ? tokenSet.authed_user : {};
    const providerAccountId =
      (typeof tokenSet.bot_user_id === 'string' ? tokenSet.bot_user_id : null) ||
      (typeof authedUser.id === 'string' ? authedUser.id : null) ||
      (typeof team.id === 'string' ? team.id : null);

    const { error: connectionError } = await supabase
      .from('oauth_connections')
      .upsert(
        {
          user_id: user.id,
          provider: 'slack',
          connection_id: connectionId,
          status: 'active',
          metadata: {
            ...existingMetadata,
            source: 'oauth',
            connected_at: new Date().toISOString(),
            team_id: typeof team.id === 'string' ? team.id : null,
            team_name: typeof team.name === 'string' ? team.name : null,
            enterprise_id: typeof enterprise.id === 'string' ? enterprise.id : null,
            enterprise_name: typeof enterprise.name === 'string' ? enterprise.name : null,
            bot_user_id: typeof tokenSet.bot_user_id === 'string' ? tokenSet.bot_user_id : null,
            app_id: typeof tokenSet.app_id === 'string' ? tokenSet.app_id : null,
            authed_user_id: typeof authedUser.id === 'string' ? authedUser.id : null,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );

    if (connectionError) {
      console.error('Failed to store Slack connection:', connectionError);
      return redirectToSettings(request.nextUrl.origin, { error: 'Failed to store Slack connection.' });
    }

    const admin = createServiceRoleClient();
    const { error: tokenError } = await admin
      .from('oauth_provider_tokens')
      .upsert(
        {
          connection_id: connectionId,
          user_id: user.id,
          provider: 'slack',
          provider_account_id: providerAccountId,
          access_token: encryptSecret(accessToken),
          refresh_token: tokenSet.refresh_token ? encryptSecret(tokenSet.refresh_token) : null,
          token_type: tokenSet.token_type || null,
          scope: tokenSet.scope || (typeof authedUser.scope === 'string' ? authedUser.scope : null),
          expires_at: computeExpiresAt(tokenSet),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'connection_id' }
      );

    if (tokenError) {
      console.error('Failed to store Slack tokens:', tokenError);
      return redirectToSettings(request.nextUrl.origin, { error: 'Failed to store Slack tokens.' });
    }

    await trackIntegrationConnected(supabase, user.id, 'slack', connectionId);
    return redirectToSettings(request.nextUrl.origin, { success: 'true', provider: 'slack' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Slack OAuth callback error:', err);
    return redirectToSettings(request.nextUrl.origin, { error: message });
  }
}
