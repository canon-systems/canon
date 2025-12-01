import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { parseRepoUrl } from '@/lib/server/github/github';

/**
 * Normalize repo URL to repo_id format: "github.com/owner/repo" (lowercase)
 * GitHub URLs are case-insensitive, so we normalize to lowercase for consistent matching
 */
function normalizeRepoId(repoUrl: string): string {
	const parsed = parseRepoUrl(repoUrl);
	if (!parsed) {
		throw new Error(`Invalid repo URL: ${repoUrl}`);
	}
	return `github.com/${parsed.owner}/${parsed.repo}`.toLowerCase();
}

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
		const { searchParams } = new URL(request.url);
		const filePath = searchParams.get('filePath');

		// Load repo and verify ownership
		const { data: repo, error: repoError } = await supabase
			.from('workspace_repos')
			.select('repo_url')
			.eq('id', id)
			.eq('workspace_id', user.id)
			.single();

		if (repoError || !repo) {
			return NextResponse.json(
				{ error: 'Repository not found or unauthorized' },
				{ status: 404 }
			);
		}

		const repoId = normalizeRepoId(repo.repo_url);
		const branch = searchParams.get('branch') || 'main';

		// Query summaries
		// Use ilike for case-insensitive repo_id matching since GitHub URLs are case-insensitive
		let query = supabase
			.from('repo_file_summaries')
			.select('file_path, summary_text, summary_json, updated_at')
			.ilike('repo_id', repoId)
			.eq('branch', branch)
			.order('file_path', { ascending: true });

		if (filePath) {
			query = query.eq('file_path', filePath);
		}

		const { data: summaries, error: summariesError } = await query;

		if (summariesError) {
			throw summariesError;
		}

		return NextResponse.json({
			summaries: summaries || [],
		});
	} catch (err: any) {
		console.error('Get repo summaries error:', err);
		return NextResponse.json(
			{
				error: 'Failed to get repo summaries',
				detail: err.message || String(err),
			},
			{ status: 500 }
		);
	}
}

