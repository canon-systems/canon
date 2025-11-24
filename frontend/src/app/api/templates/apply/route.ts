import { NextRequest, NextResponse } from 'next/server';
import { apiPost } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

/**
 * POST: Apply a template to documentation
 * Proxies to FastAPI backend /api/apply-template
 */
export async function POST(request: NextRequest) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { docId, markdownContent, templateId, templateContent } = body;

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
      template_id: templateId || null,
      template_content: templateContent || null,
    };

    // Call backend API (requires authentication)
    const result = await apiPost<{
      markdown: string;
      template_applied: string;
      changes_summary?: string;
    }>(
      '/api/apply-template',
      backendRequest,
      true, // Requires authentication
      session?.access_token || null
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('Apply template error:', err);
    return NextResponse.json(
      {
        error: 'Failed to apply template',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

