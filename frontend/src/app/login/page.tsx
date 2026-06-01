import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { safeRedirectPath } from '@/lib/authRedirect';
import { getSession } from '@/lib/auth';
import { getOrganizationForUser } from '@/lib/server/organization';
import { createClient } from '@/lib/supabase/server';
import { LoginPageClient } from './page-client';

export const metadata: Metadata = {
  title: 'Sign in | Canon',
  description: 'Sign in or create a Canon account to access technical go-to-market readiness workflows.',
};

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
    mode?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  const { user, session } = await getSession();

  if (user && session) {
    if (next !== '/onboarding/workspace') {
      redirect(`/auth/continue?next=${encodeURIComponent(next)}`);
    }

    const supabase = await createClient();
    const organization = await getOrganizationForUser(supabase, user);
    redirect(organization ? '/' : '/onboarding/workspace');
  }

  return (
    <LoginPageClient
      initialMode={params.mode === 'signup' ? 'signup' : 'login'}
      initialError={params.error === 'auth_callback' ? 'That sign-in link is invalid or expired. Request a new link and try again.' : null}
      nextPath={next}
    />
  );
}
