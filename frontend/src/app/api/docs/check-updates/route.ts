import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { updateTrackedFilesForRenames } from '@/lib/server/services/fileRenameHandler';

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
    const trackedFiles = submission.selected_files || [];
    const codeSnapshot = submission.code_snapshot || {};
    const storedFileShas = codeSnapshot.fileShas || {};
    const storedCommitSha = codeSnapshot.commitSha;

    // If no tracked files, can't determine outdated status
    if (trackedFiles.length === 0) {
      return NextResponse.json({
        outdated: submission.is_outdated || false,
        changedFiles: [],
        renamedFiles: [],
        message: 'No tracked files for this submission'
      });
    }

    // If no stored file hashes, can't compare
    if (Object.keys(storedFileShas).length === 0) {
      return NextResponse.json({
        outdated: submission.is_outdated || false,
        changedFiles: [],
        renamedFiles: [],
        message: 'No file hashes stored for this submission'
      });
    }

    const repoInfo = parseRepoUrl(repoUrl);
    if (!repoInfo) {
      return NextResponse.json(
        { error: `Failed to parse repository URL: ${repoUrl}` },
        { status: 400 }
      );
    }

    const octokit = await getUserOctokit(supabase, user?.id || null);

    // Get current commit SHA (needed to fetch current file hashes and detect renames)
    const { data: branchData } = await octokit.repos.getBranch({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      branch
    });
    const latestCommitSha = branchData.commit.sha;

    // Detect renames using GitHub's compareCommits API
    let renamedFiles: Array<{ old_path: string; new_path: string }> = [];
    if (storedCommitSha && storedCommitSha !== latestCommitSha) {
      try {
        const { data: compareData } = await octokit.repos.compareCommits({
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          base: storedCommitSha,
          head: latestCommitSha,
        });

        // Find renames that affect tracked files
        const trackedFilesSet = new Set(trackedFiles);
        for (const file of compareData.files || []) {
          if (file.status === 'renamed') {
            const oldPath = file.previous_filename || file.filename;
            const newPath = file.filename;
            
            // Only track renames if the old path was in our tracked files
            if (trackedFilesSet.has(oldPath)) {
              renamedFiles.push({
                old_path: oldPath,
                new_path: newPath,
              });
            }
          }
        }

        // Auto-update tracked files if renames detected
        if (renamedFiles.length > 0) {
          await updateTrackedFilesForRenames(
            supabase,
            submissionId,
            renamedFiles
          );
        }
      } catch (e) {
        console.error('Error detecting renames:', e);
        // Continue with file hash comparison even if rename detection fails
      }
    }

    // Reload submission to get updated tracked files after rename handling
    const { data: updatedSubmission } = await supabase
      .from('submissions')
      .select('selected_files, code_snapshot')
      .eq('id', submissionId)
      .single();
    
    // Use updated files if renames occurred, otherwise use original
    const filesToCheck = updatedSubmission?.selected_files || trackedFiles;
    const fileShasToCheck = updatedSubmission?.code_snapshot?.fileShas || storedFileShas;

    // File-level check: Compare hashes of tracked files only
    const changedFiles: Array<{ file_path: string; old_hash: string; new_hash: string }> = [];

    for (const filePath of filesToCheck) {
      const storedHash = fileShasToCheck[filePath];
      
      // Skip if we don't have a stored hash for this file
      if (!storedHash) {
        continue;
      }

      try {
        // Get current file hash
        const { data: fileData } = await octokit.repos.getContent({
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          path: filePath,
          ref: latestCommitSha
        });

        if (fileData && !Array.isArray(fileData) && fileData.type === 'file' && 'sha' in fileData) {
          const currentHash = fileData.sha;
          
          // Compare: if hash changed, file changed
          if (currentHash !== storedHash) {
            changedFiles.push({
              file_path: filePath,
              old_hash: storedHash,
              new_hash: currentHash
            });
          }
        } else {
          // File doesn't exist or is not a file (directory, etc.)
          changedFiles.push({
            file_path: filePath,
            old_hash: storedHash,
            new_hash: '(file removed or not accessible)'
          });
        }
      } catch (e) {
        // File might not exist anymore or error fetching
        changedFiles.push({
          file_path: filePath,
          old_hash: storedHash,
          new_hash: '(file removed or error)'
        });
      }
    }

    // Outdated = any tracked file's hash changed
    const isOutdated = changedFiles.length > 0;

    // Update is_outdated based on file-level comparison
    await supabase
      .from('submissions')
      .update({
        is_outdated: isOutdated,
        last_checked_at: new Date().toISOString()
      })
      .eq('id', submissionId);

    return NextResponse.json({
      outdated: isOutdated,
      changedFiles,
      renamedFiles,
      trackedFilesCount: filesToCheck.length,
      changedFilesCount: changedFiles.length,
      renamedFilesCount: renamedFiles.length
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

