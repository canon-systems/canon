'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, AlertTriangle, Info } from 'lucide-react';

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
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="w-full max-w-md">
        <Card className="border border-white/10 bg-gradient-to-b from-white/5 to-white/0 shadow-lg">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-2xl font-semibold text-white text-center">
              {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </CardTitle>
            <CardDescription className="text-white/70 text-center">
              {mode === 'login' 
                ? 'Sign in to your account to continue' 
                : 'Get started by creating a new account'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Toggle buttons to switch between forms */}
            <div className="inline-flex rounded-lg border border-white/20 bg-white/10 p-1 w-full">
              <Button
                type="button"
                variant={mode === 'login' ? 'default' : 'ghost'}
                className={`flex-1 ${mode === 'login' ? '' : 'opacity-60'}`}
                onClick={() => switchMode('login')}
                disabled={loading}
              >
                Login
              </Button>
              <Button
                type="button"
                variant={mode === 'signup' ? 'default' : 'ghost'}
                className={`flex-1 ${mode === 'signup' ? '' : 'opacity-60'}`}
                onClick={() => switchMode('signup')}
                disabled={loading}
              >
                Sign up
              </Button>
            </div>

            <Separator />

            {/* Form */}
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
              {/* Email field */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  disabled={loading}
                />
              </div>

              {/* Password field */}
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
                  placeholder={mode === 'login' ? 'Your password' : 'Create a strong password'}
                  disabled={loading}
                />
              </div>

              {/* Primary action button */}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !email || !password}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {mode === 'login' ? 'Logging in...' : 'Creating account...'}
                  </>
                ) : (
                  mode === 'login' ? 'Log in' : 'Create account'
                )}
              </Button>
            </form>

            {/* Error and info messages */}
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

            {/* Small hint for new users */}
            <p className="text-sm text-white/60 text-center">
              If your project uses email confirmation, check your inbox for a link. After you click it, you
              will land on the Overview page.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

