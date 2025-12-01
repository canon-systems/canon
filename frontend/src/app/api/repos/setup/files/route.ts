import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repoId = searchParams.get('repoId');

    if (!repoId) {
      return NextResponse.json(
        { error: 'repoId parameter is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get repository setup to ensure it's ready
    const { data: setup, error: setupError } = await supabase
      .from('repository_setup')
      .select('setup_status, total_files, summarized_files')
      .eq('repo_id', repoId)
      .single();

    if (setupError || !setup) {
      return NextResponse.json(
        { error: 'Repository setup not found' },
        { status: 404 }
      );
    }

    if (setup.setup_status !== 'ready') {
      return NextResponse.json(
        { error: 'Repository setup is not complete', status: setup.setup_status },
        { status: 400 }
      );
    }

    // Get all file summaries for this repository
    const { data: fileSummaries, error: summariesError } = await supabase
      .from('repo_file_summaries')
      .select('file_path, summary_text, summary_json, created_at, last_regenerated')
      .ilike('repo_id', `github.com/%/${repoId.split('/').pop()}`) // Match repo pattern
      .order('file_path');

    if (summariesError) {
      console.error('Failed to get file summaries:', summariesError);
      return NextResponse.json(
        { error: 'Failed to load file summaries' },
        { status: 500 }
      );
    }

    // Get existing document files for this repo
    // First get all documents for this repo
    const { data: repo } = await supabase
      .from('workspace_repos')
      .select('id')
      .eq('id', repoId)
      .single();

    let documentFiles: any[] = [];
    if (repo) {
      const { data: docs } = await supabase
        .from('documents')
        .select('id')
        .eq('repo_id', repo.id);

      if (docs && docs.length > 0) {
        const docIds = docs.map(d => d.id);
        const { data: files } = await supabase
          .from('document_files')
          .select('file_path, document_id')
          .in('document_id', docIds);

        documentFiles = files || [];
      }
    }

    // Return flat array of file summaries (component expects array, not tree)
    // Transform fileSummaries to match expected format
    const files = (fileSummaries || []).map(summary => ({
      file_path: summary.file_path,
      summary_text: summary.summary_text,
      summary_json: summary.summary_json,
      created_at: summary.created_at,
      last_regenerated: summary.last_regenerated,
    }));

    return NextResponse.json({
      files: files, // Return flat array instead of tree
      relationships: documentFiles.map(f => ({
        doc_id: f.document_id,
        file_path: f.file_path,
        relationship_type: 'primary'
      })),
      summary: {
        totalFiles: setup.total_files,
        summarizedFiles: setup.summarized_files,
        selectedFiles: documentFiles.length,
      }
    });

  } catch (error) {
    console.error('Failed to get repository files:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { repoId, docId, selectedFiles } = await request.json();

    if (!repoId || !docId || !Array.isArray(selectedFiles)) {
      return NextResponse.json(
        { error: 'repoId, docId, and selectedFiles array are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Verify user has access to this repository and document
    const { data: repo, error: repoError } = await supabase
      .from('workspace_repos')
      .select('id, workspace_id')
      .eq('id', repoId)
      .single();

    if (repoError || !repo) {
      return NextResponse.json(
        { error: 'Repository not found' },
        { status: 404 }
      );
    }

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, repo_id')
      .eq('id', docId)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Verify document belongs to this repo
    if (doc.repo_id !== repoId) {
      return NextResponse.json(
        { error: 'Document does not belong to this repository' },
        { status: 403 }
      );
    }

    // Remove existing file mappings for this doc
    const { error: deleteError } = await supabase
      .from('document_files')
      .delete()
      .eq('document_id', docId);

    if (deleteError) {
      console.error('Failed to delete existing file mappings:', deleteError);
      return NextResponse.json(
        { error: 'Failed to update file mappings' },
        { status: 500 }
      );
    }

    // Create new file mappings
    const fileMappings = selectedFiles.map(filePath => ({
      document_id: docId,
      file_path: filePath,
    }));

    const { data: newMappings, error: insertError } = await supabase
      .from('document_files')
      .insert(fileMappings)
      .select();

    if (insertError) {
      console.error('Failed to create relationships:', insertError);
      return NextResponse.json(
        { error: 'Failed to create file relationships' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      relationships: newMappings?.map(m => ({
        doc_id: m.document_id,
        file_path: m.file_path,
        relationship_type: 'primary'
      })) || [],
      count: newMappings?.length || 0,
    });

  } catch (error) {
    console.error('Failed to update file relationships:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function buildFileTree(fileSummaries: any[]) {
  const tree: any = {};

  fileSummaries.forEach(summary => {
    const parts = summary.file_path.split('/');
    let current = tree;

    parts.forEach((part: string, index: number) => {
      if (!current[part]) {
        current[part] = {
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          type: index === parts.length - 1 ? 'file' : 'folder',
          children: index === parts.length - 1 ? undefined : {},
        };
      }

      if (index === parts.length - 1) {
        // Add file metadata
        current[part] = {
          ...current[part],
          summary: summary.summary_text,
          lastModified: summary.created_at,
          lastRegenerated: summary.last_regenerated,
        };
      } else {
        current = current[part].children;
      }
    });
  });

  return tree;
}
