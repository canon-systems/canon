'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Clock, Database, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

type JiraSetupWizardProps = {
  repoId: string;
};

type SetupResponse = {
  setup?: {
    status?: string;
    setup_status?: string;
    total_files?: number;
    summarized_files?: number;
    progress_percentage?: number;
    error_message?: string | null;
    processing_status?: string;
  } | null;
  status?: string;
  error?: string;
};

export function JiraSetupWizard({ repoId }: JiraSetupWizardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [setup, setSetup] = useState<SetupResponse['setup']>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  async function fetchStatus() {
    try {
      const response = await fetch(`/api/repos/setup?repoId=${repoId}`);
      const data = (await response.json()) as SetupResponse;
      if (!response.ok) {
        throw new Error(data?.error || data?.status || 'Failed to load setup status');
      }
      setSetup(data.setup || null);
      if (data?.setup?.setup_status === 'failed') {
        setError(data.setup.error_message || 'Jira setup failed.');
      } else {
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load setup status');
    }
  }

  async function startSetup() {
    setLoading(true);
    try {
      const response = await fetch('/api/repos/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to start setup');
      }
      await fetchStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to start setup');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
  }, [repoId]);

  const status = setup?.setup_status || setup?.status || 'not_started';
  const total = setup?.total_files || 0;
  const done = setup?.summarized_files || 0;
  const progress = typeof setup?.progress_percentage === 'number'
    ? Math.round(setup.progress_percentage)
    : total > 0
      ? Math.round((done / total) * 100)
      : status === 'ready'
        ? 100
        : 0;

  const phase = useMemo(() => {
    if (status === 'ready') return 'complete';
    if (status === 'failed') return 'failed';
    if (status === 'analyzing') {
      if ((setup?.processing_status || '').includes('scanning') || progress < 5) return 'scanning';
      if (progress < 20) return 'preparing';
      return 'indexing';
    }
    return 'idle';
  }, [status, setup?.processing_status, progress]);

  useEffect(() => {
    if (status === 'analyzing') {
      const t = setInterval(fetchStatus, 3000);
      return () => clearInterval(t);
    }
    return undefined;
  }, [status]);

  useEffect(() => {
    if (status === 'ready' || status === 'failed' || status === 'cancelled') {
      const t = setTimeout(() => {
        router.push('/repos');
      }, 2000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [status, router]);
  const stageLabel =
    phase === 'idle' ? 'Ready to start' :
      phase === 'scanning' ? 'Scanning issues' :
        phase === 'preparing' ? 'Preparing index' :
          phase === 'indexing' ? 'Indexing issues' :
            phase === 'complete' ? 'Complete' :
              'Failed';

  async function cancelSetup() {
    setCancelling(true);
    try {
      await fetch(`/api/repos/setup?repoId=${repoId}`, { method: 'DELETE' });
      router.push('/repos');
    } finally {
      setCancelling(false);
    }
  }

  useEffect(() => {
    if (status === 'analyzing' && !startedAt) {
      setStartedAt(Date.now());
    }
    if (status !== 'analyzing' && startedAt) {
      setStartedAt(null);
    }
  }, [status, startedAt]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Card className="border-white/10 bg-black/60">
        <CardHeader className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-white">Jira Setup</CardTitle>
              <CardDescription className="text-white/70">
                Index Jira issues so diffs and automation can run quickly.
              </CardDescription>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
              status === 'ready' ? 'bg-emerald-500/20 text-emerald-200'
                : status === 'failed' ? 'bg-red-500/20 text-red-200'
                  : status === 'analyzing' ? 'bg-blue-500/20 text-blue-200'
                    : 'bg-white/10 text-white/70'
            }`}>
              {status}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className={`rounded-lg border border-white/10 p-4 ${phase === 'indexing' ? 'bg-blue-500/10' : 'bg-white/5'}`}>
              <div className="flex items-center gap-2 text-sm text-white/80">
                <Database className="h-4 w-4 text-blue-300" />
                Jira Index
              </div>
              <p className="mt-2 text-xs text-white/60">
                {phase === 'idle' && 'Ready to scan your Jira project for changes.'}
                {phase === 'scanning' && 'Scanning issues and change history.'}
                {phase === 'preparing' && 'Preparing the index for fast diffs.'}
                {phase === 'indexing' && 'Indexing issues for daily updates.'}
                {phase === 'complete' && 'Index complete and ready to use.'}
                {phase === 'failed' && 'Indexing failed. See details below.'}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2 text-sm text-white/80">
                <ListChecks className="h-4 w-4 text-emerald-300" />
                Setup Steps
              </div>
              <ul className="mt-2 space-y-1 text-xs text-white/60">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                  Jira source connected
                </li>
                <li className="flex items-center gap-2">
                  {status === 'ready' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                  ) : status === 'analyzing' ? (
                    <Clock className="h-3.5 w-3.5 text-blue-300" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-white/40" />
                  )}
                  Index Jira issues
                </li>
              </ul>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && <p className="text-sm text-red-300">{error}</p>}

          <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-white/70">Stage</p>
                <p className="text-lg text-white">{stageLabel}</p>
              </div>
              <div className="text-sm text-white/70">
                Issues indexed: <span className="text-white">{done}</span> / {total}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
              {status === 'analyzing' && startedAt && (
                <p className="text-xs text-white/50">
                  Working… {Math.max(1, Math.floor((Date.now() - startedAt) / 1000))}s elapsed
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="secondary" onClick={() => router.push('/repos')}>
              Back to Sources
            </Button>
            <div className="flex gap-2">
              {status === 'analyzing' && (
                <Button variant="destructive" onClick={cancelSetup} disabled={cancelling}>
                  {cancelling ? 'Cancelling…' : 'Cancel Setup'}
                </Button>
              )}
              <Button onClick={startSetup} disabled={loading || status === 'analyzing'}>
                {status === 'analyzing' ? 'Indexing…' : 'Start Jira Setup'}
              </Button>
            </div>
          </div>

          {status === 'failed' && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Jira setup failed. Try again or return to sources.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
