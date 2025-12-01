import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { prepareFileSummaries } from '@/lib/server/services/prepareSummaries';

export async function POST(request: NextRequest) {
	try {
		const { user } = await getSession();
		if (!user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const supabase = await createClient();
		const body = await request.json();
		const { submissionId, regenerateAll = false } = body;

		if (!submissionId) {
			return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });
		}

		// Verify submission ownership
		const { data: submission, error: subError } = await supabase
			.from('submissions')
			.select('id, created_by')
			.eq('id', submissionId)
			.eq('created_by', user.id)
			.single();

		if (subError || !submission) {
			return NextResponse.json(
				{ error: 'Submission not found or unauthorized' },
				{ status: 404 }
			);
		}

		// Prepare summaries for all files in the submission
		const result = await prepareFileSummaries(supabase, submissionId, regenerateAll, user.id);

		return NextResponse.json({
			success: true,
			filesPrepared: result.filesPrepared,
			filesUpdated: result.filesUpdated,
			filesSkipped: result.filesSkipped,
		});
	} catch (err: any) {
		console.error('Prepare summaries error:', err);
		return NextResponse.json(
			{
				error: 'Failed to prepare summaries',
				detail: err.message || String(err),
			},
			{ status: 500 }
		);
	}
}

