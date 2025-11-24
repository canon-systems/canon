import { NextRequest, NextResponse } from 'next/server';
import { apiPost } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

/**
 * POST: Analyze and generate documentation for a repository
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
    const body = await request.json().catch(() => ({}));
    const { generate_diagram = false } = body;

    const result = await apiPost<{
      success: boolean;
      doc_id: string;
      diagram_id?: string;
      message: string;
    }>(
      `/api/repos/${id}/analyze`,
      { generate_diagram },
      true,
      session?.access_token || null
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('Analyze repo error:', err);
    return NextResponse.json(
      {
        error: 'Failed to analyze repository',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

