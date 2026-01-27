import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { parseRepoUrl } from '@/lib/server/github/github';
import { analyzeRepository } from '@/lib/server/services/analyzeRepository';
import { generateDocumentation } from '@/lib/server/services/docGenerator';
import { prepareFileSummaries } from '@/lib/server/services/prepareSummaries';
// Removed unused import: createOrUpdateDocument
import { trackDocGenerated } from '@/lib/server/services/usageTracking';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const body = await request.json();
    // Support both documentId and submissionId for backward compatibility
    const documentId = body.documentId || body.submissionId;
    const selected_files = body.selected_files;
    const regenerate = body.regenerate || false;

    if (!documentId || !Array.isArray(selected_files)) {
      return NextResponse.json(
        { error: 'documentId and selected_files array are required' },
        { status: 400 }
      );
    }

    // Get existing document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, source_id, title, configuration, content')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const sourceId = document.source_id;
    // Get source details
    const { data: source, error: repoError } = await supabase
      .from('workspace_sources')
      .select('id, repo_url, external_url, default_branch, user_id, settings, provider')
      .eq('id', sourceId)
      .single();

    if (repoError || !source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    // Verify user has access
    if (source.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const repoUrl = source.repo_url || source.external_url;
    const branch = source.default_branch || 'main';

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid repository URL' },
        { status: 400 }
      );
    }

    const octokit = await getUserOctokit(supabase, user.id, parsed.owner, parsed.repo);

    // Get current commit SHA
    // Removed unused variable: branchData
    await octokit.repos.getBranch({
      owner: parsed.owner,
      repo: parsed.repo,
      branch,
    });
    // Removed unused variable: currentCommitSha

    // Get existing tracked files
    const { data: existingFiles } = await supabase
      .from('document_files')
      .select('file_path')
      .eq('document_id', documentId);

    const oldFilesSet = new Set((existingFiles || []).map(f => f.file_path));
    const newFilesSet = new Set(selected_files);
    const filesChanged =
      oldFilesSet.size !== newFilesSet.size ||
      [...oldFilesSet].some(f => !newFilesSet.has(f)) ||
      [...newFilesSet].some(f => !oldFilesSet.has(f));

    // Update document_files table
    // First, delete files that are no longer in selected_files
    const filesToRemove = [...oldFilesSet].filter(f => !newFilesSet.has(f));

    if (filesToRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from('document_files')
        .delete()
        .eq('document_id', documentId)
        .in('file_path', filesToRemove);

      if (deleteError) {
        console.warn('Failed to remove old files from document_files:', deleteError);
      }
    }

    // Then insert the new files
    const filesToAdd = [...newFilesSet].filter(f => !oldFilesSet.has(f));
    if (filesToAdd.length > 0) {
      const fileMappings = filesToAdd.map(filePath => ({
        document_id: documentId,
        source_id: sourceId,
        file_path: filePath
      }));

      const { error: insertError } = await supabase
        .from('document_files')
        .insert(fileMappings);

      if (insertError) {
        console.warn('Failed to add new files to document_files:', insertError);
      }
    }

    // Update document timestamp
    await supabase
      .from('documents')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    // Regenerate if files changed and regenerate flag is true
    if (filesChanged && regenerate) {
      try {
        const timestamp = new Date().toISOString();
        const filesAdded = filesToAdd.length > 0 ? `Added: ${filesToAdd.slice(0, 3).join(', ')}${filesToAdd.length > 3 ? ` ... and ${filesToAdd.length - 3} more` : ''}` : '';
        const filesRemoved = filesToRemove.length > 0 ? `Removed: ${filesToRemove.slice(0, 3).join(', ')}${filesToRemove.length > 3 ? ` ... and ${filesToRemove.length - 3} more` : ''}` : '';
        const reason = [filesAdded, filesRemoved].filter(Boolean).join('; ') || 'Tracked files changed';
        console.log(`[${timestamp}] [update-tracked-files] Regenerating document: ${document.title} (${documentId})`);
        console.log(`[${timestamp}] [update-tracked-files] Reason: ${reason}`);
        console.log(`[${timestamp}] [update-tracked-files] Files to regenerate: ${selected_files.length} file(s) - ${selected_files.slice(0, 5).join(', ')}${selected_files.length > 5 ? ` ... and ${selected_files.length - 5} more` : ''}`);

        // Prepare summaries first to ensure all files have summaries
        try {
          await prepareFileSummaries(supabase, documentId, false, user.id);
        } catch (prepareError) {
          console.error(`[${timestamp}] Failed to prepare summaries before regeneration:`, prepareError);
          // Continue anyway - will fallback to full content
        }

        // Get repo and document settings if available
        const repoSettings = source.settings || {};
        const subdir = repoSettings.subdir || null;
        const filters = repoSettings.filters || null;
        const repoPromptConfig = repoSettings.llm_prompt_config || repoSettings.prompt_config || null;
        const docConfig = (document as { configuration?: Record<string, unknown> }).configuration || {};
        const resolvedDocumentStructure =
          docConfig.documentStructure ||
          docConfig.document_structure ||
          repoSettings.document_structure ||
          repoPromptConfig?.document_structure ||
          repoPromptConfig?.documentStructure ||
          null;
        const resolvedPromptConfig = {
          personality: docConfig.personality ?? repoPromptConfig?.personality,
          style: docConfig.style ?? repoPromptConfig?.style,
          perspective: docConfig.perspective ?? repoPromptConfig?.perspective,
          customInstructions: docConfig.customInstructions ?? repoPromptConfig?.customInstructions,
          temperature: docConfig.temperature ?? repoPromptConfig?.temperature,
          document_structure: resolvedDocumentStructure || undefined,
        };
        const selectedModel = docConfig.model || repoSettings.model || 'openai/gpt-4o';

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
          projectName: document.title || 'Project',
          model: selectedModel,
          files: selectedFileEntries,
          repoUrl,
          branch,
          subdir,
          promptConfig: resolvedPromptConfig,
          useSummaries: true,
          submissionId: documentId, // Pass documentId for backward compatibility
          existingMarkdown: document.content || '',
          isUpdate: true,
        });

        // Update document with new content
        const { error: docUpdateError } = await supabase
          .from('documents')
          .update({
            content: docResult.markdown,
            updated_at: new Date().toISOString(),
          })
          .eq('id', documentId);

        if (docUpdateError) {
          console.error('Failed to update documentation:', docUpdateError);
          // Don't fail the request, files were updated successfully
        }

        // Create new version
        const { data: versionData } = await supabase.rpc('get_next_document_version', {
          doc_id: documentId
        });
        const versionNumber = versionData || 1;

        await supabase.from('document_versions').insert({
          document_id: documentId,
          version_number: versionNumber,
          content: docResult.markdown,
          change_summary: 'Regenerated with updated tracked files'
        });

        await trackDocGenerated(supabase, user.id, documentId, sourceId, false);

        const timestamp2 = new Date().toISOString();
        console.log(`[${timestamp2}] [update-tracked-files] ✅ Successfully regenerated document: ${document.title}`);

        return NextResponse.json({
          success: true,
          message: 'Tracked files updated and documentation regenerated',
          selected_files: selected_files,
          regenerated: true,
          files_changed: filesChanged,
        });
      } catch (regenerateError: unknown) {
        const timestamp3 = new Date().toISOString();
        console.error(`[${timestamp3}] [update-tracked-files] Regeneration error:`, regenerateError);
        // Files were updated, but regeneration failed
        return NextResponse.json({
          success: true,
          message: 'Tracked files updated, but regeneration failed',
          selected_files: selected_files,
          regenerated: false,
          regeneration_error: regenerateError instanceof Error ? regenerateError.message : String(regenerateError),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: filesChanged
        ? 'Tracked files updated (regeneration skipped)'
        : 'Tracked files unchanged',
      selected_files: Array.from(newFilesSet),
      regenerated: false,
      files_changed: filesChanged,
    });
  } catch (err: unknown) {
    console.error('Update tracked files error:', err);
    return NextResponse.json(
      { error: 'Failed to update tracked files', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
