'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { Navigation } from '@/components/Navigation';
import { SubNav } from '@/components/SubNav';

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
      router.push('/login');
      router.refresh();
    } catch (e) {
      console.error('Logout failed', e);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-1/4 h-96 w-96 animate-pulse rounded-full bg-gradient-to-r from-gray-500/10 to-gray-600/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-80 w-80 animate-pulse rounded-full bg-gradient-to-r from-gray-600/10 to-gray-700/10 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-gradient-to-r from-gray-400/10 to-gray-500/10 blur-3xl" />
      </div>

      <Navigation user={initialUser} session={initialSession} onLogout={handleLogout} />

      {initialUser && <SubNav />}

      <main className="relative z-10 flex-1">{children}</main>

      <footer className="relative z-10 border-t border-white/10 bg-black/20 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-white/60">
              <span>Your input data is securely processed and not retained beyond generating the documentation.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

