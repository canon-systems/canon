import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

type SubmissionRow = {
  source_meta?: Record<string, unknown>;
  created_by?: string;
};

/**
 * POST: Reject a document
 * Proxies to FastAPI backend /api/docs/{docId}/reject
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
    const body = await request.json().catch(() => ({}));
    const { reason } = body as { reason?: string };

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

    // Update document exports with rejection status
    const { data: currentDocument } = await supabase
      .from('documents')
      .select('exports')
      .eq('id', id)
      .single();

    const existingExports = (currentDocument?.exports || []) as Array<Record<string, unknown>>;
    const updatedExports = existingExports.map(exp => {
      if (exp.status === 'pending_review' || exp.status === 'approved') {
        return {
          ...exp,
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          rejected_by: user.id,
          rejection_reason: reason || exp.rejection_reason,
        };
      }
      return exp;
    });

    await supabase
      .from('documents')
      .update({
        exports: updatedExports,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json(
      {
        success: true,
        doc_id: id,
        approval_status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejected_by: user.id,
        reason,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Reject doc error:', err);
    return NextResponse.json(
      {
        error: 'Failed to reject document',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

