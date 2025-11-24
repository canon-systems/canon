import { NextRequest, NextResponse } from 'next/server';
import { apiPost } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

/**
 * POST: Apply AI fix to documentation
 * Proxies to FastAPI backend /api/apply-ai-fix
 */
export async function POST(request: NextRequest) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { docId, markdownContent, section, issue, instruction, model } = body;

    if (!markdownContent && !docId) {
      return NextResponse.json(
        { error: 'Either docId or markdownContent is required' },
        { status: 400 }
      );
    }

    // Map frontend format to backend format
    const backendRequest = {
      doc_id: docId || null,
      markdown_content: markdownContent || null,
      section: section || null,
      issue: issue || null,
      instruction: instruction || null,
      model: model || null,
    };

    // Call backend API (requires authentication)
    const result = await apiPost<{
      markdown: string;
      fixed_section?: string;
    }>(
      '/api/apply-ai-fix',
      backendRequest,
      true, // Requires authentication
      session?.access_token || null
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('Apply AI fix error:', err);
    return NextResponse.json(
      {
        error: 'Failed to apply AI fix',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

