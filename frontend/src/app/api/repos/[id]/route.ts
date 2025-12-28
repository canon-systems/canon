import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { trackRepoDisconnected } from '@/lib/server/services/usageTracking';

/**
 * GET: Get a single repository configuration
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { id } = await params;

    const { data, error } = await supabase
      .from('workspace_repos')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    return NextResponse.json(data, { status: 200 });
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

/**
 * PATCH: Update a repository configuration
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { id } = await params;
    const updates = await request.json();

    // Only allow updating certain fields
    const allowedFields = ['default_branch'];
    const filteredUpdates: any = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('workspace_repos')
      .update(filteredUpdates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error('Update repo error:', err);
    return NextResponse.json(
      {
        error: 'Failed to update repository',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE: Delete a repository configuration
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { id } = await params;

    const { data: repo, error: repoError } = await supabase
      .from('workspace_repos')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (repoError || !repo) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('workspace_repos')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    try {
      await trackRepoDisconnected(
        supabase,
        user.id,
        id,
        repo.repo_url,
        repo.default_branch,
        repo.provider
      );
    } catch (logError) {
      console.warn('Failed to track repo disconnect:', logError);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error('Delete repo error:', err);
    return NextResponse.json(
      {
        error: 'Failed to delete repository',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}
