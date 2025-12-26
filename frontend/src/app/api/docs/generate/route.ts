import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { generateDocumentation } from '@/lib/server/services/docGenerator';
import { trackDocGenerated } from '@/lib/server/services/usageTracking';
import type { PromptConfig } from '@/lib/server/prompts/buildSystemPrompt';
import { prepareFileSummaries } from '@/lib/server/services/prepareSummaries';

export const runtime = 'nodejs';

type GenerateDocRequestBody = {
  projectName?: string | null;
  files?: Array<{ path?: string; content?: string }>;
  model?: string;
  promptConfig?: PromptConfig | null;
  repoUrl?: string | null;
  branch?: string | null;
  subdir?: string | null;
  prepareFirst?: boolean;
  submissionId?: string;
  useSummaries?: boolean;
};

/**
 * Generate documentation from repository content
 * Maps frontend field names to backend field names
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { user } = await getSession();
    const body = (await request.json().catch(() => ({}))) as GenerateDocRequestBody;
    const projectName = String(body.projectName || 'Project');
    const files = Array.isArray(body.files) ? body.files : [];
    const model = body.model ? String(body.model) : undefined;
    const promptConfig = body.promptConfig || null;
    const repoUrl = body.repoUrl || null;
    const branch = body.branch || null;
    const subdir = body.subdir || null;
    const prepareFirst = body.prepareFirst || false;
    const submissionId = body.submissionId || null;
    const useSummaries = body.useSummaries || false;

    if (!model) {
      return NextResponse.json({ error: 'model is required' }, { status: 400 });
    }

    if (!files.length && !repoUrl) {
      return NextResponse.json({ error: 'Provide files or repoUrl' }, { status: 400 });
    }

    // If prepareFirst is true and we have a submissionId, prepare summaries first
    // Requires authentication for GitHub operations
    if (prepareFirst && submissionId) {
      if (!user) {
        return NextResponse.json({ error: 'Authentication required for preparing summaries' }, { status: 401 });
      }
      try {
        await prepareFileSummaries(supabase, submissionId, false, user.id);
      } catch (prepareError) {
        console.error('Failed to prepare summaries:', prepareError);
        // Continue anyway - will fallback to full content
      }
    }

    // Only use summaries if explicitly requested AND we have both submissionId and repoUrl
    // prepareFirst just prepares summaries for future use, it doesn't mean we should use them now
    const shouldUseSummaries = Boolean(useSummaries && submissionId && repoUrl);

    const result = await generateDocumentation({
      supabase,
      userId: user?.id || null,
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
      useSummaries: shouldUseSummaries,
      submissionId: submissionId || undefined,
    });

    if (user?.id) {
      await trackDocGenerated(supabase, user.id, submissionId || null, null, false);
    }

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
