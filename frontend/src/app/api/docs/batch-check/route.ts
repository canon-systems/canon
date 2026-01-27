import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

export async function POST() {
  try {
    const supabase = await createClient();

    // Get all documents (replaced submissions)
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's sources
    const { data: userSources } = await supabase
      .from('workspace_sources')
      .select('id')
      .eq('user_id', user.id);

    const sourceIds = userSources?.map(r => r.id) || [];

    const { data: documents, error: docError } = sourceIds.length > 0
      ? await supabase
        .from('documents')
        .select('id, source_id, updated_at')
        .in('source_id', sourceIds)
      : { data: null, error: null };

    if (docError) {
      return NextResponse.json({ error: 'Failed to fetch documents', details: docError.message }, { status: 500 });
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({
        checked: 0,
        outdated: 0,
        results: [],
        message: 'No documents found'
      });
    }

    // For now, return a simple response indicating we'd need to check each one
    // This is a placeholder - full implementation would batch check efficiently
    return NextResponse.json({
      checked: documents.length,
      outdated: 0, // Placeholder - documents don't have is_outdated field in new schema
      results: documents.map(d => ({
        documentId: d.id,
        outdated: false,
        changedFiles: []
      })),
      message: `Found ${documents.length} documents (batch checking not fully implemented yet)`
    });
  } catch (err: unknown) {
    console.error('Error in /api/docs/batch-check', err);
    const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
    return NextResponse.json({ error: 'Batch check failed', details: message }, { status: 500 });
  }
}
