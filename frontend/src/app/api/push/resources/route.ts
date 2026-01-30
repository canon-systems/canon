import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { listResources, listConfluencePages } from '@/lib/server/workspaces/resources';

type OAuthConnectionRow = {
  connection_id?: string;
};

/**
 * GET: List available resources (pages, databases, etc.) for a provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');
    const spaceId = searchParams.get('spaceId');
    const cloudId = searchParams.get('cloudId');

    if (!provider) {
      return NextResponse.json({ error: 'provider parameter is required' }, { status: 400 });
    }

    const { data: connectionData } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('provider', provider)
      .eq('status', 'active')
      .single();
    const connection = connectionData as OAuthConnectionRow | null;

    if (!connection?.connection_id) {
      return NextResponse.json({ error: `No active ${provider} connection found` }, { status: 404 });
    }

    let resources;

    if (provider === 'confluence' && spaceId && cloudId) {
      resources = await listConfluencePages({
        connectionId: connection.connection_id,
        cloudId,
        spaceId,
      });
    } else {
      resources = await listResources(provider, connection.connection_id);
    }

    // Deduplicate by id to avoid showing the same workspace/space twice
    const seen = new Set<string>();
    resources = (resources || []).filter((r) => {
      if (!r?.id) return false;
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    return NextResponse.json(
      {
        success: true,
        resources,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error('List resources error:', err);
    return NextResponse.json(
      {
        error: 'Failed to list resources',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
