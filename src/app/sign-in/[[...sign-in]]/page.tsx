import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';

import { CLERK_SIGN_IN_PROPS } from '@/lib/clerk-config';

export const metadata: Metadata = {
  title: 'Sign in | Canon',
  description: 'Sign in to Canon.',
};

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--auth-page-bg)] px-4 py-10">
      <SignIn {...CLERK_SIGN_IN_PROPS} />
    </main>
  );
}
