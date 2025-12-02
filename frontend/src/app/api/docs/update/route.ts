import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(repoUrl);
    if (u.hostname !== 'github.com' && !u.hostname.includes('github.com')) {
      return null;
    }
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
  } catch {
    return null;
  }
}

import { getDocument, getDocumentFiles } from '@/lib/server/services/documentService';

export async function POST(request: NextRequest) {
  let documentId: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    documentId = body.submissionId || body.documentId; // Support both for backward compatibility
    const previewContent = body.previewContent;

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    if (!previewContent || typeof previewContent !== 'string') {
      return NextResponse.json({ error: 'previewContent is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { user } = await getSession();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get document
    const document = await getDocument(supabase, documentId);
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Verify user has access
    const { data: repo } = await supabase
      .from('workspace_repos')
      .select('workspace_id, repo_url, default_branch')
      .eq('id', document.repo_id)
      .single();

    if (!repo || repo.workspace_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get next version number
    const { data: versionData } = await supabase.rpc('get_next_document_version', {
      doc_id: documentId
    });

    const versionNumber = versionData || 1;

    // Update document
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        content: previewContent.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Create new version
    await supabase.from('document_versions').insert({
      document_id: documentId,
      version_number: versionNumber,
      content: previewContent.trim(),
      change_summary: 'Document updated'
    });

    return NextResponse.json({
      success: true,
      submissionId: documentId, // Keep for backward compatibility
      documentId,
      message: 'Documentation updated successfully',
      workspaceUpdated: false,
      workspaceProvider: null
    });
  } catch (err: any) {
    console.error('Update document error:', err);
    return NextResponse.json({ error: 'Update failed', detail: String(err) }, { status: 500 });
  }
}

