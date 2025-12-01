import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient();
    await getSession();

    // Get completed repository-based submissions
    const { data: submissions, error: subError } = await supabase
      .from('submissions')
      .select('id, source_meta, code_snapshot, input_type, last_checked_at')
      .in('input_type', ['github_repo', 'github_repo_directory'])
      .eq('status', 'completed');

    if (subError) {
      return NextResponse.json({ error: 'Failed to fetch submissions', details: subError.message }, { status: 500 });
    }

    if (!submissions || submissions.length === 0) {
      return NextResponse.json({
        checked: 0,
        outdated: 0,
        results: [],
        message: 'No repository-based submissions found'
      });
    }

    // For now, return a simple response indicating we'd need to check each one
    // This is a placeholder - full implementation would batch check efficiently
    return NextResponse.json({
      checked: submissions.length,
      outdated: 0, // Placeholder
      results: submissions.map(s => ({
        submissionId: s.id,
        outdated: false,
        changedFiles: []
      })),
      message: `Found ${submissions.length} submissions (batch checking not fully implemented yet)`
    });
  } catch (err: unknown) {
    console.error('Error in /api/docs/batch-check', err);
    const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
    return NextResponse.json({ error: 'Batch check failed', details: message }, { status: 500 });
  }
}

