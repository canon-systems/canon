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

function normalizeRepoId(repoUrl: string): string {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error(`Invalid repo URL: ${repoUrl}`);
  }
  return `github.com/${parsed.owner}/${parsed.repo}`;
}

import { getDocument, getDocumentFiles } from '@/lib/server/services/documentService';

export async function POST(request: NextRequest) {
  let documentId: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    documentId = body.submissionId || body.documentId; // Support both for backward compatibility
    const previewContent = body.previewContent;
    const regenerationSettings = body.regenerationSettings;

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    if (!previewContent || typeof previewContent !== 'string') {
      return NextResponse.json({ error: 'previewContent is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { user } = await getSession();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get document
    const document = await getDocument(supabase, documentId);
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Verify user has access
    const { data: repo } = await supabase
      .from('workspace_repos')
      .select('workspace_id, repo_url, default_branch')
      .eq('id', document.repo_id)
      .single();

    if (!repo || repo.workspace_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get next version number
    const { data: versionData } = await supabase.rpc('get_next_document_version', {
      doc_id: documentId
    });

    const versionNumber = versionData || 1;

    // Update document
    const updateData: any = {
      content: previewContent.trim(),
      updated_at: new Date().toISOString(),
    };

    // Include regeneration settings if provided
    if (regenerationSettings) {
      updateData.configuration = regenerationSettings;
    }

    const { error: updateError } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Create new version
    await supabase.from('document_versions').insert({
      document_id: documentId,
      version_number: versionNumber,
      content: previewContent.trim(),
      change_summary: 'Document updated'
    });

    // TRUE FIX: Update file hashes synchronously after regeneration
    // This ensures check-updates sees current hashes, not stale ones
    try {
      const repoInfo = parseRepoUrl(repo.repo_url);
      if (repoInfo) {
        const octokit = await getUserOctokit(supabase, user.id);
        const branch = repo.default_branch || 'main';

        // Get current tracked files
        const { data: documentFiles } = await supabase
          .from('document_files')
          .select('file_path')
          .eq('document_id', documentId);

        const trackedFiles = (documentFiles || []).map(df => df.file_path);

        if (trackedFiles.length > 0) {
          // Get latest commit to ensure we get current file versions
          const { data: branchData } = await octokit.repos.getBranch({
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            branch
          });
          const latestCommitSha = branchData.commit.sha;

          // Update hashes for all tracked files (synchronously)
          for (const filePath of trackedFiles) {
            try {
              const { data: fileData } = await octokit.repos.getContent({
                owner: repoInfo.owner,
                repo: repoInfo.repo,
                path: filePath,
                ref: latestCommitSha
              });

              if (fileData && !Array.isArray(fileData) && fileData.type === 'file' && 'sha' in fileData) {
                const currentHash = fileData.sha;

                // Look up existing summary data to preserve it while updating hash
                const { data: existingSummary } = await supabase
                  .from('repo_file_summaries')
                  .select('summary_text, summary_model')
                  .ilike('repo_id', normalizeRepoId(repo.repo_url))
                  .eq('branch', branch)
                  .eq('file_path', filePath)
                  .single();

                // Update hash in repo_file_summaries (preserve existing summaries)
                const { error: hashUpdateError } = await supabase.rpc('upsert_repo_file_summary', {
                  p_repo_id: normalizeRepoId(repo.repo_url),
                  p_file_path: filePath,
                  p_file_hash: currentHash,
                  p_summary_text: existingSummary?.summary_text || '', // Preserve existing or use empty string
                  p_summary_model: existingSummary?.summary_model || 'unknown', // Preserve existing or use default
                  p_user_id: user.id,
                  p_branch: branch,
                });

                if (hashUpdateError) {
                  console.warn(`Failed to update hash for ${filePath}:`, hashUpdateError);
                }
              }
            } catch (fileError) {
              console.warn(`Could not update hash for ${filePath}:`, fileError);
            }
          }
        }
      }
    } catch (hashUpdateError) {
      console.error('[update] Failed to update file hashes:', hashUpdateError);
      // Don't fail the entire operation if hash updates fail
    }

    return NextResponse.json({
      success: true,
      submissionId: documentId, // Keep for backward compatibility
      documentId,
      message: 'Documentation updated successfully',
      workspaceUpdated: false,
      workspaceProvider: null
    });
  } catch (err: any) {
    console.error('Update document error:', err);
    return NextResponse.json({ error: 'Update failed', detail: String(err) }, { status: 500 });
  }
}

