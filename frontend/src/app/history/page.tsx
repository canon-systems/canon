import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import HistoryPageClient from './page-client';

export default async function HistoryPage() {
  const { session, user } = await getSession();

  if (!session || !user) {
    redirect('/login');
  }

  const supabase = await createClient();
  const { data: sources, error } = await supabase
    .from('workspace_sources')
    .select('id, name, provider')
    .eq('user_id', user.id)
    .in('provider', ['github', 'jira'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load sources for history:', error);
  }

  return <HistoryPageClient sources={sources || []} />;
}
