import { type NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

function hasLikelySupabaseSessionCookie(request: NextRequest): boolean {
  const cookies = request.cookies.getAll();
  return cookies.some(({ name, value }) => {
    if (!value || value === 'deleted') return false;
    if (name === 'sb-access-token' || name === 'sb-refresh-token' || name === 'supabase-auth-token') {
      return true;
    }
    if (!name.startsWith('sb-')) return false;
    return name.includes('-auth-token') || name.includes('-refresh-token') || name.includes('-access-token');
  });
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const protectedPrefixes = ['/sources', '/view', '/history', '/logs', '/settings', '/docs', '/architecture-diagrams'];
  const isProtectedRoute = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  const hasSession = hasLikelySupabaseSessionCookie(request);
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
