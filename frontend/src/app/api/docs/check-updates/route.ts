import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(repoUrl);
    if (u.hostname !== 'github.com' && !u.hostname.includes('github.com')) {
      return null;
    }
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const submissionId = body.submissionId;

    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { user } = await getSession();

    // Load the submission
    const { data: submission, error: subErr } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (subErr || !submission) {
      return NextResponse.json(
        { error: 'Submission not found', details: subErr?.message },
        { status: 404 }
      );
    }

    if (!submission.source_meta?.repoUrl) {
      return NextResponse.json(
        { error: 'Submission has no repoUrl (not a repository-based submission)' },
        { status: 400 }
      );
    }

    const repoUrl = submission.source_meta.repoUrl;
    const branch = submission.source_meta.branch || 'main';

    const repoInfo = parseRepoUrl(repoUrl);
    if (!repoInfo) {
      return NextResponse.json(
        { error: `Failed to parse repository URL: ${repoUrl}` },
        { status: 400 }
      );
    }

    // Fast path: Check commit SHA first
    const codeSnapshot = submission.code_snapshot || {};
    const storedCommitSha = codeSnapshot.commitSha;

    const octokit = await getUserOctokit(supabase, user?.id || null);

    if (storedCommitSha) {
      try {
        const { data: branchData } = await octokit.repos.getBranch({
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          branch
        });
        const latestCommitSha = branchData.commit.sha;
        if (latestCommitSha === storedCommitSha) {
          // Fast path: commit SHA unchanged
          await supabase
            .from('submissions')
            .update({
              is_outdated: false,
              last_checked_at: new Date().toISOString()
            })
            .eq('id', submissionId);

          return NextResponse.json({
            outdated: false,
            changedFiles: [],
            message: 'No changes detected (commit SHA unchanged)'
          });
        }
      } catch (e) {
        console.error('Error checking commit SHA:', e);
      }
    }

    // Load submission_files
    const { data: files, error: fileErr } = await supabase
      .from('submission_files')
      .select('*')
      .eq('submission_id', submissionId);

    if (fileErr) {
      return NextResponse.json(
        { error: 'Failed to load submission_files', details: fileErr.message },
        { status: 500 }
      );
    }

    if (!files || files.length === 0) {
      await supabase
        .from('submissions')
        .update({
          is_outdated: false,
          last_checked_at: new Date().toISOString()
        })
        .eq('id', submissionId);

      return NextResponse.json({
        outdated: false,
        changedFiles: [],
        message: 'No tracked files for this submission'
      });
    }

    // Get latest commit SHA
    const { data: branchData } = await octokit.repos.getBranch({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      branch
    });
    const latestCommitSha = branchData.commit.sha;

    // Get tree for batch SHA fetching
    const { data: treeData } = await octokit.git.getTree({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      tree_sha: latestCommitSha,
      recursive: '1'
    });

    const treeMap = new Map<string, string>();
    if (treeData.tree) {
      for (const item of treeData.tree) {
        if (item.type === 'blob' && item.path && item.sha) {
          treeMap.set(item.path, item.sha);
        }
      }
    }

    // Compare stored hashes with current hashes
    const changedFiles: Array<{ file_path: string; old_hash: string; new_hash: string }> = [];

    for (const row of files) {
      const filePath = row.file_path;
      const oldHash = row.file_hash;
      const newHash = treeMap.get(filePath) || null;

      if (oldHash && newHash !== oldHash) {
        changedFiles.push({
          file_path: filePath,
          old_hash: oldHash,
          new_hash: newHash || '(missing or unreachable)'
        });
      }
    }

    const outdated = changedFiles.length > 0;

    await supabase
      .from('submissions')
      .update({
        is_outdated: outdated,
        last_checked_at: new Date().toISOString()
      })
      .eq('id', submissionId);

    return NextResponse.json({
      outdated,
      changedFiles
    });
  } catch (err: unknown) {
    console.error('Error in /api/docs/check-updates', err);
    const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}

