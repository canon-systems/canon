'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { IconCheck, IconLoader2, IconX } from '@tabler/icons-react';

import { loginPathForNext } from '@/lib/authRedirect';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const loginPath = loginPathForNext(`/invite/accept?token=${encodeURIComponent(token)}`);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Accepting invitation...');

  useEffect(() => {
    let cancelled = false;

    async function acceptInvite() {
      if (!token) {
        setStatus('error');
        setMessage('Invitation token is missing.');
        return;
      }

      try {
        const res = await fetch('/api/workspace/invitations/accept', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (cancelled) return;
        if (res.status === 401) throw new Error('Sign in or create an account with the invited email to accept this workspace invitation.');
        if (!res.ok) throw new Error(data.error ?? 'Unable to accept invitation.');
        setStatus('success');
        setMessage('You have joined the workspace.');
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Unable to accept invitation.');
      }
    }

    void acceptInvite();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)] px-4">
      <Card className="w-full max-w-md px-6 py-7 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--bg-tertiary)] text-[var(--text-primary)]">
          {status === 'loading' && <IconLoader2 size={20} className="animate-spin" />}
          {status === 'success' && <IconCheck size={20} />}
          {status === 'error' && <IconX size={20} />}
        </div>
        <h1 className="type-page-title text-[var(--text-primary)]">Workspace Invitation</h1>
        <p className="type-body mt-2 text-[var(--text-secondary)]">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          {status === 'error' && (
            <Button variant="secondary" onClick={() => router.push(loginPath)}>
              Sign In
            </Button>
          )}
          <Button onClick={() => router.push('/settings?tab=org')} disabled={status === 'loading'}>
            Open Workspace
          </Button>
        </div>
      </Card>
    </div>
  );
}
