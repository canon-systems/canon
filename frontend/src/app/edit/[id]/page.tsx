import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { EditDetailPageClient } from './page-client';
import { getDocument, getDocumentFiles } from '@/lib/server/services/documentService';

export default async function EditDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  // Verify user has access and get repo settings
  const { data: repo } = await supabase
    .from('workspace_repos')
    .select('user_id, settings, repo_url, default_branch')
    .eq('id', document.repo_id)
    .single();

  if (!repo || repo.user_id !== user.id) {
    notFound();
  }

  // Get repository setup to get the branch used for setup
  const { data: setup } = await supabase
    .from('repository_setup')
    .select('branch')
    .eq('repo_id', document.repo_id)
    .single();

  // Get file paths
  const filePaths = await getDocumentFiles(supabase, id);

  // Extract prompt config from repo settings
  const repoSettings = (repo.settings || {}) as {
    llm_prompt_config?: any;
    model?: string;
    document_structure?: any;
  };

  // Get configuration from document if available, otherwise fall back to repo settings
  const documentConfig = document.configuration || {};
  const regenerationSettings = documentConfig;

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
      repoId: document.repo_id,
      repoUrl: repo.repo_url,
      branch: setup?.branch || repo.default_branch || 'main',
      llm_prompt_config: regenerationSettings || repoSettings.llm_prompt_config || null,
      model: regenerationSettings.model || repoSettings.model || null,
      document_structure: regenerationSettings.documentStructure || repoSettings.document_structure || null,
    },
    code_snapshot: null as any,
    is_outdated: false,
    selected_files: filePaths
  };

  return <EditDetailPageClient submission={submission} />;
}
