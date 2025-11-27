import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { applyTemplateToDoc } from '@/lib/server/services/templateEngine';

/**
 * POST: Apply a template to documentation
 * Proxies to FastAPI backend /api/apply-template
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const body = await request.json();
    const { docId, markdownContent, templateId, templateContent } = body;

    if (!markdownContent && !docId) {
      return NextResponse.json(
        { error: 'Either docId or markdownContent is required' },
        { status: 400 }
      );
    }

    const result = await applyTemplateToDoc({
      supabase,
      userId: user.id,
      docId: docId || null,
      markdownContent: markdownContent || null,
      templateId: templateId || null,
      templateContent: templateContent || null,
    });

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

