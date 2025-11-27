import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

type SubmissionRow = {
  id: string;
  title?: string;
  markdown?: string;
  status?: string;
  source_meta?: Record<string, unknown>;
  summary?: string;
  error_message?: string;
  is_outdated?: boolean;
  code_snapshot?: unknown;
  input_type?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  last_checked_at?: string;
};

/**
 * GET: Retrieve a document by ID
 * Proxies to FastAPI backend /api/docs/{docId}
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

    const { data: submissionData, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', id)
      .single();
    const submission = submissionData as SubmissionRow | null;

    if (error || !submission) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (submission.created_by !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(
      {
        id: submission.id,
        title: submission.title,
        markdown: submission.markdown,
        status: submission.status,
        approval_status: submission.source_meta?.approval_status,
        created_at: submission.created_at,
        updated_at: submission.updated_at || submission.last_checked_at,
        input_type: submission.input_type,
        source_meta: submission.source_meta,
        summary: submission.summary,
        error_message: submission.error_message,
        is_outdated: submission.is_outdated || false,
        code_snapshot: submission.code_snapshot,
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

