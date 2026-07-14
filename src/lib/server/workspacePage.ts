import { redirect } from 'next/navigation';

import { AUTH_ROUTES } from '@/lib/clerk-routes';
import { getSession } from '@/lib/auth';
import { requireWorkspace } from '@/lib/server/organization';

export async function requireWorkspacePage() {
  const { user, session } = await getSession();
  if (!session || !user) redirect(AUTH_ROUTES.signIn);

  try {
    const { organization } = await requireWorkspace(user);
    return { user, session, organization };
  } catch (error) {
    const status = error instanceof Error && 'status' in error ? error.status : null;
    if (status === 428) redirect(AUTH_ROUTES.createOrganization);
    throw error;
  }
}
