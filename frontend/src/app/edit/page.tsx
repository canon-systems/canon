import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { EditListPageClient } from './page-client';

export default async function EditPage() {
  const { session, user } = await getSession();

  if (!session) {
    redirect('/login');
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('submissions')
    .select('id, created_at, title, status, input_type, last_checked_at, is_outdated')
    .order('created_at', { ascending: false })
    .limit(30);

  const items = (data ?? []).map((row) => ({
    id: String(row.id),
    created_date: row.created_at as string,
    title: (row.title ?? 'Untitled') as string,
    status: row.status as 'processing' | 'completed' | 'failed',
    input_type: row.input_type as 'github_repo' | 'github_repo_directory' | 'zipped_folder' | 'pasted_code' | null,
    last_checked_at: row.last_checked_at as string | null,
    is_outdated: (row.is_outdated ?? false) as boolean
  }));

  return (
    <EditListPageClient
      user={user}
      items={items}
      loadError={error ? error.message : null}
    />
  );
}
