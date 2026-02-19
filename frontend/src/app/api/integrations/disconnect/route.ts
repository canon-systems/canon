import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { trackIntegrationStateChanged } from '@/lib/server/services/usageTracking';

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { connectionId, provider } = body as { connectionId?: string; provider?: string };

    if (!connectionId && !provider) {
      return NextResponse.json({ error: 'Missing connectionId or provider' }, { status: 400 });
    }

    const supabase = await createClient();

    // Always delete server-side stored tokens if present for this connection.
    if (connectionId) {
      try {
        const admin = createServiceRoleClient();
        await admin
          .from('oauth_provider_tokens')
          .delete()
          .eq('connection_id', connectionId)
          .eq('user_id', user.id);
      } catch (tokenDeleteError) {
        console.warn('Failed to delete oauth_provider_tokens row:', tokenDeleteError);
      }
    }

    // Remove from database (and capture details for logging)
    let providerForLog = provider;
    if (!providerForLog && connectionId) {
      const { data: existingConnection } = await supabase
        .from('oauth_connections')
        .select('provider')
        .eq('user_id', user.id)
        .eq('connection_id', connectionId)
        .single();
      providerForLog = existingConnection?.provider || providerForLog;
    }

    let query = supabase
      .from('oauth_connections')
      .delete()
      .eq('user_id', user.id);

    if (connectionId) {
      query = query.eq('connection_id', connectionId);
    } else if (provider) {
      query = query.eq('provider', provider);
    }

    const { error } = await query;

    if (error) {
      console.error('Failed to disconnect:', error);
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    }

    try {
      await trackIntegrationStateChanged(supabase, user.id, 'disconnected', providerForLog || 'unknown', connectionId);
    } catch (logError) {
      console.warn('Failed to track integration disconnect:', logError);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('Disconnect error:', err);
    return NextResponse.json(
      {
        error: 'Failed to disconnect',
        detail: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}
