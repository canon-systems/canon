import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getDocument, getDocumentFiles } from '@/lib/server/services/documentService';

/**
 * GET: Retrieve a document by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { id } = await params;

    // Get document
    const document = await getDocument(supabase, id);

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Verify user has access via workspace_repos
    const { data: repo } = await supabase
      .from('workspace_repos')
      .select('workspace_id')
      .eq('id', document.repo_id)
      .single();

    if (!repo || repo.workspace_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get file paths for this document
    const filePaths = await getDocumentFiles(supabase, id);

    // Get latest version
    const { data: latestVersion } = await supabase
      .from('document_versions')
      .select('version_number, change_summary, created_at')
      .eq('document_id', id)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json(
      {
        id: document.id,
        title: document.title,
        markdown: document.content,
        status: 'completed',
        approval_status: 'pending_review',
        created_at: document.created_at,
        updated_at: document.updated_at,
        input_type: 'github_repo',
        source_meta: {
          repoId: document.repo_id,
        },
        summary: document.content.replace(/\s+/g, ' ').slice(0, 200),
        error_message: null,
        is_outdated: false,
        code_snapshot: null,
        selected_files: filePaths,
        version: latestVersion?.version_number || 1,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Get doc error:', err);
    return NextResponse.json(
      {
        error: 'Failed to retrieve document',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

