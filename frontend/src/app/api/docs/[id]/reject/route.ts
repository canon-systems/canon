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

    const { data: submission, error } = await supabase
      .from<SubmissionRow>('submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !submission) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (submission.created_by !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sourceMeta = submission.source_meta || {};
    sourceMeta.approval_status = 'rejected';
    sourceMeta.rejected_at = new Date().toISOString();
    sourceMeta.rejected_by = user.id;
    if (reason) {
      sourceMeta.rejection_reason = reason;
    }

    await supabase
      .from<SubmissionRow>('submissions')
      .update({
        source_meta: sourceMeta,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return NextResponse.json(
      {
        success: true,
        doc_id: id,
        approval_status: 'rejected',
        rejected_at: sourceMeta.rejected_at,
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

