import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import SourcesPageClient from './page-client';

export default async function SourcesPage() {
  const { user } = await getSession();

  if (!user) {
    redirect('/login');
  }

  const supabase = await createClient();

  // Fetch sources (workspace_sources: GitHub repos, Jira projects, etc.)
  const { data: repositories, error: sourceError } = await supabase
    .from('workspace_sources')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (sourceError) {
    console.error('Failed to load sources:', sourceError);
  }

  return <SourcesPageClient repositories={repositories || []} />;
}
