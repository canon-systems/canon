'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, AlertTriangle, LockKeyhole } from 'lucide-react';

type PageState = 'loading' | 'ready' | 'invalid';

export function UpdatePasswordPageClient() {
  const supabase = createClient();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function checkSession() {
      const client = createClient();
      // Give Supabase time to process the recovery token from the URL (PKCE)
      await new Promise((r) => setTimeout(r, 300));
      const { data: { session } } = await client.auth.getSession();
      if (session) {
        setPageState('ready');
      } else {
        setPageState('invalid');
      }
    }
    checkSession();
  }, []);

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      window.location.assign('/auth/continue?next=/');
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  if (pageState === 'loading') {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--auth-page-bg)] px-4 py-10 sm:px-6 lg:px-8">
        <div className="relative z-10 flex items-center gap-2 text-[var(--text-secondary)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Verifying secure link...</span>
        </div>
      </main>
    );
  }

  if (pageState === 'invalid') {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--auth-page-bg)] px-4 py-10 sm:px-6 lg:px-8">
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(var(--auth-grid-line)_1px,transparent_1px),linear-gradient(90deg,var(--auth-grid-line)_1px,transparent_1px)] bg-[length:72px_72px] opacity-25" />
        <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center gap-6 rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--auth-panel-bg)] p-6 text-center shadow-[var(--shadow-md)]">
          <div className="space-y-3 text-center">
            <h1 className="type-auth-title">Link Expired or Invalid</h1>
            <p className="text-[var(--text-secondary)]">
              This password reset link may have expired or already been used. Request a new link from the login page.
            </p>
          </div>
          <Button asChild variant="default">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--auth-page-bg)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(var(--auth-grid-line)_1px,transparent_1px),linear-gradient(90deg,var(--auth-grid-line)_1px,transparent_1px)] bg-[length:72px_72px] opacity-25" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-xl items-center">
        <div className="w-full rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--auth-panel-bg)] p-5 text-[var(--text-primary)] shadow-[var(--shadow-lg)] sm:p-6">
          <div className="mb-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[8px] bg-[var(--canon-purple)] text-[15px] font-semibold text-[var(--text-on-accent)]">C</div>
            <h1 className="text-[28px] font-semibold leading-[1.12] tracking-normal text-[var(--text-primary)]">Set a New Password</h1>
            <p className="mt-3 text-[13px] leading-6 text-[var(--text-secondary)]">
              Use at least 8 characters. After the update, Canon will route you back to the right workspace step.
            </p>
          </div>

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[var(--text-secondary)]">New Password</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-placeholder)]" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    disabled={loading}
                    className="h-11 border-[var(--border-secondary)] bg-[var(--bg-primary)] pl-9 pr-10 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]"
                  />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={loading}
                  className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 border-0 text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </Button>
              </div>
              <div className={`flex items-center gap-2 type-caption ${password.length >= 8 ? 'text-[var(--green-text)]' : 'text-[var(--text-tertiary)]'}`}>
                <CheckCircle2 size={13} />
                <span>8 or more characters.</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-[var(--text-secondary)]">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                minLength={8}
                    autoComplete="new-password"
                placeholder="Confirm new password"
                    disabled={loading}
                className="h-11 border-[var(--border-secondary)] bg-[var(--bg-primary)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]"
                  />
            </div>

            {errorMsg && (
            <Alert variant="destructive" className="bg-[var(--bg-primary)]">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

            <Button
              type="submit"
              className="h-11 w-full rounded-[8px] bg-[var(--canon-purple)] text-[13px] text-[var(--text-on-accent)]"
              disabled={loading || !password || !confirmPassword}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating
                </>
              ) : (
                <>
                  Update password
                  <ArrowRight size={15} />
                </>
              )}
            </Button>

            <Button asChild type="button" variant="ghost" className="h-10 w-full text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]" disabled={loading}>
              <Link href="/login">Back to sign in</Link>
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
