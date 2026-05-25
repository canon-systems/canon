'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle, Info } from 'lucide-react';

export function LoginPageClient() {
  const supabase = createClient();

  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  function switchMode(next: 'login' | 'signup' | 'forgot') {
    setMode(next);
    setErrorMsg(null);
    setInfoMsg(null);
  }

  async function handleForgotPassword() {
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login/update-password`,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      setInfoMsg('Check your email for a link to reset your password. The link expires in 1 hour.');
      setLoading(false);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
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
          emailRedirectTo: `${window.location.origin}/`
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
        window.location.href = '/';
        return;
      }

      setInfoMsg('Check your email and click the confirmation link to finish sign up.');
      setLoading(false);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong during sign up.');
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
        window.location.href = '/';
        return;
      }

      setErrorMsg('Login failed - no session created');
      setLoading(false);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong during login.');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-page)] px-4 py-10">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-8">
        <div className="w-full space-y-6">
          <div className="space-y-3">
            <h1 className="type-auth-title">
              {mode === 'forgot' ? 'Reset Your Password' : mode === 'login' ? 'Welcome Back' : 'Create Your Workspace'}
            </h1>
            <p className="text-[var(--text-secondary)]">
              {mode === 'forgot'
                ? 'Enter your email and we\'ll send you a link to set a new password.'
                : `Sign ${mode === 'login' ? 'in' : 'up'} to keep your GTM hires productive and your whole team field-ready.`}
            </p>
          </div>

          {mode !== 'forgot' && (
            <div className="inline-flex w-full rounded-full border border-[var(--border-tertiary)] bg-[var(--bg-secondary)] p-1">
              <Button
                type="button"
                variant={mode === 'login' ? 'default' : 'ghost'}
                className="flex-1"
                onClick={() => switchMode('login')}
                disabled={loading}
              >
                Sign In
              </Button>
              <Button
                type="button"
                variant={mode === 'signup' ? 'default' : 'ghost'}
                className="flex-1"
                onClick={() => switchMode('signup')}
                disabled={loading}
              >
                Create Account
              </Button>
            </div>
          )}

          <Card>
            <CardContent className="space-y-4 p-6">
              {mode === 'forgot' ? (
                <>
                  <div className="space-y-2">
                    <h2 className="type-metric-sm">Reset Your Password</h2>
                    <p className="type-body text-[var(--text-secondary)]">
                      Enter your email and we&apos;ll send you a link to set a new password.
                    </p>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleForgotPassword();
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">Email</Label>
                      <Input
                        id="forgot-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        placeholder="you@company.com"
                        disabled={loading}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading || !email}>
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Send Reset Link'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      onClick={() => switchMode('login')}
                      disabled={loading}
                    >
                      Back to Sign In
                    </Button>
                  </form>
                </>
              ) : (
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
                    <div className="flex items-center justify-end type-body text-[var(--text-secondary)]">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto px-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        onClick={() => switchMode('forgot')}
                      >
                        Forgot Password?
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
                        {mode === 'login' ? 'Signing In...' : 'Creating Account...'}
                      </>
                    ) : (
                      mode === 'login' ? 'Sign In' : 'Create Account'
                    )}
                  </Button>
                </form>
              )}

              {mode === 'login' && (
                <p className="text-center type-body text-[var(--text-secondary)]">
                  New to Canon?{' '}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto px-0 font-medium text-[var(--text-primary)] hover:underline"
                    onClick={() => switchMode('signup')}
                  >
                    Create an Account →
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
      </div>
    </div>
  );
}
