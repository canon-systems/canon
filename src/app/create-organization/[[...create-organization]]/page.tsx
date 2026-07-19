import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { AUTH_ROUTES } from '@/lib/clerk-routes';
import { WorkspaceSetup } from './workspace-setup';

export const metadata: Metadata = {
  title: 'Workspace setup | Canon',
  description: 'Create or continue the workspace Canon should use.',
};

export default async function CreateOrganizationPage() {
  const authState = await auth();

  if (!authState.userId) {
    redirect(AUTH_ROUTES.signIn);
  }

  if (authState.orgId) {
    redirect(AUTH_ROUTES.afterSignIn);
  }

  return <WorkspaceSetup />;
}
