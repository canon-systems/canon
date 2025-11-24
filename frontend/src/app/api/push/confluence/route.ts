import { NextRequest, NextResponse } from 'next/server';
import { apiPost } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

/**
 * POST: Push documentation to Confluence
 * Proxies to FastAPI backend /api/push/confluence
 */
export async function POST(request: NextRequest) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { docId, title, markdown, workspaceInfo, createNew } = body;

    if (!title || !markdown) {
      return NextResponse.json(
        { error: 'title and markdown are required' },
        { status: 400 }
      );
    }

    // Map frontend format to backend format
    const backendRequest = {
      doc_id: docId || null,
      title: title,
      markdown: markdown,
      workspace_info: workspaceInfo
        ? {
            provider: workspaceInfo.provider || 'confluence',
            resource_id: workspaceInfo.resourceId || null,
            metadata: workspaceInfo.metadata || null,
          }
        : null,
      create_new: createNew !== false, // Default to true
    };

    // Call backend API (requires authentication)
    const result = await apiPost<{
      success: boolean;
      resource_id?: string;
      url?: string;
      workspace_info?: {
        provider: string;
        resource_id?: string;
        metadata?: any;
      };
      message?: string;
    }>(
      '/api/push/confluence',
      backendRequest,
      true, // Requires authentication
      session?.access_token || null
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('Push to Confluence error:', err);
    return NextResponse.json(
      {
        error: 'Failed to push to Confluence',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

