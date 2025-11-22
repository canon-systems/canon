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
  let submissionId: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    submissionId = body.submissionId;
    const previewContent = body.previewContent;

    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });
    }

    if (!previewContent || typeof previewContent !== 'string') {
      return NextResponse.json({ error: 'previewContent is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { user } = await getSession();

    const { data: submission, error: subError } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (subError || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const sourceMeta = submission.source_meta || {};
    const { repoUrl, branch } = sourceMeta;
    const now = new Date().toISOString();

    // Prepare update data - always set last_checked_at for regeneration tracking
    const updateData: any = {
      markdown: previewContent.trim(),
      status: 'completed',
      summary: previewContent.replace(/\s+/g, ' ').slice(0, 200),
      is_outdated: false,
      last_checked_at: now // Always update this for regeneration tracking
    };

    // If GitHub repo, update code snapshot
    if (repoUrl && branch) {
      const repoInfo = parseRepoUrl(repoUrl);
      if (repoInfo) {
        try {
          // Get latest commit SHA and file SHAs for snapshot
          const octokit = await getUserOctokit(supabase, user?.id || null);
          const { data: branchData } = await octokit.repos.getBranch({
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            branch
          });
          const latestCommitSha = branchData.commit.sha;

          const selectedFiles = submission.selected_files || [];
          const fileShas: Record<string, string | null> = {};

          for (const filePath of selectedFiles) {
            try {
              const { data: fileData } = await octokit.repos.getContent({
                owner: repoInfo.owner,
                repo: repoInfo.repo,
                path: filePath,
                ref: latestCommitSha
              });

              if (fileData && !Array.isArray(fileData) && fileData.type === 'file' && 'sha' in fileData) {
                fileShas[filePath] = fileData.sha;
              }
            } catch (e) {
              console.error(`Failed to get SHA for ${filePath}:`, e);
              fileShas[filePath] = null;
            }
          }

          updateData.code_snapshot = {
            commitSha: latestCommitSha,
            fileShas,
            updatedAt: now
          };
        } catch (e) {
          console.error('Failed to update code snapshot:', e);
          // Continue with update even if snapshot fails
        }
      }
    }

    // Update submission with preview content
    const { error: updateError } = await supabase
      .from('submissions')
      .update(updateData)
      .eq('id', submissionId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({
      success: true,
      submissionId,
      message: 'Documentation updated successfully',
      workspaceUpdated: false,
      workspaceProvider: null
    });
  } catch (err: any) {
    if (submissionId) {
      try {
        const supabase = await createClient();
        await supabase
          .from('submissions')
          .update({
            status: 'failed',
            error_message: String(err).slice(0, 500)
          })
          .eq('id', submissionId);
      } catch {
        // Ignore errors in error handler
      }
    }

    return NextResponse.json({ error: 'Update failed', detail: String(err) }, { status: 500 });
  }
}

