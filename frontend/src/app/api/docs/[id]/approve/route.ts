import { NextRequest, NextResponse } from 'next/server';
import { apiPost } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

/**
 * POST: Approve a document
 * Proxies to FastAPI backend /api/docs/{docId}/approve
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const result = await apiPost<{
      success: boolean;
      doc_id: string;
      approval_status: string;
      approved_at?: string;
      approved_by: string;
    }>(
      `/api/docs/${id}/approve`,
      {},
      true, // Requires authentication
      session?.access_token || null
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('Approve doc error:', err);
    return NextResponse.json(
      {
        error: 'Failed to approve document',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

