import { NextRequest, NextResponse } from 'next/server';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const noProto = repoUrl.replace(/^https?:\/\//, '');
    const parts = noProto.split('/').filter(Boolean);
    const owner = parts[1];
    const repo = parts[2]?.replace(/\.git$/, '');
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { repoUrl, branch, selectedFiles } = body;

    if (!repoUrl || !branch) {
      return NextResponse.json({ error: 'repoUrl and branch are required' }, { status: 400 });
    }

    if (!Array.isArray(selectedFiles) || selectedFiles.length === 0) {
      return NextResponse.json({ error: 'selectedFiles array is required' }, { status: 400 });
    }

    const { user } = await getSession();
    const supabase = await createClient();
    const octokit = await getUserOctokit(supabase, user?.id || null);

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed || !parsed.owner || !parsed.repo) {
      return NextResponse.json({ error: 'Invalid GitHub URL' }, { status: 400 });
    }

    // Get commit SHA
    let commitSha: string | null;
    try {
      const { data: branchData } = await octokit.repos.getBranch({
        owner: parsed.owner,
        repo: parsed.repo,
        branch
      });
      commitSha = branchData.commit.sha;
    } catch (e) {
      return NextResponse.json({ error: 'Failed to get commit SHA', detail: String(e) }, { status: 500 });
    }

    if (!commitSha) {
      return NextResponse.json({ error: 'Could not get commit SHA' }, { status: 500 });
    }

    // Get file SHAs
    const fileShas: Record<string, string | null> = {};

    for (const filePath of selectedFiles) {
      try {
        const { data: fileData } = await octokit.repos.getContent({
          owner: parsed.owner,
          repo: parsed.repo,
          path: filePath,
          ref: commitSha
        });

        if (fileData && !Array.isArray(fileData) && fileData.type === 'file' && 'sha' in fileData) {
          fileShas[filePath] = fileData.sha;
        } else {
          fileShas[filePath] = null;
        }
      } catch (e) {
        fileShas[filePath] = null;
      }
    }

    return NextResponse.json({
      commitSha,
      fileShas
    });
  } catch (err) {
    return NextResponse.json({ error: 'Snapshot failed', detail: String(err) }, { status: 500 });
  }
}

