import { NextRequest, NextResponse } from 'next/server';
import { apiGet } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

/**
 * GET: Get a single repository configuration
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const result = await apiGet<{
      id: string;
      workspace_id: string;
      name: string;
      provider: string;
      repo_url: string;
      default_branch: string;
      auth_type: string;
      credentials_ref?: string;
      settings?: any;
      created_at: string;
      updated_at: string;
    }>(
      `/api/repos/${id}`,
      true,
      session?.access_token || null
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('Get repo error:', err);
    return NextResponse.json(
      {
        error: 'Failed to get repository',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

