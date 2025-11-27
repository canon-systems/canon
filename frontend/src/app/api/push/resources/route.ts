import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { listResources } from '@/lib/server/workspaces/resources';

/**
 * GET: List available resources (pages, databases, etc.) for a provider
 * Proxies to FastAPI backend /api/push/{provider}/resources
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

    if (!provider) {
      return NextResponse.json({ error: 'provider parameter is required' }, { status: 400 });
    }

    const { data: connection } = await supabase
      .from<{ connection_id: string }>('oauth_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('provider', provider)
      .eq('status', 'active')
      .single();

    if (!connection?.connection_id) {
      return NextResponse.json({ error: `No active ${provider} connection found` }, { status: 404 });
    }

    const resources = await listResources(provider, connection.connection_id);

    return NextResponse.json(
      {
        success: true,
        resources,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('List resources error:', err);
    return NextResponse.json(
      {
        error: 'Failed to list resources',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

