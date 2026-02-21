import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { user } = await getSession();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const url = new URL('/settings', request.nextUrl.origin);
  url.searchParams.set('tab', 'integrations');
  url.searchParams.set('error', 'Notion integration is currently archived.');
  return NextResponse.redirect(url);
}
