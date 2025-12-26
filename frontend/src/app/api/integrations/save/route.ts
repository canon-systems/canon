import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { NANGO_CONFIG } from '@/lib/server/nango/config';
import { trackIntegrationConnected } from '@/lib/server/services/usageTracking';

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connectionId, provider } = body as { connectionId: string; provider: string };

    if (!connectionId || !provider) {
      return NextResponse.json({ error: 'Missing connectionId or provider' }, { status: 400 });
    }

    // Verify the connection exists in Nango and get details
    const nangoUrl = new URL(`/connection/${connectionId}`, NANGO_CONFIG.host);
    nangoUrl.searchParams.set('provider_config_key', provider);

    const nangoResponse = await fetch(nangoUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!nangoResponse.ok) {
      const errorText = await nangoResponse.text();
      console.error('Nango connection verification failed:', errorText);
      return NextResponse.json(
        { error: 'Connection not found in Nango' },
        { status: 404 }
      );
    }

    await nangoResponse.json();

    // Map Nango provider names to our internal provider names
    const internalProvider = (provider === 'google' || provider === 'google-docs' || provider === 'googledocs')
      ? 'googledocs'
      : provider; // github, notion, confluence stay as-is

    // Store the connection in Supabase
    const supabase = await createClient();
    const { error: dbError } = await supabase
      .from('oauth_connections')
      .upsert({
        user_id: user.id,
        provider: internalProvider,
        connection_id: connectionId,
        status: 'active',
        metadata: {
          provider_config_key: provider,
          connected_at: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,provider'
      });

    if (dbError) {
      console.error('Failed to store connection:', dbError);
      return NextResponse.json({ error: 'Failed to store connection' }, { status: 500 });
    }

    await trackIntegrationConnected(supabase, user.id, internalProvider, connectionId);

    return NextResponse.json({
      success: true,
      connectionId,
      provider
    });
  } catch (err: any) {
    console.error('Save connection error:', err);
    return NextResponse.json(
      {
        error: 'Failed to save connection',
        detail: err.message || String(err)
      },
      { status: 500 }
    );
  }
}
