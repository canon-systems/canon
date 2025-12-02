import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import {
	findSubmissionsWithMissingSummaries,
	backfillSubmissionSummaries,
	backfillSummariesBatch,
} from '@/lib/server/services/backfillSummaries';

/**
 * GET: Find submissions with missing summaries (dry-run)
 * Query params:
 *   - limit: number of submissions to check (default: 100)
 *   - repoUrl: filter by specific repo URL (optional)
 */
export async function GET(request: NextRequest) {
	try {
		const supabase = await createClient();
		const { user } = await getSession();
		const { searchParams } = new URL(request.url);
		const limit = parseInt(searchParams.get('limit') || '100', 10);
		const repoUrl = searchParams.get('repoUrl') || undefined;

		if (!user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const submissions = await findSubmissionsWithMissingSummaries(supabase, {
			limit,
			userId: user.id,
			repoUrl,
		});

		const totalMissingFiles = submissions.reduce(
			(sum, s) => sum + s.missingFiles.length,
			0
		);

		return NextResponse.json({
			success: true,
			submissionsFound: submissions.length,
			totalMissingFiles,
			submissions: submissions.map((s) => ({
				submissionId: s.submissionId,
				repoUrl: s.repoUrl,
				missingFilesCount: s.missingFiles.length,
				totalFiles: s.totalFiles,
				missingFiles: s.missingFiles.slice(0, 10), // Preview first 10
			})),
		});
	} catch (err: any) {
		console.error('Backfill summaries GET error:', err);
		return NextResponse.json(
			{ error: 'Failed to find submissions', detail: err.message || String(err) },
			{ status: 500 }
		);
	}
}

/**
 * POST: Execute backfill for submissions
 * Body:
 *   - submissionId: backfill a specific submission (optional)
 *   - limit: number of submissions to process (default: 100)
 *   - batchSize: number of submissions to process in parallel (default: 10)
 *   - repoUrl: filter by specific repo URL (optional)
 */
export async function POST(request: NextRequest) {
	try {
		const supabase = await createClient();
		const { user } = await getSession();
		const body = await request.json().catch(() => ({}));
		const { submissionId, limit = 100, batchSize = 10, repoUrl } = body;

		if (!user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Single submission backfill
		if (submissionId) {
			const result = await backfillSubmissionSummaries(
				supabase,
				submissionId,
				user.id
			);

			return NextResponse.json({
				success: result.success,
				filesProcessed: result.filesProcessed,
				filesUpdated: result.filesUpdated,
				filesSkipped: result.filesSkipped,
				errors: result.errors,
			});
		}

		// Batch backfill
		const result = await backfillSummariesBatch(supabase, {
			limit: typeof limit === 'number' ? limit : 100,
			batchSize: typeof batchSize === 'number' ? batchSize : 10,
			userId: user.id,
			repoUrl: typeof repoUrl === 'string' ? repoUrl : undefined,
		});

		return NextResponse.json({
			success: true,
			totalProcessed: result.totalProcessed,
			totalUpdated: result.totalUpdated,
			totalFailed: result.totalFailed,
			results: result.results.slice(0, 50), // Return first 50 results
		});
	} catch (err: any) {
		console.error('Backfill summaries POST error:', err);
		return NextResponse.json(
			{ error: 'Backfill failed', detail: err.message || String(err) },
			{ status: 500 }
		);
	}
}

