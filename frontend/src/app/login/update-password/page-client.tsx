'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type PageState = 'loading' | 'ready' | 'invalid';

export function UpdatePasswordPageClient() {
  const supabase = createClient();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
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

      await new Promise(resolve => setTimeout(resolve, 100));
      window.location.href = '/signals';
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  if (pageState === 'loading') {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
        <div className="relative z-10 flex items-center gap-2 text-white/70">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Verifying link...</span>
        </div>
      </div>
    );
  }

  if (pageState === 'invalid') {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
        <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center gap-6">
          <div className="space-y-3 text-center">
            <h1 className="text-3xl font-semibold sm:text-4xl">Link Expired or Invalid</h1>
            <p className="text-white/70">
              This password reset link may have expired or already been used. Request a new link from the login page.
            </p>
          </div>
          <Button asChild variant="default">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center gap-8">
        <div className="w-full space-y-6">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold sm:text-4xl">Set New Password</h1>
            <p className="text-white/70">
              Enter your new password below. Use at least 6 characters.
            </p>
          </div>

          <Card>
            <CardContent className="space-y-4 p-6">
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                    disabled={loading}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !password || !confirmPassword}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update password'
                  )}
                </Button>

                <Button asChild type="button" variant="ghost" className="w-full text-white/70 hover:text-white" disabled={loading}>
                  <Link href="/login">Back to sign in</Link>
                </Button>
              </form>
            </CardContent>
          </Card>

          {errorMsg && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
