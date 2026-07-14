'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { toast } from 'sonner';
import { isAuthRoute } from '@/lib/clerk-routes';

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

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const authSurface = isAuthRoute(pathname);

  useEffect(() => {
    if (authSurface || pathname.startsWith('/milestones')) return undefined;

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
      window.clearInterval(interval);
    };
  }, [authSurface, pathname]);

  if (authSurface) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-page)' }}>
      <Navigation />
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
