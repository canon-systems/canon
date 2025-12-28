import { NextRequest, NextResponse } from 'next/server';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

// GET one path (file or directory listing) from GitHub using user's token
async function fetchContents(
  octokit: Awaited<ReturnType<typeof getUserOctokit>>,
  owner: string,
  repo: string,
  branch: string,
  path: string
) {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: path || '',
      ref: branch
    });
    return data;
  } catch (error: any) {
    if (error.status === 404) {
      throw new Error(`GitHub 404: Path not found - ${path}`);
    }
    if (error.status === 403) {
      throw new Error(`GitHub 403: Access denied - check repository permissions and token scope`);
    }
    if (error.status === 401) {
      throw new Error(`GitHub 401: Authentication failed - please reconnect your GitHub account`);
    }
    throw new Error(`GitHub ${error.status}: ${error.message || 'Unknown error'}`);
  }
}

// Walk a directory tree and collect files
async function listAllFiles(
  octokit: Awaited<ReturnType<typeof getUserOctokit>>,
  owner: string,
  repo: string,
  branch: string,
  rootPath: string
) {
  // We use an explicit stack to avoid deep recursion issues
  const stack: string[] = [rootPath || ''];
  const files: Array<{ path: string; size: number }> = [];

  while (stack.length) {
    const current = stack.pop()!; // a path relative to repo root
    try {
      const node = await fetchContents(octokit, owner, repo, branch, current || '');

      if (Array.isArray(node)) {
        // It's a directory listing. Each item has: type: "file" | "dir"
        for (const item of node) {
          const itemPath = item.path as string;   // repo-relative full path
          if (item.type === 'file') {
            files.push({ path: itemPath, size: Number(item.size || 0) });
          } else if (item.type === 'dir') {
            stack.push(itemPath); // dive deeper
          }
        }
      } else if (node && 'type' in node && node.type === 'file') {
        // Direct file object
        files.push({ path: node.path as string, size: Number(node.size || 0) });
      }
    } catch (e) {
      // If a folder doesn't exist or rate-limited, we skip with minimal fuss for now.
      // You can surface this to the client if you want stricter behavior.
    }
  }

  return files;
}

async function handleListRequest(repoUrl: string, branch: string, subdirRaw: string) {
  if (!repoUrl || !repoUrl.includes('github.com')) {
    return NextResponse.json({ error: 'repoUrl must be a GitHub URL' }, { status: 400 });
  }

  // Parse owner/repo from full URL like https://github.com/owner/repo
  const noProto = repoUrl.replace(/^https?:\/\//, '');
  const parts = noProto.split('/').filter(Boolean);
  const owner = parts[1];
  const repo = parts[2];

  if (!owner || !repo) {
    return NextResponse.json({ error: 'repoUrl missing owner or repo' }, { status: 400 });
  }

  // Get user's GitHub connection
  const { user } = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

  // Verify user has access to this repository (including specific branch)
  const { data: userRepos, error: repoError } = await supabase
    .from('workspace_repos')
    .select('id, user_id, repo_url, default_branch, name')
    .eq('user_id', user.id)
    .eq('repo_url', repoUrl)
    .eq('default_branch', branch);

  if (repoError) {
    return NextResponse.json(
      { error: 'Database error checking repository access' },
      { status: 500 }
    );
  }

  if (!userRepos || userRepos.length === 0) {
    // Check if the repository exists with a different branch
    const { data: allReposForUrl, error: allReposError } = await supabase
      .from('workspace_repos')
      .select('default_branch, name')
      .eq('user_id', user.id)
      .eq('repo_url', repoUrl);

    if (!allReposError && allReposForUrl && allReposForUrl.length > 0) {
      const availableBranches = allReposForUrl.map(r => r.default_branch).join(', ');
      return NextResponse.json(
        {
          error: `Repository found but not configured for branch '${branch}'`,
          detail: `This repository is configured for branches: ${availableBranches}. Please specify one of these branches or set up the repository for branch '${branch}'.`
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Repository not found or you do not have access to it' },
      { status: 403 }
    );
  }

  // Use the repository record that matches the requested branch
  const userRepo = userRepos[0];

  // Clean subdir (trim leading/trailing slashes)
  const subdir = subdirRaw.replace(/^\/+|\/+$/g, '');

  // Check if user has GitHub connected before proceeding
  const { hasGitHubConnection } = await import('@/lib/server/github/getUserOctokit');
  const hasConnection = await hasGitHubConnection(supabase, user.id);

  if (!hasConnection) {
    return NextResponse.json({
      error: 'GitHub not connected',
      detail: 'Please connect your GitHub account in Settings → Integrations to access private repositories'
    }, { status: 403 });
  }

  const octokit = await getUserOctokit(supabase, user.id);

  // Grab all files (under subdir if given, otherwise repo root)
  const files = await listAllFiles(octokit, owner, repo, branch, subdir);

  // Return sorted for stable UI (optional)
  files.sort((a, b) => a.path.localeCompare(b.path));

  return NextResponse.json({ files }, { status: 200 });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repoUrl = searchParams.get('repoUrl') || '';
    const branch = searchParams.get('branch') || 'main';
    const subdir = searchParams.get('subdir') || '';

    return await handleListRequest(repoUrl, branch, subdir);
  } catch (err: any) {
    console.error('GitHub list API GET error:', err);

    // Handle specific GitHub errors
    if (err.message?.includes('403') || err.message?.includes('Access denied')) {
      return NextResponse.json(
        {
          error: 'Repository access denied',
          detail: 'You may not have permission to access this repository, or your GitHub token may need to be refreshed. Try reconnecting your GitHub account in Settings → Integrations.'
        },
        { status: 403 }
      );
    }

    if (err.message?.includes('401') || err.message?.includes('Authentication failed')) {
      return NextResponse.json(
        {
          error: 'GitHub authentication failed',
          detail: 'Your GitHub connection may have expired. Please reconnect your GitHub account in Settings → Integrations.'
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to list repository files', detail: err.message || String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const repoUrl = String(body.repoUrl || '');
    const branch = String(body.branch || 'main');
    const subdirRaw = String(body.subdir || '');

    return await handleListRequest(repoUrl, branch, subdirRaw);
  } catch (err: any) {
    console.error('GitHub list API POST error:', err);

    // Handle specific GitHub errors
    if (err.message?.includes('403') || err.message?.includes('Access denied')) {
      return NextResponse.json(
        {
          error: 'Repository access denied',
          detail: 'You may not have permission to access this repository, or your GitHub token may need to be refreshed. Try reconnecting your GitHub account in Settings → Integrations.'
        },
        { status: 403 }
      );
    }

    if (err.message?.includes('401') || err.message?.includes('Authentication failed')) {
      return NextResponse.json(
        {
          error: 'GitHub authentication failed',
          detail: 'Your GitHub connection may have expired. Please reconnect your GitHub account in Settings → Integrations.'
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to list repository files', detail: err.message || String(err) },
      { status: 500 }
    );
  }
}
