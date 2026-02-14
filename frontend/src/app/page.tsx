import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const { session, user } = await getSession();

  if (!session || !user) {
    redirect('/login');
  }

  const supabase = await createClient();
  const { data: sources } = await supabase
    .from('workspace_sources')
    .select('id, provider, status_payload')
    .eq('user_id', user.id)
    .in('provider', ['github', 'jira']);

  const hasReadySource = (sources || []).some((source) => {
    const statusPayload =
      source.status_payload && typeof source.status_payload === 'object'
        ? (source.status_payload as Record<string, unknown>)
        : {};
    const status = typeof statusPayload.status === 'string' ? statusPayload.status.toLowerCase() : '';
    return status === 'ready' || status === 'draft_ready';
  });

  if (!hasReadySource) {
    redirect('/sources');
  }

  redirect('/signals');
}
