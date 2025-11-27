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
    sourceMeta.approval_status = 'approved';
    sourceMeta.approved_at = new Date().toISOString();
    sourceMeta.approved_by = user.id;

    await supabase
      .from<SubmissionRow>('submissions')
      .update({
        source_meta: sourceMeta,
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

