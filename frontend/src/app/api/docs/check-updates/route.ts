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
    // Support both documentId and submissionId for backward compatibility
    const documentId = body.documentId || body.submissionId;

    if (!documentId) {
      return NextResponse.json({ error: 'documentId required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { user } = await getSession();

    // Load the document
    const { data: document, error: docErr } = await supabase
      .from('documents')
      .select('id, repo_id, updated_at')
      .eq('id', documentId)
      .single();

    if (docErr || !document) {
      return NextResponse.json(
        { error: 'Document not found', details: docErr?.message },
        { status: 404 }
      );
    }


    // Get repo details
    const { data: repo, error: repoErr } = await supabase
      .from('workspace_repos')
      .select('repo_url, default_branch, user_id')
      .eq('id', document.repo_id)
      .single();

    if (repoErr || !repo) {
      return NextResponse.json(
        { error: 'Repository not found', details: repoErr?.message },
        { status: 404 }
      );
    }

    // Verify user has access
    if (repo.user_id !== user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const repoUrl = repo.repo_url;
    const branch = repo.default_branch || 'main';

    // Get tracked files from document_files
    const { data: documentFiles } = await supabase
      .from('document_files')
      .select('file_path')
      .eq('document_id', documentId);

    const trackedFiles = (documentFiles || []).map(df => df.file_path);

    // Normalize repo URL for repo_file_summaries lookup
    function normalizeRepoId(url: string): string {
      const parsed = parseRepoUrl(url);
      if (!parsed) return '';
      return `github.com/${parsed.owner}/${parsed.repo}`;
    }

    const normalizedRepoId = normalizeRepoId(repoUrl);

    // Get stored file hashes from repo_file_summaries
    const { data: summaries } = await supabase
      .from('repo_file_summaries')
      .select('file_path, file_hash')
      .ilike('repo_id', normalizedRepoId)
      .eq('branch', branch)
      .in('file_path', trackedFiles);

    const storedFileShas: Record<string, string | null> = {};
    summaries?.forEach(s => {
      storedFileShas[s.file_path] = s.file_hash;
    });

    // If no tracked files, can't determine outdated status
    if (trackedFiles.length === 0) {
      return NextResponse.json({
        outdated: false,
        changedFiles: [],
        renamedFiles: [],
        message: 'No tracked files for this document'
      });
    }

    // If no stored file hashes, can't compare
    if (Object.keys(storedFileShas).length === 0) {
      return NextResponse.json({
        outdated: false,
        changedFiles: [],
        renamedFiles: [],
        message: 'No file hashes stored for this document'
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

    // Get latest document version to find stored commit SHA if available
    const { data: latestVersion } = await supabase
      .from('document_versions')
      .select('created_at')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Detect renames using GitHub's compareCommits API
    // Note: We don't store commit SHA in the new schema, so we'll compare against a reasonable time window
    let renamedFiles: Array<{ old_path: string; new_path: string }> = [];

    // Try to detect renames by comparing current state
    // This is a simplified approach - in production you might want to store commit SHA in document_versions
    try {
      // Get recent commits to find a base commit
      const { data: recentCommits } = await octokit.repos.listCommits({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        sha: branch,
        per_page: 10,
      });

      if (recentCommits && recentCommits.length > 0) {
        const baseCommitSha = recentCommits[recentCommits.length - 1].sha;

        if (baseCommitSha !== latestCommitSha) {
          const { data: compareData } = await octokit.repos.compareCommits({
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            base: baseCommitSha,
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
              documentId,
              renamedFiles
            );
          }
        }
      }
    } catch (e) {
      console.error('Error detecting renames:', e);
      // Continue with file hash comparison even if rename detection fails
    }

    // Reload document files to get updated tracked files after rename handling
    const { data: updatedDocumentFiles } = await supabase
      .from('document_files')
      .select('file_path')
      .eq('document_id', documentId);

    // Use updated files if renames occurred, otherwise use original
    const filesToCheck = (updatedDocumentFiles || []).map(df => df.file_path);

    // Reload file hashes for updated files
    const { data: updatedSummaries } = filesToCheck.length > 0
      ? await supabase
        .from('repo_file_summaries')
        .select('file_path, file_hash')
        .ilike('repo_id', normalizedRepoId)
        .eq('branch', branch)
        .in('file_path', filesToCheck)
      : { data: null };

    const fileShasToCheck: Record<string, string | null> = {};
    updatedSummaries?.forEach(s => {
      fileShasToCheck[s.file_path] = s.file_hash;
    });

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

    // Note: Documents table doesn't have is_outdated field in the new schema
    // This information would need to be stored elsewhere or calculated on-demand
    // For now, we just return the status without storing it

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
