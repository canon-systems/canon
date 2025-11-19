import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { EditDetailPageClient } from './page-client';

export default async function EditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { session } = await getSession();

  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('submissions')
    .select('id, created_at, title, markdown, status, error_message, input_type, input_content, summary, source_meta, is_outdated')
    .eq('id', id)
    .single();

  if (error || !data) {
    notFound();
  }

  const submission = {
    id: String(data.id),
    created_date: data.created_at as string,
    title: (data.title ?? 'Untitled') as string,
    markdown: (data.markdown ?? '') as string,
    status: data.status as 'processing' | 'completed' | 'failed',
    error_message: (data.error_message ?? null) as string | null,
    input_type: data.input_type as 'github_repo' | 'github_repo_directory' | 'zipped_folder' | 'pasted_code',
    input_content: (data.input_content ?? '') as string,
    summary: (data.summary ?? null) as string | null,
    source_meta: (data.source_meta ?? {}) as any,
    is_outdated: (data.is_outdated ?? false) as boolean
  };

  return <EditDetailPageClient submission={submission} />;
}

