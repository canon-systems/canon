import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canonicalProvider } from '@/lib/providers';
import { requireWorkspace } from '@/lib/server/organization';

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { supabase } = await requireWorkspace(user);
    const { data: connections, error } = await supabase
      .from('oauth_connections')
      .select('id, provider, connection_id, status, metadata, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .eq('provider', 'slack')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch connections:', error);
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
    }

    const activeConnections = (connections || []).flatMap((connection) => {
      const provider = canonicalProvider(connection.provider);
      if (provider !== 'slack') return [];
      return [{
        ...connection,
        provider,
        platform: 'native',
      }];
    });

    return NextResponse.json({
      connections: activeConnections,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('List connections error:', err);
    return NextResponse.json(
      {
        error: 'Failed to list connections',
        detail: message,
      },
      { status: 500 }
    );
  }
}
