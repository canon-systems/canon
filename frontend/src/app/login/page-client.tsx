'use client';

import React, { useState } from 'react';
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
    <div className="fixed inset-0 flex h-screen w-screen">
      {/* Left side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="w-full max-w-md space-y-8">
          {/* Logo/Brand area */}
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p className="text-white/70">
              {mode === 'login'
                ? 'Continue taking your brand from insights to action.'
                : 'Get started and take your brand from insights to action.'}
            </p>
          </div>

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
                placeholder="email@company.com"
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

            {/* Remember me / Forgot password */}
            {mode === 'login' && (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="remember"
                    className="h-4 w-4 rounded border-white/30 bg-white/5 text-gray-500 focus:ring-2 focus:ring-gray-400"
                  />
                  <Label htmlFor="remember" className="text-sm text-white/70 cursor-pointer">
                    Remember me
                  </Label>
                </div>
                <button
                  type="button"
                  className="text-sm text-white/70 hover:text-white transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Primary action button */}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !email || !password}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                mode === 'login' ? 'Sign in' : 'Create account'
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

          {/* Sign up link */}
          {mode === 'login' && (
            <p className="text-sm text-white/70 text-center">
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="text-white hover:underline font-medium"
              >
                Sign up for free →
              </button>
            </p>
          )}
        </div>
      </div>

      {/* Right side - Visual Design */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-gradient-to-br from-blue-500/20 via-cyan-500/15 to-teal-500/20">
        {/* Decorative background pattern */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.3) 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }} />
        </div>

        {/* Abstract shapes */}
        <div className="absolute top-20 right-20 w-64 h-64 bg-blue-400/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-80 h-80 bg-cyan-400/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-teal-400/15 rounded-full blur-3xl" />

        {/* Decorative floral/vine patterns */}
        <svg className="absolute inset-0 w-full h-full opacity-10" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M50,200 Q100,150 150,200 T250,200 T350,200" stroke="white" strokeWidth="2" fill="none" />
          <path d="M100,100 Q150,50 200,100 T300,100" stroke="white" strokeWidth="2" fill="none" />
          <path d="M50,300 Q100,250 150,300 T250,300 T350,300" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="100" cy="150" r="30" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="300" cy="250" r="40" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="200" cy="100" r="25" stroke="white" strokeWidth="2" fill="none" />
        </svg>

        {/* Content overlay (optional text or branding) */}
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="text-center space-y-6 max-w-md">
            <div className="space-y-4">
              <h2 className="text-4xl font-bold text-white/90">
                Sync
              </h2>
              <p className="text-lg text-white/70">
                Automated Knowledge Infrastructure
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

