import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generators } from 'openid-client';
import { getSession } from '@/lib/auth';
import { createNotionOAuthClient } from '@/lib/server/oauth/notionClient';

export const runtime = 'nodejs';

const STATE_COOKIE = 'notion_oauth_state';
const VERIFIER_COOKIE = 'notion_oauth_verifier';

export async function GET(request: NextRequest) {
  const { user } = await getSession();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const redirectUri = new URL('/api/oauth/notion/callback', request.nextUrl.origin).toString();
  const client = createNotionOAuthClient(redirectUri);

  const state = generators.state();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);

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

  // Notion requires `owner=user` for user-level authorization.
  const authorizationUrl = client.authorizationUrl({
    owner: 'user',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  } as any);

  return NextResponse.redirect(authorizationUrl);
}

