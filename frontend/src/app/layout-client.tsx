'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  const supabase = createClient();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const oldExp = initialSession?.expires_at ?? null;
      const newExp = newSession?.expires_at ?? null;

      if (oldExp !== newExp) {
        router.refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, router, initialSession]);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Logout failed', e);
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  const currentYear = new Date().getFullYear();

  return (
    <div className="app-shell">
      <div className="app-shell__backdrop" aria-hidden="true">
        <div className="app-shell__grid" />
      </div>

      <div className="app-layout">
      <Navigation user={initialUser} session={initialSession} onLogout={handleLogout} />

        <div className="app-layout__main">
          <main className="app-main">{children}</main>
          <footer className="app-footer">
            <div className="page-shell app-footer__content">
              <span>&copy; {currentYear} CodeSense. Built for teams who value clarity and signal.</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

