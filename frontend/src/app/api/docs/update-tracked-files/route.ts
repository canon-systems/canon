import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { parseRepoUrl } from '@/lib/server/github/github';
import { analyzeRepository } from '@/lib/server/services/analyzeRepository';
import { generateDocumentation } from '@/lib/server/services/docGenerator';
import { trackSubmissionFiles } from '@/lib/server/trackSubmissionFiles';
import { prepareFileSummaries } from '@/lib/server/services/prepareSummaries';

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const body = await request.json();
    const { submissionId, selected_files, regenerate = false } = body;

    if (!submissionId || !Array.isArray(selected_files)) {
      return NextResponse.json(
        { error: 'submissionId and selected_files array are required' },
        { status: 400 }
      );
    }

    // Get existing submission
    const { data: submission, error: subError } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('created_by', user.id)
      .single();

    if (subError || !submission) {
      return NextResponse.json(
        { error: 'Submission not found or unauthorized' },
        { status: 404 }
      );
    }

    const sourceMeta = submission.source_meta || {};
    const repoUrl = sourceMeta.repoUrl;
    const branch = sourceMeta.branch || 'main';

    if (!repoUrl) {
      return NextResponse.json(
        { error: 'Submission must have a repoUrl' },
        { status: 400 }
      );
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid repository URL' },
        { status: 400 }
      );
    }

    const octokit = await getUserOctokit(supabase, user.id);

    // Get current commit SHA
    const { data: branchData } = await octokit.repos.getBranch({
      owner: parsed.owner,
      repo: parsed.repo,
      branch,
    });
    const currentCommitSha = branchData.commit.sha;

    // Get file SHAs for selected files
    const fileShas: Record<string, string | null> = {};
    const existingFileShas = submission.code_snapshot?.fileShas || {};

    for (const filePath of selected_files) {
      try {
        const { data: fileData } = await octokit.repos.getContent({
          owner: parsed.owner,
          repo: parsed.repo,
          path: filePath,
          ref: currentCommitSha,
        });

        if (!Array.isArray(fileData) && fileData.type === 'file' && 'sha' in fileData) {
          fileShas[filePath] = fileData.sha;
        } else {
          fileShas[filePath] = existingFileShas[filePath] || null;
        }
      } catch (e) {
        fileShas[filePath] = existingFileShas[filePath] || null;
      }
    }

    // Check if files actually changed
    const oldFilesSet = new Set(submission.selected_files || []);
    const newFilesSet = new Set(selected_files);
    const filesChanged =
      oldFilesSet.size !== newFilesSet.size ||
      [...oldFilesSet].some(f => !newFilesSet.has(f)) ||
      [...newFilesSet].some(f => !oldFilesSet.has(f));

    // Update submission with new file list
    const { error: updateError } = await supabase
      .from('submissions')
      .update({
        selected_files: selected_files,
        code_snapshot: {
          ...submission.code_snapshot,
          commitSha: currentCommitSha,
          fileShas,
          updatedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', submissionId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update tracked files', details: updateError.message },
        { status: 500 }
      );
    }

    // Update submission_files table
    // First, delete files that are no longer in selected_files
    const filesToRemove = [...oldFilesSet].filter(f => !newFilesSet.has(f));

    if (filesToRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from('submission_files')
        .delete()
        .eq('submission_id', submissionId)
        .in('file_path', filesToRemove);

      if (deleteError) {
        console.warn('Failed to remove old files from submission_files:', deleteError);
      }
    }

    // Then upsert the new/updated files
    const updatedSubmission = {
      ...submission,
      selected_files: selected_files,
      code_snapshot: {
        ...submission.code_snapshot,
        commitSha: currentCommitSha,
        fileShas,
      },
    };

    await trackSubmissionFiles({
      supabase,
      submission: updatedSubmission,
      userId: user.id,
    });

    // Regenerate if files changed and regenerate flag is true
    if (filesChanged && regenerate) {
      try {
        // Prepare summaries first to ensure all files have summaries
        try {
          await prepareFileSummaries(supabase, submissionId, false, user.id);
        } catch (prepareError) {
          console.error('Failed to prepare summaries before regeneration:', prepareError);
          // Continue anyway - will fallback to full content
        }

        const settings = sourceMeta.settings || {};
        const subdir = settings.subdir || sourceMeta.subdir || null;
        const filters = settings.filters || null;
        const promptConfig = settings.prompt_config || sourceMeta.llm_prompt_config || null;

        // Analyze repository with new file set
        const analysis = await analyzeRepository({
          supabase,
          userId: user.id,
          repoUrl,
          branch,
          subdir,
          filters,
        });

        // Filter to only selected files
        const selectedFileEntries = (analysis.rawFiles || []).filter(file =>
          selected_files.includes(file.path)
        );

        if (selectedFileEntries.length === 0) {
          return NextResponse.json({
            success: true,
            message: 'Tracked files updated, but no files found to regenerate',
            selected_files: selected_files,
            regenerated: false,
          });
        }

        // Generate new documentation with updated file set, using summaries
        const docResult = await generateDocumentation({
          supabase,
          userId: user.id,
          projectName: submission.title || 'Project',
          model: sourceMeta.model || 'gpt-4o',
          files: selectedFileEntries,
          repoUrl,
          branch,
          subdir,
          promptConfig,
          useSummaries: true,
          submissionId,
        });

        // Update submission with new documentation
        const { error: docUpdateError } = await supabase
          .from('submissions')
          .update({
            markdown: docResult.markdown,
            summary: docResult.markdown.replace(/\s+/g, ' ').slice(0, 200),
            updated_at: new Date().toISOString(),
            // Mark as needing review if it was previously approved
            source_meta: {
              ...sourceMeta,
              approval_status: submission.source_meta?.approval_status === 'approved'
                ? 'pending_review'
                : submission.source_meta?.approval_status,
            },
          })
          .eq('id', submissionId);

        if (docUpdateError) {
          console.error('Failed to update documentation:', docUpdateError);
          // Don't fail the request, files were updated successfully
        }

        return NextResponse.json({
          success: true,
          message: 'Tracked files updated and documentation regenerated',
          selected_files: selected_files,
          regenerated: true,
          files_changed: filesChanged,
        });
      } catch (regenerateError: any) {
        console.error('Regeneration error:', regenerateError);
        // Files were updated, but regeneration failed
        return NextResponse.json({
          success: true,
          message: 'Tracked files updated, but regeneration failed',
          selected_files: selected_files,
          regenerated: false,
          regeneration_error: regenerateError.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: filesChanged
        ? 'Tracked files updated (regeneration skipped)'
        : 'Tracked files unchanged',
      selected_files: selected_files,
      regenerated: false,
      files_changed: filesChanged,
    });
  } catch (err: any) {
    console.error('Update tracked files error:', err);
    return NextResponse.json(
      { error: 'Failed to update tracked files', detail: err.message || String(err) },
      { status: 500 }
    );
  }
}

