import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Middleware runs on Edge Runtime by default (required for Vercel)
// All dependencies must be Edge-compatible (no Node.js APIs like __dirname)
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

export async function middleware(request: NextRequest) {
  try {
    // Check if environment variables are set
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      // If Supabase is not configured, just continue without auth checks
      return NextResponse.next();
    }

    // Protected routes - declare early
    const pathname = request.nextUrl.pathname;
    const protectedPrefixes = ['/sources', '/canon-view', '/canon-history', '/logs', '/settings', '/docs', '/architecture-diagrams'];
    const isProtectedRoute = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

    let supabaseResponse = NextResponse.next({
      request,
    });

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: { [key: string]: unknown } }>) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // Refresh session if expired - required for Server Components
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    // Handle specific auth errors that require session cleanup
    if (error) {
      // Check for refresh token related errors
      const isRefreshTokenError = error.message?.includes('refresh_token_not_found') ||
                                  error.message?.includes('Invalid Refresh Token') ||
                                  error.message?.includes('refresh token') ||
                                  error.status === 400;

      if (isRefreshTokenError) {
        console.log('Refresh token error detected, clearing session cookies');

        // Clear all auth-related cookies to prevent further errors
        const response = NextResponse.next();
        response.cookies.delete('sb-access-token');
        response.cookies.delete('sb-refresh-token');
        response.cookies.delete('supabase-auth-token');

        // For protected routes, redirect to login
        if (isProtectedRoute) {
          const url = request.nextUrl.clone();
          url.pathname = '/login';
          return NextResponse.redirect(url);
        }

        return response;
      }

      // For other auth errors, continue without auth checks
      return NextResponse.next();
    }

    if (!user && isProtectedRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    // Redirect logged-in users away from login
    if (user && request.nextUrl.pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/canon-view';
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (error) {
    // If anything fails, just continue without auth checks
    // This prevents the middleware from breaking the entire app
    console.error('Middleware error:', error);
    return NextResponse.next();
  }
}
