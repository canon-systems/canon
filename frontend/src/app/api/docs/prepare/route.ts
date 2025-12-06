import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { prepareFileSummaries } from '@/lib/server/services/prepareSummaries';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
	try {
		const { user } = await getSession();
		if (!user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const supabase = await createClient();
		const body = await request.json();
		// Support both documentId and submissionId for backward compatibility
		const documentId = body.documentId || body.submissionId;
		const regenerateAll = body.regenerateAll || false;

		if (!documentId) {
			return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
		}

		// Verify document ownership through workspace_repos
		const { data: document, error: docError } = await supabase
			.from('documents')
			.select('id, repo_id')
			.eq('id', documentId)
			.single();

		if (docError || !document) {
			return NextResponse.json(
				{ error: 'Document not found' },
				{ status: 404 }
			);
		}

		// Verify user has access to the repo
		const { data: repo, error: repoError } = await supabase
			.from('workspace_repos')
			.select('workspace_id')
			.eq('id', document.repo_id)
			.eq('workspace_id', user.id)
			.single();

		if (repoError || !repo) {
			return NextResponse.json(
				{ error: 'Document not found or unauthorized' },
				{ status: 403 }
			);
		}

		// Prepare summaries for all files in the document
		const result = await prepareFileSummaries(supabase, documentId, regenerateAll, user.id);

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

