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
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
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

    // If there's an error getting the user, continue without auth checks
    if (error) {
      return NextResponse.next();
    }

    // Protected routes (updated to match current routes)
    const pathname = request.nextUrl.pathname;
    const isProtectedRoute =
      pathname === '/documentation' ||
      pathname === '/history' ||
      pathname === '/logs' ||
      pathname === '/architecture';

    if (!user && isProtectedRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    // Redirect logged-in users away from login
    if (user && request.nextUrl.pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
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

