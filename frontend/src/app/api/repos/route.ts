import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

type CreateRepoBody = {
  name: string;
  provider?: string;
  repo_url: string;
  default_branch?: string;
  auth_type?: string;
  credentials_ref?: string | null;
  settings?: Record<string, unknown>;
};

/**
 * GET: List all repositories for the workspace
 * POST: Create a new repository configuration
 */
export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('workspace_repos')
      .select('*')
      .eq('workspace_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json(data || [], { status: 200 });
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
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const body = (await request.json()) as CreateRepoBody;
    const { name, provider, repo_url, default_branch, auth_type, credentials_ref, settings } = body;

    if (!name || !repo_url) {
      return NextResponse.json({ error: 'name and repo_url are required' }, { status: 400 });
    }

    const insert = {
      workspace_id: user.id,
      name,
      provider: provider || 'github',
      repo_url,
      default_branch: default_branch || 'main',
      auth_type: auth_type || 'github_pat',
      credentials_ref,
      settings: settings || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('workspace_repos').insert(insert).select().single();

    if (error || !data) {
      throw error || new Error('Failed to create repository');
    }

    return NextResponse.json(data, { status: 200 });
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


