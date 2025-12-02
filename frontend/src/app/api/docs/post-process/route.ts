import { NextRequest, NextResponse } from 'next/server';
import { trackSubmissionFiles } from '@/lib/server/trackSubmissionFiles';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    // Support both documentId and submissionId for backward compatibility
    const documentId: string | undefined = body.documentId || body.submissionId;

    if (!documentId) {
      return NextResponse.json(
        { error: 'documentId is required in the request body' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: document, error } = await supabase
      .from('documents')
      .select('id, repo_id')
      .eq('id', documentId)
      .single();

    if (error || !document) {
      return NextResponse.json(
        {
          error: 'Document not found',
          details: error?.message
        },
        { status: 404 }
      );
    }

    try {
      // Get document files
      const { data: documentFiles } = await supabase
        .from('document_files')
        .select('file_path')
        .eq('document_id', documentId);

      const filePaths = (documentFiles || []).map(df => df.file_path);

      if (filePaths.length === 0) {
        console.warn(
          `post-process: document ${documentId} has no tracked files`
        );
        return NextResponse.json(
          {
            ok: true,
            message: 'Post-processing skipped (no tracked files)',
            filesTracked: 0
          },
          { status: 200 }
        );
      }

      console.log(
        `post-process: Document ${documentId} has ${filePaths.length} tracked files (already in document_files table)`
      );

      // Files are already tracked in document_files table
      // This endpoint is mainly for backward compatibility
      // In the new schema, files are tracked when the document is created/updated

      return NextResponse.json(
        {
          ok: true,
          message: 'Post-processing completed (files already tracked in document_files)',
          filesTracked: filePaths.length
        },
        { status: 200 }
      );
    } catch (e: any) {
      console.error(`post-process: Failed to post-process document ${documentId}:`, e);
      return NextResponse.json(
        {
          error: 'Failed to post-process document',
          details: e?.message ?? String(e),
          documentId
        },
        { status: 500 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'Post-process failed', detail: String(err) },
      { status: 500 }
    );
  }
}

