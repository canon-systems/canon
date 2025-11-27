import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { computeTextDiff } from '@/lib/utils/textDiff';
import { createTwoFilesPatch } from 'diff';

type SourceMeta = {
  repoUrl?: string;
};

type SubmissionRow = {
  id: string;
  markdown?: string;
  previous_markdown?: string;
  created_by?: string;
  source_meta?: SourceMeta;
};

/**
 * GET: Get document diff
 * Proxies to FastAPI backend /api/diff?docId=...
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const docId = searchParams.get('docId');

    if (!docId) {
      return NextResponse.json({ error: 'docId is required' }, { status: 400 });
    }

    const { data: submission, error } = await supabase
      .from<SubmissionRow>('submissions')
      .select('*')
      .eq('id', docId)
      .single();

    if (error || !submission) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (submission.created_by !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const currentText = submission.markdown || '';
    const previousText = submission.previous_markdown || '';

    const diffPatch = createTwoFilesPatch('previous', 'current', previousText, currentText);

    const rawSegments = computeTextDiff(previousText, currentText);
    let lineNumber = 0;
    const segments = rawSegments.map((segment) => {
      if (segment.type !== 'deleted') {
        lineNumber += 1;
      }
      return {
        type: segment.type,
        text: segment.text,
        line_number: segment.type !== 'deleted' ? lineNumber : null,
      };
    });

    const stats = {
      added: segments.filter((s) => s.type === 'added').length,
      removed: segments.filter((s) => s.type === 'deleted').length,
      unchanged: segments.filter((s) => s.type === 'unchanged').length,
    };

    return NextResponse.json(
      {
        doc_id: docId,
        unified_diff: diffPatch,
        segments,
        stats,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Get diff error:', err);
    return NextResponse.json(
      {
        error: 'Failed to get diff',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

