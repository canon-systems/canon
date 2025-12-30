import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getDocument } from '@/lib/server/services/documentService';
import { ReviewPageClient } from './page-client';

interface ReviewPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    review?: string;
  }>;
}

export default async function ReviewPage({ params, searchParams }: ReviewPageProps) {
  const { session, user } = await getSession();

  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const reviewId = resolvedSearchParams?.review;
  const supabase = await createClient();

  const document = await getDocument(supabase, id);
  if (!document) {
    redirect('/documentation?tab=edit');
  }

  const { data: repo } = await supabase
    .from('workspace_repos')
    .select('user_id')
    .eq('id', document.repo_id)
    .single();

  if (!repo || repo.user_id !== user.id) {
    redirect('/documentation?tab=edit');
  }

  let pendingQuery = supabase
    .from('document_versions')
    .select('id, content, created_at, change_summary, metadata, status')
    .eq('document_id', id);

  if (reviewId) {
    pendingQuery = pendingQuery
      .eq('id', reviewId)
      .in('status', ['pending', 'rejected']);
  } else {
    pendingQuery = pendingQuery
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);
  }

  const { data: pending } = await pendingQuery.maybeSingle();

  const pendingMetadata = (pending as any)?.metadata || {};
  const rejectedAt = typeof pendingMetadata.rejected_at === 'string' ? pendingMetadata.rejected_at : '';

  if (!pending) {
    redirect('/review');
  }

  return (
    <ReviewPageClient
      documentId={document.id}
      title={document.title || 'Untitled'}
      currentContent={document.content || ''}
      pending={pending ? {
        id: pending.id,
        content: pending.content,
        createdAt: pending.created_at,
        model: pendingMetadata.model || '',
        changeSummary: pending.change_summary || '',
        affectedFiles: Array.isArray(pendingMetadata.affected_files) ? pendingMetadata.affected_files : [],
        status: pending.status === 'rejected' ? 'rejected' : 'pending',
        rejectedAt,
      } : null}
    />
  );
}
