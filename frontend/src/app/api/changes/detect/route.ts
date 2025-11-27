import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { detectRepositoryChanges } from '@/lib/server/services/changeDetector';

/**
 * POST: Detect changes in a repository
 * Proxies to FastAPI backend /api/detect-changes
 */
type DetectChangesRequestBody = {
  repoUrl?: string | null;
  branch?: string | null;
  commitRange?: string | null;
  submissionId?: string | null;
  diagramId?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const body = (await request.json()) as DetectChangesRequestBody;
    const { repoUrl, branch, commitRange, submissionId, diagramId } = body;

    const result = await detectRepositoryChanges({
      supabase,
      userId: user.id,
      repoUrl: repoUrl || null,
      branch: branch || null,
      commitRange: commitRange || null,
      submissionId: submissionId || null,
      diagramId: diagramId || null,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('Detect changes error:', err);
    return NextResponse.json(
      {
        error: 'Failed to detect changes',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

