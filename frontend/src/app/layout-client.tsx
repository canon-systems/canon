'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { isAuthApiError } from '@supabase/supabase-js';
import { Navigation } from '@/components/Navigation';

export function RootLayoutClient({
  children,
  user: initialUser,
  session: initialSession,
}: {
  children: React.ReactNode;
  user: User | null;
  session: Session | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  
  // Hide navigation on login page
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    // Add global error handler for unhandled promise rejections from auth
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      
      // Use Supabase's recommended error checking utilities
      let isAuthError = false;
      
      if (isAuthApiError(error)) {
        // Check for refresh token and session-related error codes as per Supabase docs
        isAuthError = 
          error.code === 'refresh_token_not_found' ||
          error.code === 'session_not_found' ||
          error.code === 'session_expired' ||
          error.code === 'refresh_token_already_used' ||
          error.status === 400 ||
          error.status === 401;
      } else if (error && typeof error === 'object') {
        // Fallback for non-Supabase errors that might be auth-related
        const errorStatus = (error as { status?: number })?.status;
        const errorStack = (error as { stack?: string })?.stack || '';
        
        // Check stack trace for Supabase auth library calls
        const isSupabaseAuthError = errorStack.includes('@supabase/auth-js') || 
                                     errorStack.includes('GoTrueClient') ||
                                     errorStack.includes('_refreshAccessToken') ||
                                     errorStack.includes('_callRefreshToken');
        
        isAuthError = isSupabaseAuthError || errorStatus === 400 || errorStatus === 401;
      }

      if (isAuthError) {
        const errorMessage = error?.message || String(error);
        console.log('Unhandled auth error detected, clearing session:', errorMessage);
        event.preventDefault(); // Prevent default error logging
        // Clear session and redirect
        supabase.auth.signOut({ scope: 'local' }).then(() => {
          if (pathname !== '/login') {
            router.push('/login');
          }
        }).catch(() => {
          // If signOut fails, still redirect
          if (pathname !== '/login') {
            router.push('/login');
          }
        });
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      try {
        console.log('Auth state changed:', event, !!newSession);

        // Handle token refresh errors
        if (event === 'TOKEN_REFRESHED' && !newSession) {
          console.log('Token refresh failed, redirecting to login');
          await supabase.auth.signOut({ scope: 'local' });
          if (pathname !== '/login') {
            router.push('/login');
          }
          return;
        }

        // Handle sign out events
        if (event === 'SIGNED_OUT') {
          console.log('User signed out, redirecting to login');
          if (pathname !== '/login') {
            router.push('/login');
          }
          return;
        }

        // Handle other session changes
        const oldExp = initialSession?.expires_at ?? null;
        const newExp = newSession?.expires_at ?? null;

        if (oldExp !== newExp) {
          console.log('Session expiration changed, refreshing page');
          router.refresh();
        }
      } catch (error) {
        console.error('Error in auth state change handler:', error);
        // On any error, clear session and redirect to login
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // Ignore signOut errors
        }
        if (pathname !== '/login') {
          router.push('/login');
        }
      }
    });

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      subscription.unsubscribe();
    };
  }, [supabase, router, initialSession, pathname]);

  async function handleLogout() {
    try {
      console.log('Attempting logout...');
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
        // If there's an auth error during logout, clear local session anyway
        if (error.message?.includes('refresh_token') || error.status === 400) {
          console.log('Clearing local session due to refresh token error');
        }
      } else {
        console.log('Logout successful');
      }
    } catch (e) {
      console.error('Logout failed with exception:', e);
    } finally {
      // Always redirect to login, even if logout fails
      // Wait a moment for any pending operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      window.location.href = '/login';
    }
  }

  return (
    <div className="app-shell">
      {/* Grid background (same as sources page) for every page */}
      <div className="app-shell__backdrop" aria-hidden="true">
        <div className="app-shell__grid" />
      </div>

      <div className="app-layout">
        {!isLoginPage && (
          <Navigation user={initialUser} session={initialSession} onLogout={handleLogout} />
        )}

        <div className="app-layout__main">
          <main className="app-main px-4 py-4 md:px-6 md:py-4 lg:px-8 lg:py-4">
            <div className="w-full">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
