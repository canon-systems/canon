import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import KnowledgeClient from '../knowledge/page-client';

export default async function CanonHistoryPage() {
  const { session, user } = await getSession();

  if (!session) {
    redirect('/login');
  }

  const supabase = await createClient();
  const { data: sources, error } = await supabase
    .from('workspace_sources')
    .select('id, name, provider')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load sources:', error);
  }

  const canonSources = (sources || []).filter(
    (s) => (s?.provider ?? '').toString().toLowerCase() === 'github'
  );

  return <KnowledgeClient sources={canonSources} mode="diffs" showModeSwitcher={false} />;
}
