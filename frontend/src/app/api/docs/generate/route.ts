import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateDocumentation } from '@/lib/server/services/docGenerator';
import type { PromptConfig } from '@/lib/server/prompts/buildSystemPrompt';

type GenerateDocRequestBody = {
  projectName?: string | null;
  files?: Array<{ path?: string; content?: string }>;
  model?: string;
  promptConfig?: PromptConfig | null;
  repoUrl?: string | null;
  branch?: string | null;
  subdir?: string | null;
};

/**
 * Proxy endpoint that forwards requests to the FastAPI backend
 * Maps frontend field names to backend field names
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = (await request.json().catch(() => ({}))) as GenerateDocRequestBody;
    const projectName = String(body.projectName || 'Project');
    const files = Array.isArray(body.files) ? body.files : [];
    const model = body.model ? String(body.model) : undefined;
    const promptConfig = body.promptConfig || null;
    const repoUrl = body.repoUrl || null;
    const branch = body.branch || null;
    const subdir = body.subdir || null;

    if (!model) {
      return NextResponse.json({ error: 'model is required' }, { status: 400 });
    }

    if (!files.length && !repoUrl) {
      return NextResponse.json({ error: 'Provide files or repoUrl' }, { status: 400 });
    }

    const result = await generateDocumentation({
      supabase,
      userId: null,
      projectName,
      model,
      files: files.map((file: any) => ({
        path: String(file?.path || 'unknown'),
        content: String(file?.content || ''),
      })),
      repoUrl,
      branch,
      subdir,
      promptConfig,
    });

    return NextResponse.json({ markdown: result.markdown }, { status: 200 });
  } catch (err: any) {
    console.error('Generate doc error:', err);
    return NextResponse.json(
      {
        error: 'Generator failed',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

