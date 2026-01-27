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

  const sourceId = document.source_id;
  const { data: repo } = await supabase
    .from('workspace_sources')
    .select('user_id')
    .eq('id', sourceId)
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

  const pendingMetadata = (pending as { metadata?: Record<string, unknown> } | null)?.metadata || {};
  const rejectedAt = typeof pendingMetadata.rejected_at === 'string' ? pendingMetadata.rejected_at : '';
  const model = typeof pendingMetadata.model === 'string' ? pendingMetadata.model : '';
  const affectedFiles = Array.isArray(pendingMetadata.affected_files) ? pendingMetadata.affected_files : [];

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
        model,
        changeSummary: pending.change_summary || '',
        affectedFiles,
        status: pending.status === 'rejected' ? 'rejected' : 'pending',
        rejectedAt,
      } : null}
    />
  );
}
