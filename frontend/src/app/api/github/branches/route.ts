import { NextRequest, NextResponse } from 'next/server';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

/**
 * Fetch all branches for a GitHub repository
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const repoUrl = String(body.repoUrl || '');

    if (!repoUrl.includes('github.com')) {
      return NextResponse.json({ error: 'repoUrl must be a GitHub URL' }, { status: 400 });
    }

    // Parse owner/repo from URL
    const noProto = repoUrl.replace(/^https?:\/\//, '');
    const parts = noProto.split('/').filter(Boolean);
    const owner = parts[1];
    const repo = parts[2]?.replace(/\.git$/, '');

    if (!owner || !repo) {
      return NextResponse.json({ error: 'repoUrl missing owner or repo' }, { status: 400 });
    }

    // Get user's GitHub connection (or anonymous if not connected)
    const { user } = await getSession();
    const supabase = await createClient();
    const octokit = await getUserOctokit(supabase, user?.id || null);

    // Fetch branches from GitHub API
    const { data: branches } = await octokit.repos.listBranches({
      owner,
      repo,
      per_page: 100
    });

    const branchNames = branches.map((b) => b.name).sort();

    return NextResponse.json({ branches: branchNames }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'Failed to fetch branches',
        detail: err.message || String(err)
      },
      { status: 500 }
    );
  }
}

