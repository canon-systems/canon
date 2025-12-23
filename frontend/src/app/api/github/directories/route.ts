import { NextRequest, NextResponse } from 'next/server';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { Octokit } from '@octokit/rest';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const repoUrl = String(body.repoUrl || '');
    const branch = String(body.branch || 'main');

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

    // Get user's session (may be null for public repos)
    const { user } = await getSession();
    const supabase = await createClient();

    let octokit: any;

    if (user) {
      try {
        // Try authenticated access first
        octokit = await getUserOctokit(supabase, user.id);
      } catch (authError) {
        // If authenticated access fails, fall back to anonymous access
        // Anonymous access will work for public repos, fail for private ones
        const errorMessage = authError instanceof Error ? authError.message : String(authError);
        console.warn('Authenticated access failed, using anonymous access:', errorMessage);
        octokit = new Octokit();
      }
    } else {
      // No user session - use anonymous access for public repos only
      octokit = new Octokit();
    }

    // Fetch root directory contents
    const { data: contents } = await octokit.repos.getContent({
      owner,
      repo,
      path: '',
      ref: branch
    });

    if (!Array.isArray(contents)) {
      return NextResponse.json({ directories: [] }, { status: 200 });
    }

    // Filter to only directories and extract names
    const directories = contents
      .filter((item) => item.type === 'dir')
      .map((item) => item.name)
      .sort();

    return NextResponse.json({ directories }, { status: 200 });
  } catch (err: any) {
    // Handle repository not found or access denied
    if (err.status === 404) {
      return NextResponse.json(
        {
          error: 'Repository not found',
          detail: 'The repository does not exist or you do not have access to it'
        },
        { status: 404 }
      );
    }

    if (err.status === 403) {
      return NextResponse.json(
        {
          error: 'Access denied',
          detail: 'You do not have permission to access this repository. For private repositories, please connect your GitHub account.'
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch directories',
        detail: err.message || String(err)
      },
      { status: 500 }
    );
  }
}

