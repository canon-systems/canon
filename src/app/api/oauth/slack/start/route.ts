import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generators } from 'openid-client';
import { getSession } from '@/lib/auth';
import { AUTH_ROUTES } from '@/lib/clerk-routes';
import { createLogger } from '@/lib/server/logging';
import { buildSlackAuthorizeUrl, getSlackOAuthScopes } from '@/lib/server/oauth/slackClient';

export const runtime = 'nodejs';

const STATE_COOKIE = 'slack_oauth_state';
const RETURN_TO_COOKIE = 'slack_oauth_return_to';
const log = createLogger('api.oauth.slack', {
  label: 'Slack OAuth',
  eventLabels: {
    oauth_start: 'OAuth Start',
  },
});

export async function GET(request: NextRequest) {
  const { user } = await getSession();
  if (!user) {
    return NextResponse.redirect(new URL(AUTH_ROUTES.signIn, request.url));
  }

  const state = generators.state();
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === 'production';

  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 10 * 60,
  });
  const requestedReturnTo = request.nextUrl.searchParams.get('returnTo');
  const returnTo = requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo
    : null;
  if (returnTo) {
    cookieStore.set(RETURN_TO_COOKIE, returnTo, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 10 * 60,
    });
  } else {
    cookieStore.delete(RETURN_TO_COOKIE);
  }

  const redirectUri = new URL('/api/oauth/slack/callback', request.nextUrl.origin).toString();
  const scopes = getSlackOAuthScopes();
  log.info('oauth_start', {
    userId: user.id,
    redirectUri,
    scopes: scopes.join(','),
  });

  const authorizationUrl = buildSlackAuthorizeUrl({
    redirectUri,
    state,
    scopes,
  });

  return NextResponse.redirect(authorizationUrl);
}
