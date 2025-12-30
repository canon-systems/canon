import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

type ReviewAction = 'approve' | 'reject';

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const documentId = body.documentId;
    const action = body.action as ReviewAction | undefined;
    const requestId = body.requestId as string | undefined;

    if (!documentId || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json(
        { error: 'documentId and action (approve/reject) are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, repo_id, content')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const { data: repo } = await supabase
      .from('workspace_repos')
      .select('user_id')
      .eq('id', document.repo_id)
      .single();

    if (!repo || repo.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let pendingQuery = supabase
      .from('document_versions')
      .select('id, content, metadata, change_summary')
      .eq('document_id', documentId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    if (requestId) {
      pendingQuery = pendingQuery.eq('id', requestId);
    }

    const { data: pending, error: pendingError } = await pendingQuery.maybeSingle();

    if (pendingError || !pending) {
      return NextResponse.json({ error: 'No pending review found' }, { status: 404 });
    }

    if (action === 'approve') {
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          content: pending.content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to update document', detail: updateError.message },
          { status: 500 }
        );
      }

      await supabase
        .from('document_versions')
        .update({
          status: 'approved',
          metadata: {
            ...(pending.metadata || {}),
            approved_at: new Date().toISOString(),
          },
        })
        .eq('id', pending.id);
    } else {
      await supabase
        .from('document_versions')
        .update({
          status: 'rejected',
          metadata: {
            ...(pending.metadata || {}),
            rejected_at: new Date().toISOString(),
          },
        })
        .eq('id', pending.id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Review update error:', err);
    return NextResponse.json(
      { error: 'Failed to process review', detail: err.message || String(err) },
      { status: 500 }
    );
  }
}
