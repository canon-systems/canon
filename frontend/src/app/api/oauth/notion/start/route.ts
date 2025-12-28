import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generators } from 'openid-client';
import { getSession } from '@/lib/auth';
import { createNotionOAuthClient } from '@/lib/server/oauth/notionClient';

export const runtime = 'nodejs';

const STATE_COOKIE = 'notion_oauth_state';

export async function GET(request: NextRequest) {
  const { user } = await getSession();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const redirectUri = new URL('/api/oauth/notion/callback', request.nextUrl.origin).toString();
  const client = createNotionOAuthClient(redirectUri);

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

  // Notion requires `owner=user` for user-level authorization.
  const authorizationUrl = client.authorizationUrl({
    owner: 'user',
    state,
  } as any);

  return NextResponse.redirect(authorizationUrl);
}

