import { NextRequest, NextResponse } from 'next/server';
import { apiPost } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

/**
 * POST: Analyze a repository
 * Proxies to FastAPI backend /api/analyze-repo
 */
export async function POST(request: NextRequest) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { repoUrl, branch, subdir, filters } = body;

    if (!repoUrl) {
      return NextResponse.json({ error: 'repoUrl is required' }, { status: 400 });
    }

    // Map frontend format to backend format
    const backendRequest = {
      repo_url: repoUrl,
      branch: branch || 'main',
      subdir: subdir || null,
      filters: filters || null,
    };

    // Call backend API (requires authentication)
    const result = await apiPost<{
      success: boolean;
      message: string;
      files: Array<{ path: string; size: number; language?: string; hash?: string }>;
      languages: string[];
      detection_result?: any;
      snapshot: any;
    }>(
      '/api/analyze-repo',
      backendRequest,
      true, // Requires authentication
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

