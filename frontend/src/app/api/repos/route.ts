import { NextRequest, NextResponse } from 'next/server';
import { apiGet, apiPost } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

/**
 * GET: List all repositories for the workspace
 * POST: Create a new repository configuration
 */
export async function GET(request: NextRequest) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await apiGet<Array<{
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
    }>>(
      '/api/repos',
      true,
      session?.access_token || null
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('List repos error:', err);
    return NextResponse.json(
      {
        error: 'Failed to list repositories',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, provider, repo_url, default_branch, auth_type, credentials_ref, settings } = body;

    if (!name || !repo_url) {
      return NextResponse.json(
        { error: 'name and repo_url are required' },
        { status: 400 }
      );
    }

    const result = await apiPost<{
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
      '/api/repos',
      {
        name,
        provider: provider || 'github',
        repo_url,
        default_branch: default_branch || 'main',
        auth_type: auth_type || 'github_pat',
        credentials_ref,
        settings: settings || {},
      },
      true,
      session?.access_token || null
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('Create repo error:', err);
    return NextResponse.json(
      {
        error: 'Failed to create repository',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}


