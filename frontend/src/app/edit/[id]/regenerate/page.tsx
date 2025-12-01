import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { RegeneratePageClient } from './page-client';
import { getDocument } from '@/lib/server/services/documentService';

export default async function RegeneratePage({ params }: { params: Promise<{ id: string }> }) {
  const { session, user } = await getSession();

  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  const supabase = await createClient();
  
  // Get document
  const document = await getDocument(supabase, id);
  
  if (!document) {
    notFound();
  }

  // Verify user has access
  const { data: repo } = await supabase
    .from('workspace_repos')
    .select('workspace_id')
    .eq('id', document.repo_id)
    .single();

  if (!repo || repo.workspace_id !== user.id) {
    notFound();
  }

  // Format as submission for backward compatibility with client component
  const submission = {
    id: String(document.id),
    created_date: document.created_at as string,
    title: document.title ?? 'Untitled',
    markdown: document.content ?? '',
    status: 'completed' as const,
    error_message: null as string | null,
    input_type: 'github_repo' as const,
    input_content: '',
    summary: document.content.replace(/\s+/g, ' ').slice(0, 200),
    source_meta: { repoId: document.repo_id },
    is_outdated: false
  };

  return <RegeneratePageClient submission={submission} />;
}

