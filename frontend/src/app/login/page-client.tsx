'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

export function LoginPageClient() {
  const supabase = createClient();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  function switchMode(next: 'login' | 'signup') {
    setMode(next);
    setErrorMsg(null);
    setInfoMsg(null);
  }

  async function handleSignup() {
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      const { data: signupData, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/overview`
        }
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      if (signupData.session) {
        // Wait a moment for cookies to sync, then redirect with full page reload
        await new Promise(resolve => setTimeout(resolve, 100));
        window.location.href = '/overview';
        return;
      }

      setInfoMsg('Check your email and click the confirmation link to finish sign up.');
      setLoading(false);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Something went wrong during sign up.');
      setLoading(false);
    }
  }

  async function handleLogin() {
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      // Verify session exists before redirecting
      if (data.session) {
        // Wait a moment for cookies to sync, then redirect with full page reload
        await new Promise(resolve => setTimeout(resolve, 100));
        window.location.href = '/overview';
        return;
      }

      setErrorMsg('Login failed - no session created');
      setLoading(false);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Something went wrong during login.');
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
        <div className="w-full space-y-6 lg:w-7/12">
          <div className="space-y-3">
            <Badge>Automated Knowledge Infrastructure</Badge>
            <h1 className="text-3xl font-semibold sm:text-4xl">
              {mode === 'login' ? 'Welcome back' : 'Create your workspace'}
            </h1>
            <p className="text-white/70">
              Sign {mode === 'login' ? 'in' : 'up'} to keep your documentation, architecture, and runbooks moving at the same pace as your code.
            </p>
          </div>

          <div className="inline-flex w-full rounded-full border border-white/10 bg-white/5 p-1">
            <Button
              type="button"
              variant={mode === 'login' ? 'default' : 'ghost'}
              className="flex-1"
              onClick={() => switchMode('login')}
              disabled={loading}
            >
              Sign in
            </Button>
            <Button
              type="button"
              variant={mode === 'signup' ? 'default' : 'ghost'}
              className="flex-1"
              onClick={() => switchMode('signup')}
              disabled={loading}
            >
              Create account
            </Button>
          </div>

          <Card>
            <CardContent className="space-y-4 p-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (mode === 'login') {
                    handleLogin();
                  } else {
                    handleSignup();
                  }
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !loading && email && password) {
                        e.preventDefault();
                        if (mode === 'login') {
                          handleLogin();
                        } else {
                          handleSignup();
                        }
                      }
                    }}
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'login' ? 'Enter your password' : 'Create a strong password'}
                    disabled={loading}
                  />
                </div>

                {mode === 'login' && (
                  <div className="flex items-center justify-between text-sm text-white/70">
                    <label className="flex items-center gap-2">
                      <Switch aria-label="Remember me" />
                      Remember me
                    </label>
                    <Button type="button" variant="ghost" size="sm" className="h-auto px-0 text-white/70 hover:text-white">
                      Forgot password?
                    </Button>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !email || !password}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                    </>
                  ) : (
                    mode === 'login' ? 'Sign in' : 'Create account'
                  )}
                </Button>
              </form>

              {mode === 'login' && (
                <p className="text-center text-sm text-white/70">
                  New to Canon?{' '}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto px-0 font-medium text-white hover:underline"
                    onClick={() => switchMode('signup')}
                  >
                    Create an account →
                  </Button>
                </p>
              )}
            </CardContent>
          </Card>

          {errorMsg && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {infoMsg && (
            <Alert variant="success">
              <Info className="h-4 w-4" />
              <AlertDescription>{infoMsg}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="w-full space-y-4 lg:w-5/12">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-white">Canon keeps your docs alive</CardTitle>
              <CardDescription>
                Minimal, reviewable updates grounded in your code so every page stays trustworthy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { title: 'Grounded changes', body: 'Every draft links back to the relevant diffs and owners.' },
                { title: 'Architecture ready', body: 'Auto-generated system views stay in sync with your repos.' },
                { title: 'Review, then publish', body: 'You control what ships while Canon keeps things current.' },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="text-sm text-white/70">{item.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
