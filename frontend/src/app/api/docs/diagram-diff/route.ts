import { NextRequest, NextResponse } from 'next/server';
import { apiGet } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

/**
 * GET: Get diagram diff
 * Proxies to FastAPI backend /api/diagram-diff?docId=...
 */
export async function GET(request: NextRequest) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const docId = searchParams.get('docId');
    const compareWith = searchParams.get('compareWith');

    if (!docId) {
      return NextResponse.json({ error: 'docId is required' }, { status: 400 });
    }

    const queryParams = new URLSearchParams({ docId });
    if (compareWith) {
      queryParams.append('compareWith', compareWith);
    }

    const result = await apiGet<{
      doc_id: string;
      has_diagram: boolean;
      added_nodes: Array<any>;
      removed_nodes: Array<any>;
      added_edges: Array<any>;
      removed_edges: Array<any>;
      current_diagram_markdown?: string;
    }>(
      `/api/diagram-diff?${queryParams.toString()}`,
      true, // Requires authentication
      session?.access_token || null
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('Get diagram diff error:', err);
    return NextResponse.json(
      {
        error: 'Failed to get diagram diff',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

