import { redirect } from 'next/navigation';

import { getSession } from '@/lib/auth';
import { getOrganizationForUser } from '@/lib/server/organization';
import { createClient } from '@/lib/supabase/server';

export async function requireWorkspacePage() {
  const { user, session } = await getSession();
  if (!session || !user) redirect('/login');

  const supabase = await createClient();
  const organization = await getOrganizationForUser(supabase, user);
  if (!organization) redirect('/onboarding/workspace');

  return { user, session, organization };
}
