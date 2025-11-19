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
      throw new Error(`GitHub 404: Path not found`);
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const repoUrl = String(body.repoUrl || '');
    const branch = String(body.branch || 'main');
    const subdirRaw = String(body.subdir || '');

    if (!repoUrl.includes('github.com')) {
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

    // Clean subdir (trim leading/trailing slashes)
    const subdir = subdirRaw.replace(/^\/+|\/+$/g, '');

    // Get user's GitHub connection (or anonymous if not connected)
    const { user } = await getSession();
    const supabase = await createClient();
    const octokit = await getUserOctokit(supabase, user?.id || null);

    // Grab all files (under subdir if given, otherwise repo root)
    const files = await listAllFiles(octokit, owner, repo, branch, subdir);

    // Return sorted for stable UI (optional)
    files.sort((a, b) => a.path.localeCompare(b.path));

    return NextResponse.json({ files }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to list repository files', detail: String(err) },
      { status: 500 }
    );
  }
}

