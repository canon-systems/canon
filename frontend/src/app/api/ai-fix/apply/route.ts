import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { applyAIFixToDoc, streamAIFixToDoc } from '@/lib/server/services/aiFix';

type AIFixRequestBody = {
  docId?: string | null;
  markdownContent?: string | null;
  section?: string | null;
  issue?: string | null;
  instruction?: string | null;
  model: string;
  stream?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const body = (await request.json()) as AIFixRequestBody;
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

    if (stream) {
      const generator = streamAIFixToDoc({
        supabase,
        userId: user.id,
        model,
        docId: docId || null,
        markdownContent: markdownContent || null,
        section: section || null,
        issue: issue || null,
        instruction: instruction || null,
      });

      const streamResponse = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of generator) {
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ chunk })}\n\n`)
              );
            }
            controller.enqueue(new TextEncoder().encode('data: {"done": true}\n\n'));
          } catch (error: any) {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ error: error.message })}\n\n`)
            );
          }
          controller.close();
        },
      });

      return new Response(streamResponse, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    const result = await applyAIFixToDoc({
      supabase,
      userId: user.id,
      model,
      docId: docId || null,
      markdownContent: markdownContent || null,
      section: section || null,
      issue: issue || null,
      instruction: instruction || null,
    });

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

