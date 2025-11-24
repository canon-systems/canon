import { NextRequest, NextResponse } from 'next/server';
import { apiGet } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

/**
 * GET: Retrieve a document by ID
 * Proxies to FastAPI backend /api/docs/{docId}
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const result = await apiGet<{
      id: string;
      title: string;
      markdown: string;
      status: string;
      approval_status?: string;
      created_at: string;
      updated_at?: string;
      input_type: string;
      source_meta: any;
      summary?: string;
      error_message?: string;
      is_outdated: boolean;
      code_snapshot?: any;
    }>(
      `/api/docs/${id}`,
      true, // Requires authentication
      session?.access_token || null
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('Get doc error:', err);
    return NextResponse.json(
      {
        error: 'Failed to retrieve document',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

