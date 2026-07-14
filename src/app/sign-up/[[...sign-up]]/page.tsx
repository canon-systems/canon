import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';

import { CLERK_SIGN_UP_PROPS } from '@/lib/clerk-config';

export const metadata: Metadata = {
  title: 'Sign up | Canon',
  description: 'Create a Canon account.',
};

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--auth-page-bg)] px-4 py-10">
      <SignUp {...CLERK_SIGN_UP_PROPS} />
    </main>
  );
}
