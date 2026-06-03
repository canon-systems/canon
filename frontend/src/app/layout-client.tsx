'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { isAuthApiError } from '@supabase/supabase-js';
import { Navigation } from '@/components/Navigation';
import { toast } from 'sonner';

const MILESTONE_GENERATION_STORAGE_KEY = 'canon-milestone-generation-run';

function activeMilestoneGenerationId() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(MILESTONE_GENERATION_STORAGE_KEY);
  if (!raw) return null;

  try {
    return (JSON.parse(raw) as { id?: string }).id ?? null;
  } catch {
    window.localStorage.removeItem(MILESTONE_GENERATION_STORAGE_KEY);
    return null;
  }
}

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

  const isAuthSurface =
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/onboarding/workspace' ||
    pathname.startsWith('/invite/accept');

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;

      let isAuthError = false;

      if (isAuthApiError(error)) {
        isAuthError =
          error.code === 'refresh_token_not_found' ||
          error.code === 'session_not_found' ||
          error.code === 'session_expired' ||
          error.code === 'refresh_token_already_used' ||
          error.status === 400 ||
          error.status === 401;
      } else if (error && typeof error === 'object') {
        const errorStatus = (error as { status?: number })?.status;
        const errorStack = (error as { stack?: string })?.stack || '';
        const isSupabaseAuthError =
          errorStack.includes('@supabase/auth-js') ||
          errorStack.includes('GoTrueClient') ||
          errorStack.includes('_refreshAccessToken') ||
          errorStack.includes('_callRefreshToken');
        isAuthError = isSupabaseAuthError || errorStatus === 400 || errorStatus === 401;
      }

      if (isAuthError) {
        const errorMessage = error?.message || String(error);
        console.log('Unhandled auth error detected, clearing session:', errorMessage);
        event.preventDefault();
        supabase.auth.signOut({ scope: 'local' }).then(() => {
          if (pathname !== '/login') router.push('/login');
        }).catch(() => {
          if (pathname !== '/login') router.push('/login');
        });
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      try {
        if (event === 'TOKEN_REFRESHED' && !newSession) {
          await supabase.auth.signOut({ scope: 'local' });
          if (pathname !== '/login') router.push('/login');
          return;
        }
        if (event === 'SIGNED_OUT') {
          if (pathname !== '/login') router.push('/login');
          return;
        }
        const oldExp = initialSession?.expires_at ?? null;
        const newExp = newSession?.expires_at ?? null;
        if (oldExp !== newExp) router.refresh();
      } catch (error) {
        console.error('Error in auth state change handler:', error);
        try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
        if (pathname !== '/login') router.push('/login');
      }
    });

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      subscription.unsubscribe();
    };
  }, [supabase, router, initialSession, pathname]);

  useEffect(() => {
    if (isAuthSurface || pathname.startsWith('/milestones')) return undefined;

    let stopped = false;
    async function checkMilestoneGeneration() {
      const runId = activeMilestoneGenerationId();
      if (!runId || stopped) return;

      try {
        const res = await fetch('/api/onboarding/milestones');
        if (!res.ok) return;
        const data = (await res.json()) as {
          latest_generation?: {
            id: string;
            status: 'queued' | 'running' | 'completed' | 'failed';
            error_message: string | null;
          } | null;
        };
        const run = data.latest_generation;
        if (!run || run.id !== runId) return;

        if (run.status === 'completed') {
          window.localStorage.removeItem(MILESTONE_GENERATION_STORAGE_KEY);
          toast.success('Readiness milestones are ready for review');
        } else if (run.status === 'failed') {
          window.localStorage.removeItem(MILESTONE_GENERATION_STORAGE_KEY);
          toast.error('Readiness milestone generation failed', {
            description: run.error_message ?? 'Open Readiness Milestones and try generating drafts again.',
          });
        }
      } catch {
        // Keep polling; this is a notification convenience, not critical path UI.
      }
    }

    void checkMilestoneGeneration();
    const interval = window.setInterval(checkMilestoneGeneration, 5000);

    return () => {
      stopped = true;
      if (interval) window.clearInterval(interval);
    };
  }, [isAuthSurface, pathname]);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Logout failed:', e);
    } finally {
      await new Promise(resolve => setTimeout(resolve, 100));
      window.location.href = '/login';
    }
  }

  if (isAuthSurface) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-page)' }}>
      <Navigation user={initialUser} session={initialSession} onLogout={handleLogout} />
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
}
