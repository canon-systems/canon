'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('Auth state changed:', event, !!newSession);

      // Handle token refresh errors
      if (event === 'TOKEN_REFRESHED' && !newSession) {
        console.log('Token refresh failed, redirecting to login');
        router.push('/login');
        return;
      }

      // Handle sign out events
      if (event === 'SIGNED_OUT') {
        console.log('User signed out, redirecting to login');
        router.push('/login');
        return;
      }

      // Handle other session changes
      const oldExp = initialSession?.expires_at ?? null;
      const newExp = newSession?.expires_at ?? null;

      if (oldExp !== newExp) {
        console.log('Session expiration changed, refreshing page');
        router.refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, router, initialSession]);

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
      <div className="app-shell__backdrop" aria-hidden="true">
        <div className="app-shell__grid" />
      </div>

      <div className="app-layout">
        {!isLoginPage && (
          <Navigation user={initialUser} session={initialSession} onLogout={handleLogout} />
        )}

        <div className="app-layout__main">
          <main className="app-main">
            <div className="mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
