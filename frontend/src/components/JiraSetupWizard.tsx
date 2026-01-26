'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const total = setup?.total_files || 0;
  const done = setup?.summarized_files || 0;
  const progress = typeof setup?.progress_percentage === 'number'
    ? Math.round(setup.progress_percentage)
    : total > 0
      ? Math.round((done / total) * 100)
      : 0;

  const stage = setup?.processing_status || (status === 'ready' ? 'complete' : status === 'failed' ? 'failed' : 'starting');
  const stageLabel =
    stage.includes('starting') ? 'Starting' :
      stage.includes('scanning') ? 'Scanning issues' :
        stage.includes('ready') || status === 'ready' ? 'Complete' :
          stage.includes('failed') || status === 'failed' ? 'Failed' :
            'Indexing';

  async function cancelSetup() {
    setCancelling(true);
    try {
      await fetch(`/api/repos/setup?repoId=${repoId}`, { method: 'DELETE' });
      router.push('/repos');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card className="border-white/10 bg-black/60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Jira Setup</CardTitle>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
              status === 'ready' ? 'bg-emerald-500/20 text-emerald-200'
                : status === 'failed' ? 'bg-red-500/20 text-red-200'
                  : status === 'analyzing' ? 'bg-blue-500/20 text-blue-200'
                    : 'bg-white/10 text-white/70'
            }`}>
              {status}
            </span>
          </div>
          <CardDescription className="text-white/70">
            Index Jira issues so diffs can run quickly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-red-300">{error}</p>}

          <div className="grid grid-cols-2 gap-4 text-sm text-white/70">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="text-xs uppercase text-white/50">Stage</div>
              <div className="mt-1 text-lg text-white">{stageLabel}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="text-xs uppercase text-white/50">Issues Indexed</div>
              <div className="mt-1 text-lg text-white">{done} / {total}</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>

          <div className="flex justify-end">
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push('/repos')}>
                Back to Sources
              </Button>
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
        </CardContent>
      </Card>
    </div>
  );
}
