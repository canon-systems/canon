import { NextRequest, NextResponse } from 'next/server';
import { apiPost } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

/**
 * POST: Detect changes in a repository
 * Proxies to FastAPI backend /api/detect-changes
 */
export async function POST(request: NextRequest) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { repoUrl, branch, commitRange, submissionId, diagramId } = body;

    // Map frontend format to backend format
    const backendRequest = {
      repo_url: repoUrl || null,
      branch: branch || 'main',
      commit_range: commitRange || null,
      submission_id: submissionId || null,
      diagram_id: diagramId || null,
    };

    // Call backend API (requires authentication)
    const result = await apiPost<{
      has_changes: boolean;
      commit_changed: boolean;
      files_changed: Array<{ path: string; old_hash?: string; new_hash?: string; status: string }>;
      files_added: string[];
      files_removed: string[];
      architecture_changes?: any;
      summary: string;
      current_commit_sha?: string;
      old_commit_sha?: string;
    }>(
      '/api/detect-changes',
      backendRequest,
      true, // Requires authentication
      session?.access_token || null
    );

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

