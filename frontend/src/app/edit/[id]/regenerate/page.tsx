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

  // Verify user has access and get source settings
  const { data: repo } = await supabase
    .from('workspace_sources')
    .select('user_id, settings')
    .eq('id', document.source_id)
    .single();

  if (!repo || repo.user_id !== user.id) {
    notFound();
  }

  // Extract prompt config from repo settings
  const repoSettings = (repo.settings || {}) as {
    llm_prompt_config?: Record<string, unknown>;
    model?: string;
    document_structure?: Record<string, unknown>;
  };

  // Get regeneration settings from document if available, otherwise fall back to repo settings
  const regenerationSettings = (document as { configuration?: Record<string, unknown> }).configuration || {};

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
    source_meta: {
      repoId: document.source_id,
      llm_prompt_config: regenerationSettings || repoSettings.llm_prompt_config || null,
      model: regenerationSettings.model || repoSettings.model || null,
      document_structure: regenerationSettings.documentStructure || repoSettings.document_structure || null,
    },
    is_outdated: false
  };

  return <RegeneratePageClient submission={submission} />;
}
