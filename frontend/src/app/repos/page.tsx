import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import RepositoriesPageClient from './page-client';

export default async function RepositoriesPage() {
  const { user } = await getSession();

  if (!user) {
    redirect('/login');
  }

  const supabase = await createClient();

  // Fetch sources (workspace_sources)
  const { data: repositories, error: repoError } = await supabase
    .from('workspace_sources')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (repoError) {
    console.error('Failed to load repositories:', repoError);
  }

  return <RepositoriesPageClient repositories={repositories || []} />;
}
