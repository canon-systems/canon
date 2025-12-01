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

      // Verify code_snapshot exists before processing
      if (!submission.code_snapshot) {
        console.warn(
          `post-process: submission ${submissionId} has no code_snapshot, but proceeding anyway`
        );
      }

      // Verify selected_files exists
      if (!submission.selected_files || submission.selected_files.length === 0) {
        console.warn(
          `post-process: submission ${submissionId} has no selected_files, nothing to track`
        );
        return NextResponse.json(
          {
            ok: true,
            message: 'Post-processing skipped (no selected_files)',
            filesTracked: 0
          },
          { status: 200 }
        );
      }

      console.log(
        `post-process: Starting to track ${submission.selected_files.length} files for submission ${submissionId}`
      );

      await trackSubmissionFiles({
        supabase,
        submission,
        userId
      });

      console.log(
        `post-process: Successfully completed tracking files for submission ${submissionId}`
      );

      return NextResponse.json(
        {
          ok: true,
          message: 'Post-processing completed (submission_files updated)',
          filesTracked: submission.selected_files.length
        },
        { status: 200 }
      );
    } catch (e: any) {
      console.error(`post-process: Failed to post-process submission ${submissionId}:`, e);
      return NextResponse.json(
        {
          error: 'Failed to post-process submission',
          details: e?.message ?? String(e),
          submissionId
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

