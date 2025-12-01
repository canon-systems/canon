import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { prepareRepoSummaries } from '@/lib/server/services/prepareRepoSummaries';

export async function POST(
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
		const body = await request.json();
		const { branch, fullScan = false, subdir } = body;

		// Load repo and verify ownership
		const { data: repo, error: repoError } = await supabase
			.from('workspace_repos')
			.select('*')
			.eq('id', id)
			.eq('workspace_id', user.id)
			.single();

		if (repoError || !repo) {
			return NextResponse.json(
				{ error: 'Repository not found or unauthorized' },
				{ status: 404 }
			);
		}

		const repoUrl = repo.repo_url;
		const branchToUse = branch || repo.default_branch || 'main';

		// Prepare summaries for all files in the repo
		const result = await prepareRepoSummaries(supabase, repoUrl, branchToUse, user.id, {
			fullScan,
			subdir,
		});

		return NextResponse.json({
			success: true,
			filesProcessed: result.filesProcessed,
			filesUpdated: result.filesUpdated,
			filesSkipped: result.filesSkipped,
		});
	} catch (err: any) {
		console.error('Prepare repo summaries error:', err);
		return NextResponse.json(
			{
				error: 'Failed to prepare repo summaries',
				detail: err.message || String(err),
			},
			{ status: 500 }
		);
	}
}

