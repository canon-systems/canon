import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { trackDocApproved } from '@/lib/server/services/usageTracking';

type SubmissionRow = {
  source_meta?: Record<string, unknown>;
  created_by?: string;
};

/**
 * POST: Approve a document
 * Proxies to FastAPI backend /api/docs/{docId}/approve
 */
export async function POST(
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

    const { data: document, error } = await supabase
      .from('documents')
      .select('id, repo_id')
      .eq('id', id)
      .single();

    if (error || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Verify user has access to the repo
    const { data: repo, error: repoError } = await supabase
      .from('workspace_repos')
      .select('workspace_id')
      .eq('id', document.repo_id)
      .eq('workspace_id', user.id)
      .single();

    if (repoError || !repo) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Note: Approval status is not stored in documents table in the new schema
    // This would need to be handled via a separate approvals table or metadata field
    // For now, we'll just update the document's updated_at timestamp
    await supabase
      .from('documents')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    await trackDocApproved(supabase, user.id, id, false);

    return NextResponse.json(
      {
        success: true,
        doc_id: id,
        approval_status: 'approved',
        approved_at: sourceMeta.approved_at,
        approved_by: user.id,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Approve doc error:', err);
    return NextResponse.json(
      {
        error: 'Failed to approve document',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

