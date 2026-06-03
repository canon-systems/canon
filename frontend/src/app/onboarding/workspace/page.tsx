import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth';
import { getOrganizationForUser } from '@/lib/server/organization';
import { createClient } from '@/lib/supabase/server';
import { WorkspaceOnboardingClient } from './page-client';

export const metadata: Metadata = {
  title: 'Workspace setup | Canon',
  description: 'Create or join a Canon workspace for technical go-to-market readiness.',
};

export default async function WorkspaceOnboardingPage() {
  const { user, session } = await getSession();
  if (!session || !user) redirect('/login');

  const supabase = await createClient();
  const organization = await getOrganizationForUser(supabase, user);
  if (organization) redirect('/');

  return (
    <WorkspaceOnboardingClient
      userEmail={user.email ?? ''}
      initialFirstName={typeof user.user_metadata?.first_name === 'string' ? user.user_metadata.first_name : ''}
      initialLastName={typeof user.user_metadata?.last_name === 'string' ? user.user_metadata.last_name : ''}
    />
  );
}
