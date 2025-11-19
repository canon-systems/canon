'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginPageClient() {
  const router = useRouter();
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
          emailRedirectTo: `${window.location.origin}/submit`
        }
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (signupData.session) {
        router.push('/submit');
        router.refresh();
        return;
      }

      setInfoMsg('Check your email and click the confirmation link to finish sign up.');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Something went wrong during sign up.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      router.push('/submit');
      router.refresh();
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Something went wrong during login.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6 text-white">
      <h1 className="mb-6 text-3xl font-semibold">Login or Sign up</h1>

      {/* Toggle buttons to switch between forms */}
      <div className="mb-6 inline-flex rounded-lg border border-white/20 bg-white/10">
        <button
          type="button"
          className={`px-4 py-2 text-sm ${mode === 'login' ? 'bg-white/20 font-medium' : 'opacity-80'}`}
          onClick={() => switchMode('login')}
          disabled={loading}
        >
          Login
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm ${mode === 'signup' ? 'bg-white/20 font-medium' : 'opacity-80'}`}
          onClick={() => switchMode('signup')}
          disabled={loading}
        >
          Sign up
        </button>
      </div>

      {/* Shared email field */}
      <div className="mb-3">
        <label className="mb-1 block text-sm text-white/80">Email</label>
        <input
          type="email"
          className="w-full rounded bg-white/10 px-3 py-2 outline-none ring-1 ring-white/20 focus:ring-2 focus:ring-sky-400"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
          disabled={loading}
        />
      </div>

      {/* Shared password field */}
      <div className="mb-4">
        <label className="mb-1 block text-sm text-white/80">Password</label>
        <input
          type="password"
          className="w-full rounded bg-white/10 px-3 py-2 outline-none ring-1 ring-white/20 focus:ring-2 focus:ring-sky-400"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder={mode === 'login' ? 'Your password' : 'Create a strong password'}
          disabled={loading}
        />
      </div>

      {/* Primary action button changes by mode */}
      {mode === 'login' ? (
        <button
          className="w-full rounded bg-sky-500 px-4 py-2 font-medium hover:bg-sky-600 disabled:opacity-50"
          onClick={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      ) : (
        <button
          className="w-full rounded bg-indigo-500 px-4 py-2 font-medium hover:bg-indigo-600 disabled:opacity-50"
          onClick={(e) => {
            e.preventDefault();
            handleSignup();
          }}
          disabled={loading}
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      )}

      {/* Error and info messages for the user */}
      {errorMsg && (
        <div className="mt-4 rounded border border-rose-400/30 bg-rose-500/10 p-3 text-rose-200">
          {errorMsg}
        </div>
      )}

      {infoMsg && (
        <div className="mt-4 rounded border border-amber-400/30 bg-amber-500/10 p-3 text-amber-200">
          {infoMsg}
        </div>
      )}

      {/* Small hint for new users */}
      <p className="mt-6 text-sm text-white/60">
        If your project uses email confirmation, check your inbox for a link. After you click it, you
        will land on the Submit page.
      </p>
    </div>
  );
}

