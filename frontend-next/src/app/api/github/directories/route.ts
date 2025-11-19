import { NextRequest, NextResponse } from 'next/server';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

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

    // Get user's GitHub connection (or anonymous if not connected)
    const { user } = await getSession();
    const supabase = await createClient();
    const octokit = await getUserOctokit(supabase, user?.id || null);

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
    return NextResponse.json(
      {
        error: 'Failed to fetch directories',
        detail: err.message || String(err)
      },
      { status: 500 }
    );
  }
}

