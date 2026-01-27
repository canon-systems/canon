import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

type ReviewAction = 'approve' | 'reject' | 'delete';

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

    if (!documentId || (action !== 'approve' && action !== 'reject' && action !== 'delete')) {
      return NextResponse.json(
        { error: 'documentId and action (approve/reject/delete) are required' },
        { status: 400 }
      );
    }

    if (action === 'delete' && !requestId) {
      return NextResponse.json(
        { error: 'requestId is required to delete a review' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    let versionClient = supabase;

    try {
      versionClient = createServiceRoleClient();
    } catch (err) {
      console.warn('Review updates using user client (service role unavailable).', err);
    }

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, source_id, content')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const sourceId = document.source_id;
    const { data: repo } = await supabase
      .from('workspace_sources')
      .select('user_id')
      .eq('id', sourceId)
      .single();

    if (!repo || repo.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const statusFilter = action === 'reject'
      ? ['pending']
      : action === 'delete'
        ? ['rejected']
        : ['pending', 'rejected'];

    let pendingQuery = supabase
      .from('document_versions')
      .select('id, content, metadata, change_summary, status')
      .eq('document_id', documentId)
      .in('status', statusFilter)
      .order('created_at', { ascending: false })
      .limit(1);

    if (requestId) {
      pendingQuery = pendingQuery.eq('id', requestId);
    }

    const { data: pending, error: pendingError } = await pendingQuery.maybeSingle();

    if (pendingError || !pending) {
      return NextResponse.json({ error: 'No review found' }, { status: 404 });
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

      const { error: versionError } = await versionClient
        .from('document_versions')
        .update({
          status: 'approved',
          metadata: {
            ...(pending.metadata || {}),
            approved_at: new Date().toISOString(),
          },
        })
        .eq('id', pending.id);

      if (versionError) {
        return NextResponse.json(
          { error: 'Failed to update review status', detail: versionError.message },
          { status: 500 }
        );
      }
    } else if (action === 'reject') {
      const { error: versionError } = await versionClient
        .from('document_versions')
        .update({
          status: 'rejected',
          metadata: {
            ...(pending.metadata || {}),
            rejected_at: new Date().toISOString(),
          },
        })
        .eq('id', pending.id);

      if (versionError) {
        return NextResponse.json(
          { error: 'Failed to update review status', detail: versionError.message },
          { status: 500 }
        );
      }
    } else {
      const { error: deleteError } = await versionClient
        .from('document_versions')
        .delete()
        .eq('id', pending.id);

      if (deleteError) {
        return NextResponse.json(
          { error: 'Failed to delete review', detail: deleteError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('Review update error:', err);
    return NextResponse.json(
      { error: 'Failed to process review', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
