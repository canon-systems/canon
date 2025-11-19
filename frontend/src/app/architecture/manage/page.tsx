import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { listUserDiagrams } from '@/lib/server/architecture/persistence';
import { ArchitectureManageClient } from './page-client';

export default async function ArchitectureManagePage() {
  const { user } = await getSession();
  
  if (!user) {
    redirect('/login');
  }

  const supabase = await createClient();
  const diagrams = await listUserDiagrams(supabase, user.id);

  return <ArchitectureManageClient initialDiagrams={diagrams} />;
}


