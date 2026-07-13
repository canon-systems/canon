import type { Metadata } from 'next';
import { CreateOrganization } from '@clerk/nextjs';

import { AUTH_ROUTES } from '@/lib/clerk-routes';

export const metadata: Metadata = {
  title: 'Create organization | Canon',
  description: 'Create or choose the organization Canon should use as your workspace.',
};

export default function CreateOrganizationPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--auth-page-bg)] px-4 py-10">
      <CreateOrganization
        afterCreateOrganizationUrl={AUTH_ROUTES.afterSignIn}
      />
    </main>
  );
}
