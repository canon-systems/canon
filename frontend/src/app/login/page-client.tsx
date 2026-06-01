'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Eye, EyeOff, Info, Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';

import { safeRedirectPath } from '@/lib/authRedirect';
import { createClient } from '@/lib/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AuthMode = 'login' | 'signup' | 'forgot';

type LoginPageClientProps = {
  initialMode: Extract<AuthMode, 'login' | 'signup'>;
  initialError: string | null;
  nextPath: string;
};

function authErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'The email or password does not match an account. Check both fields or reset your password.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Confirm your email before signing in. Check your inbox for the Canon confirmation link.';
  }
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'An account already exists for this email. Sign in or reset your password.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Wait a moment, then try again.';
  }
  return message;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function LoginPageClient({ initialMode, initialError, nextPath }: LoginPageClientProps) {
  const supabase = createClient();

  const safeNextPath = useMemo(() => safeRedirectPath(nextPath), [nextPath]);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const emailValue = normalizeEmail(email);
  const isInviteFlow = safeNextPath.startsWith('/invite/accept');
  const passwordIsStrong = password.length >= 8;
  const canSubmitAuth = Boolean(emailValue && password && (mode === 'login' || passwordIsStrong));
  const continuePath = `/auth/continue?next=${encodeURIComponent(safeNextPath)}`;

  function switchMode(next: AuthMode) {
    setMode(next);
    setErrorMsg(null);
    setInfoMsg(null);
  }

  async function handleForgotPassword() {
    setErrorMsg(null);
    setInfoMsg(null);
    if (!emailValue) {
      setErrorMsg('Enter your email so we can send a reset link.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailValue, {
        redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent('/login/update-password')}`,
      });

      if (error) {
        setErrorMsg(authErrorMessage(error.message));
        setLoading(false);
        return;
      }

      setInfoMsg('Check your email for a secure reset link. You can close this tab after the message arrives.');
      setLoading(false);
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  async function handleSignup() {
    setErrorMsg(null);
    setInfoMsg(null);
    if (!emailValue || !passwordIsStrong) {
      setErrorMsg('Enter a valid email and a password with at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const { data: signupData, error } = await supabase.auth.signUp({
        email: emailValue,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(safeNextPath)}`,
        },
      });

      if (error) {
        setErrorMsg(authErrorMessage(error.message));
        setLoading(false);
        return;
      }

      if (signupData.user?.identities && signupData.user.identities.length === 0) {
        setInfoMsg('If this email already has an account, sign in or reset the password. Otherwise, check your inbox for the confirmation link.');
        setLoading(false);
        return;
      }

      if (signupData.session) {
        window.location.assign(continuePath);
        return;
      }

      setInfoMsg('Check your inbox and confirm your email. We will send you straight back to the right next step.');
      setLoading(false);
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Something went wrong during sign up.');
      setLoading(false);
    }
  }

  async function handleLogin() {
    setErrorMsg(null);
    setInfoMsg(null);
    if (!emailValue || !password) {
      setErrorMsg('Enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailValue,
        password,
      });

      if (error) {
        setErrorMsg(authErrorMessage(error.message));
        setLoading(false);
        return;
      }

      if (data.session) {
        window.location.assign(continuePath);
        return;
      }

      setErrorMsg('Sign in did not create a session. Try again in a new tab.');
      setLoading(false);
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Something went wrong during login.');
      setLoading(false);
    }
  }

  const title = mode === 'forgot' ? 'Reset Your Password' : mode === 'signup' ? 'Create Your Canon Account' : 'Welcome Back to Canon';
  const description = mode === 'forgot'
    ? 'We will send a secure link that signs you in long enough to set a new password.'
    : isInviteFlow
      ? 'Sign in with the invited email so Canon can attach you to the right workspace.'
      : 'Access the workspace where technical GTM teams manage readiness, source context, and launch alignment.';

  return (
    <main className="grid min-h-screen bg-[var(--auth-page-bg)] text-[var(--text-primary)] lg:grid-cols-2">
      <section className="flex min-h-screen flex-col bg-[var(--auth-panel-bg)] px-5 py-6 sm:px-8 lg:px-14 xl:px-20">
        <div className="flex items-center justify-between">
          <div className="text-[26px] font-semibold leading-none tracking-normal text-[var(--text-primary)]">Canon</div>
          <div className="hidden items-center gap-2 rounded-[8px] border border-[var(--canon-purple-border)] bg-[var(--canon-purple-light)] px-3 py-2 text-[12px] font-medium text-[var(--canon-purple-dark)] sm:flex">
            <ShieldCheck size={14} />
            Secure access
          </div>
        </div>

        <div className="flex flex-1 items-center py-10">
          <div className="mx-auto w-full max-w-[520px]">
            <div className="mb-8">
              <h1 className="text-[30px] font-semibold leading-[1.1] tracking-normal text-[var(--text-primary)]">{title}</h1>
              <p className="mt-3 max-w-[420px] text-[15px] leading-6 text-[var(--text-tertiary)]">{description}</p>
              {safeNextPath !== '/onboarding/workspace' && (
                <div className="mt-5 flex items-start gap-2 rounded-[8px] border border-[var(--canon-purple-border)] bg-[var(--canon-purple-soft)] px-3 py-2 text-[12px] leading-5 text-[var(--text-secondary)]">
                  <Info size={15} className="mt-0.5 shrink-0 text-[var(--canon-purple)]" />
                  <span>After authentication, you will continue to {isInviteFlow ? 'the workspace invitation' : safeNextPath}.</span>
                </div>
              )}
            </div>

            {mode !== 'forgot' && (
              <div className="mb-6 grid grid-cols-2 rounded-[8px] border border-[var(--border-tertiary)] bg-[var(--bg-tertiary)] p-1">
                <button
                  type="button"
                  className={`h-10 rounded-[7px] text-[13px] font-medium transition ${mode === 'login' ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                  onClick={() => switchMode('login')}
                  disabled={loading}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`h-10 rounded-[7px] text-[13px] font-medium transition ${mode === 'signup' ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                  onClick={() => switchMode('signup')}
                  disabled={loading}
                >
                  Create account
                </button>
              </div>
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (mode === 'forgot') void handleForgotPassword();
                else if (mode === 'login') void handleLogin();
                else void handleSignup();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[13px] font-semibold text-[var(--text-secondary)]">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-placeholder)]" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                    placeholder="email@company.com"
                    disabled={loading}
                    className="h-12 rounded-[6px] border-[var(--border-secondary)] bg-[var(--bg-primary)] pl-11 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus-visible:border-[var(--canon-purple)] focus-visible:ring-[var(--canon-purple)]/15"
                  />
                </div>
              </div>

              {mode !== 'forgot' && (
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[13px] font-semibold text-[var(--text-secondary)]">Password</Label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-placeholder)]" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={mode === 'signup' ? 8 : undefined}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder={mode === 'login' ? 'Enter your password' : 'Create at least 8 characters'}
                      disabled={loading}
                      className="h-12 rounded-[6px] border-[var(--border-secondary)] bg-[var(--bg-primary)] pl-11 pr-10 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus-visible:border-[var(--canon-purple)] focus-visible:ring-[var(--canon-purple)]/15"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((current) => !current)}
                      disabled={loading}
                      className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 border-0 text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </Button>
                  </div>
                  {mode === 'signup' && (
                    <div className={`flex items-center gap-2 text-[12px] ${passwordIsStrong ? 'text-[var(--green-text)]' : 'text-[var(--text-tertiary)]'}`}>
                      {passwordIsStrong ? <CheckCircle2 size={13} /> : <Check size={13} />}
                      <span>Use at least 8 characters.</span>
                    </div>
                  )}
                </div>
              )}

              {mode === 'login' && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto px-0 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-transparent hover:text-[var(--text-primary)]"
                    onClick={() => switchMode('forgot')}
                    disabled={loading}
                  >
                    Forgot password?
                  </Button>
                </div>
              )}

              {(errorMsg || infoMsg) && (
                <Alert variant={errorMsg ? 'destructive' : 'success'} className="bg-[var(--bg-primary)]">
                  {errorMsg ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                  <AlertDescription>{errorMsg ?? infoMsg}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="h-12 w-full rounded-[6px] bg-[var(--canon-purple)] text-[14px] font-semibold text-[var(--text-on-accent)] shadow-[var(--brand-shadow)] hover:bg-[var(--canon-purple-hover)]"
                disabled={loading || (mode === 'forgot' ? !emailValue : !canSubmitAuth)}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {mode === 'login' ? 'Signing in' : mode === 'signup' ? 'Creating account' : 'Sending link'}
                  </>
                ) : (
                  <>
                    {mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
                    <ArrowRight size={15} />
                  </>
                )}
              </Button>

              {mode === 'forgot' ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 w-full text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                  onClick={() => switchMode('login')}
                  disabled={loading}
                >
                  Back to sign in
                </Button>
              ) : (
                <div className="pt-3 text-center text-[13px] leading-5 text-[var(--text-secondary)]">
                  {mode === 'login' ? 'New to Canon?' : 'Already have an account?'}{' '}
                  <button
                    type="button"
                    className="font-semibold text-[var(--canon-purple-dark)] underline-offset-4 hover:underline"
                    onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                    disabled={loading}
                  >
                    {mode === 'login' ? 'Create an account' : 'Sign in'}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      </section>

      <section className="relative hidden min-h-screen overflow-hidden bg-[var(--auth-illustration-bg)] lg:block">
        <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(var(--auth-grid-line)_1px,transparent_1px),linear-gradient(90deg,var(--auth-grid-line)_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="absolute inset-0 [background:var(--auth-illustration-overlay)]" />
        <div className="absolute inset-y-0 left-1/4 w-px bg-[var(--auth-illustration-line)]" />
        <div className="absolute inset-x-0 top-1/3 h-px bg-[var(--auth-illustration-line)]" />

        <div className="relative flex min-h-screen items-center justify-center px-10">
          <div className="w-full max-w-[560px]">
            <div className="relative mx-auto aspect-square max-w-[520px]">
              <div className="absolute left-[8%] top-[10%] h-[74%] w-[74%] border border-[var(--canon-purple-strong-border)] bg-[var(--auth-panel-bg-translucent)] shadow-[0_24px_80px_rgba(107,92,231,0.14)]" />
              <div className="absolute right-[4%] top-[2%] h-[36%] w-[46%] border border-[var(--border-strong)] bg-[var(--auth-illustration-card)]" />
              <div className="absolute bottom-[8%] left-[2%] h-[30%] w-[44%] border border-[var(--border-strong)] bg-[var(--auth-illustration-card)]" />
              <div className="absolute left-[18%] top-[22%] h-[56%] w-[56%] border border-[var(--canon-purple)] bg-[var(--auth-page-bg-translucent)] p-5">
                <div className="flex h-full flex-col justify-between">
                  <div className="space-y-3">
                    <div className="h-2 w-24 rounded-full bg-[var(--canon-purple)]" />
                    <div className="h-2 w-40 rounded-full bg-[var(--auth-grid-line)]" />
                    <div className="h-2 w-28 rounded-full bg-[var(--canon-purple-border)]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-20 border border-[var(--canon-purple-border)] bg-[var(--auth-illustration-card-strong)]" />
                    <div className="h-20 border border-[var(--canon-purple-border)] bg-[var(--auth-illustration-card)]" />
                    <div className="h-20 border border-[var(--canon-purple-border)] bg-[var(--auth-illustration-card)]" />
                    <div className="h-20 border border-[var(--canon-purple-border)] bg-[var(--bg-secondary-translucent)]" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[var(--canon-purple)]" />
                    <div className="h-2 w-16 rounded-full bg-[var(--auth-grid-line)]" />
                    <div className="h-2 w-10 rounded-full bg-[var(--canon-purple-border)]" />
                  </div>
                </div>
              </div>
              <div className="absolute right-[12%] top-[46%] h-16 w-16 border border-[var(--canon-purple)] bg-[var(--canon-purple-wash)]" />
              <div className="absolute bottom-[16%] right-[18%] h-3 w-28 bg-[var(--canon-purple)]" />
              <div className="absolute left-[12%] top-[72%] h-3 w-20 bg-[var(--canon-purple-muted)]" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
