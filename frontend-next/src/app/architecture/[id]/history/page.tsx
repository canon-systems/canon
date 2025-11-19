import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getArchitectureDiagram } from '@/lib/server/architecture/persistence';
import { getVersionHistory } from '@/lib/server/architecture/versions';
import { ArchitectureHistoryClient } from './page-client';

export default async function ArchitectureHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getSession();

  if (!user) {
    redirect('/login');
  }

  const supabase = await createClient();
  const diagram = await getArchitectureDiagram(supabase, id);

  if (!diagram) {
    redirect('/architecture/manage');
  }

  if (diagram.user_id !== user.id) {
    redirect('/architecture/manage');
  }

  const history = await getVersionHistory(supabase, id);

  return <ArchitectureHistoryClient diagram={diagram} history={history} />;
}

