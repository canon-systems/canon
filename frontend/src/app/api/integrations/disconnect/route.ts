import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { NANGO_CONFIG } from '@/lib/server/nango/config';

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

    // Delete from Nango (optional - you may want to keep it for reconnection)
    if (connectionId) {
      try {
        const nangoUrl = new URL(`/connection/${connectionId}`, NANGO_CONFIG.host);
        await fetch(nangoUrl.toString(), {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (err) {
        console.warn('Failed to delete from Nango (may not exist):', err);
        // Continue anyway
      }
    }

    // Remove from database
    const supabase = await createClient();
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

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Disconnect error:', err);
    return NextResponse.json(
      {
        error: 'Failed to disconnect',
        detail: err.message || String(err)
      },
      { status: 500 }
    );
  }
}

