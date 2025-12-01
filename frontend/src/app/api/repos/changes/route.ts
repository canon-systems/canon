import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectRepositoryChanges } from '@/lib/server/services/changeDetector';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repoId = searchParams.get('repoId');
    const since = searchParams.get('since'); // ISO date string

    if (!repoId) {
      return NextResponse.json(
        { error: 'repoId parameter is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get repository details
    const { data: repo, error: repoError } = await supabase
      .from('workspace_repos')
      .select('id, repo_url, default_branch, workspace_id')
      .eq('id', repoId)
      .single();

    if (repoError || !repo) {
      return NextResponse.json(
        { error: 'Repository not found' },
        { status: 404 }
      );
    }

    // Get the last analysis timestamp if not provided
    let sinceDate: Date;
    if (since) {
      sinceDate = new Date(since);
    } else {
      // Get the last time we checked for changes
      const { data: lastCheck } = await supabase
        .from('repository_setup')
        .select('last_analyzed')
        .eq('repo_id', repoId)
        .single();

      sinceDate = lastCheck?.last_analyzed ? new Date(lastCheck.last_analyzed) : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    }

    console.log(`[change-detection] Checking for changes in ${repo.repo_url} since ${sinceDate.toISOString()}`);

    // Detect repository changes
    const changes = await detectRepositoryChanges({
      supabase,
      userId: repo.workspace_id,
      repoUrl: repo.repo_url,
      branch: repo.default_branch,
      since: sinceDate,
    });

    console.log(`[change-detection] Found ${changes.files_changed.length} changed files, ${changes.files_added.length} added, ${changes.files_removed.length} removed`);

    // Get affected documents (docs that depend on changed files)
    const changedFilePaths = [
      ...changes.files_changed.map(f => f.path),
      ...changes.files_added.map(f => f.path),
    ];

    if (changedFilePaths.length > 0) {
      // Get documents that reference the changed files
      const { data: affectedDocumentFiles, error: relError } = await supabase
        .from('document_files')
        .select(`
          document_id,
          file_path,
          documents!inner(id, title, created_at, updated_at, repo_id)
        `)
        .in('file_path', changedFilePaths);

      if (relError) {
        console.error('Failed to get affected relationships:', relError);
      }

      // Filter to only documents for this repo
      const repoDocuments = (affectedDocumentFiles || [])
        .filter(df => df.documents?.repo_id === repoId);

      // Group by document
      const affectedDocs = new Map();
      repoDocuments.forEach(df => {
        const docId = df.document_id;
        if (!affectedDocs.has(docId)) {
          affectedDocs.set(docId, {
            docId,
            title: df.documents?.title || 'Untitled',
            status: 'completed', // Documents don't have status, all are considered completed
            lastUpdated: df.documents?.updated_at || df.documents?.created_at,
            affectedFiles: [],
          });
        }
        affectedDocs.get(docId).affectedFiles.push({
          path: df.file_path,
          relationship: 'primary', // All files in document_files are primary
        });
      });

      // Update last analyzed timestamp
      await supabase
        .from('repository_setup')
        .update({ last_analyzed: new Date().toISOString() })
        .eq('repo_id', repoId);

      return NextResponse.json({
        changes: {
          filesChanged: changes.files_changed,
          filesAdded: changes.files_added,
          filesRemoved: changes.files_removed,
          totalChanged: changedFilePaths.length,
        },
        affectedDocs: Array.from(affectedDocs.values()),
        summary: {
          hasChanges: changedFilePaths.length > 0,
          docsToUpdate: affectedDocs.size,
          filesToResummarize: changes.files_changed.length,
        }
      });
    }

    return NextResponse.json({
      changes: {
        filesChanged: [],
        filesAdded: [],
        filesRemoved: [],
        totalChanged: 0,
      },
      affectedDocs: [],
      summary: {
        hasChanges: false,
        docsToUpdate: 0,
        filesToResummarize: 0,
      }
    });

  } catch (error) {
    console.error('Change detection failed:', error);
    return NextResponse.json(
      { error: 'Failed to detect changes', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
