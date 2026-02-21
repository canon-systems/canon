import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generators } from 'openid-client';
import { getSession } from '@/lib/auth';
import { createAtlassianOAuthClient, getAtlassianOAuthScopes } from '@/lib/server/oauth/confluenceClient';
import { createLogger } from '@/lib/server/logging';

export const runtime = 'nodejs';

const STATE_COOKIE = 'confluence_oauth_state';
const VERIFIER_COOKIE = 'confluence_oauth_verifier';
const log = createLogger('oauth.atlassian.start', {
  label: 'Atlassian OAuth Start',
});

export async function GET(request: NextRequest) {
  const { user } = await getSession();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const redirectUri = new URL('/api/oauth/confluence/callback', request.nextUrl.origin).toString();
  const client = createAtlassianOAuthClient(redirectUri);

  const state = generators.state();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);

  const logFields = {
    userId: user.id,
    redirectUri,
    scopes: getAtlassianOAuthScopes().join(' '),
  };

  // Always emit to console for developer visibility without env flags
  console.info('[atlassian][oauth][start]', logFields);
  log.info('start_initiated', logFields);

  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === 'production';

  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 10 * 60,
  });
  cookieStore.set(VERIFIER_COOKIE, codeVerifier, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 10 * 60,
  });

  const authorizationUrl = client.authorizationUrl({
    scope: getAtlassianOAuthScopes().join(' '),
    state,
    audience: 'api.atlassian.com',
    prompt: 'consent',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return NextResponse.redirect(authorizationUrl);
}
