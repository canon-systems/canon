import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

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
      .eq('workspace_id', user.id)
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


