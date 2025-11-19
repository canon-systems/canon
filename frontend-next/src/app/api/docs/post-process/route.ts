import { NextRequest, NextResponse } from 'next/server';
import { trackSubmissionFiles } from '@/lib/server/trackSubmissionFiles';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const submissionId: string | undefined = body.submissionId;

    if (!submissionId) {
      return NextResponse.json(
        { error: 'submissionId is required in the request body' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: submission, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (error || !submission) {
      return NextResponse.json(
        {
          error: 'Submission not found',
          details: error?.message
        },
        { status: 404 }
      );
    }

    try {
      const userId = submission.created_by || null;

      await trackSubmissionFiles({
        supabase,
        submission,
        userId
      });

      return NextResponse.json(
        {
          ok: true,
          message: 'Post-processing completed (submission_files updated)'
        },
        { status: 200 }
      );
    } catch (e: any) {
      return NextResponse.json(
        {
          error: 'Failed to post-process submission',
          details: e?.message ?? String(e)
        },
        { status: 500 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'Post-process failed', detail: String(err) },
      { status: 500 }
    );
  }
}

