import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { analyzeRepository } from '@/lib/server/services/analyzeRepository';

/**
 * POST: Analyze a repository
 * Proxies to FastAPI backend /api/analyze-repo
 */
type AnalyzeRequestBody = {
  repoUrl: string;
  branch?: string | null;
  subdir?: string | null;
  filters?: Record<string, unknown> | null;
};

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const body = (await request.json()) as AnalyzeRequestBody;
    const { repoUrl, branch, subdir, filters } = body;

    if (!repoUrl) {
      return NextResponse.json({ error: 'repoUrl is required' }, { status: 400 });
    }

    const result = await analyzeRepository({
      supabase,
      userId: user.id,
      repoUrl,
      branch: branch ?? undefined,
      subdir,
      filters: filters || null,
    });

    const { rawFiles: _, ...payload } = result;

    return NextResponse.json(payload, { status: 200 });
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

