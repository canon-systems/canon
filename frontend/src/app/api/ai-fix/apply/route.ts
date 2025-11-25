import { NextRequest, NextResponse } from 'next/server';
import { apiPost } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * POST: Apply AI fix to documentation
 * Supports both streaming and non-streaming modes
 */
export async function POST(request: NextRequest) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { docId, markdownContent, section, issue, instruction, model, stream } = body;

    if (!markdownContent && !docId) {
      return NextResponse.json(
        { error: 'Either docId or markdownContent is required' },
        { status: 400 }
      );
    }

    if (!model) {
      return NextResponse.json(
        { error: 'model is required' },
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
      model: model,
    };

    // If streaming is requested, proxy the stream
    if (stream) {
      const backendUrl = `${API_URL}/api/apply-ai-fix/stream`;
      
      const backendResponse = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify(backendRequest),
      });

      if (!backendResponse.ok) {
        const errorData = await backendResponse.json().catch(() => ({}));
        return NextResponse.json(
          { error: errorData.detail || 'Streaming failed' },
          { status: backendResponse.status }
        );
      }

      // Return streaming response
      return new Response(backendResponse.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // Non-streaming: Call backend API (requires authentication)
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

