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

    // Delete from Nango - this is required to properly disconnect
    if (connectionId && provider) {
      try {
        // Get the provider config to determine the correct provider_config_key
        const providerConfig = NANGO_CONFIG.providers[provider as keyof typeof NANGO_CONFIG.providers];
        if (!providerConfig) {
          console.error('Invalid provider for disconnection:', provider);
          return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
        }

        const nangoUrl = new URL(`/connection/${connectionId}`, NANGO_CONFIG.host);
        nangoUrl.searchParams.set('provider_config_key', providerConfig.providerConfigKey);

        const deleteResponse = await fetch(nangoUrl.toString(), {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!deleteResponse.ok) {
          const errorText = await deleteResponse.text();
          console.error('Failed to delete connection from Nango:', {
            status: deleteResponse.status,
            statusText: deleteResponse.statusText,
            error: errorText,
            connectionId,
            provider: providerConfig.providerConfigKey
          });
          return NextResponse.json({
            error: 'Failed to disconnect from Nango',
            detail: `Nango deletion failed: ${deleteResponse.status} ${deleteResponse.statusText}`
          }, { status: 500 });
        }

        console.log('Successfully deleted connection from Nango:', {
          connectionId,
          provider: providerConfig.providerConfigKey
        });
      } catch (err) {
        console.error('Error deleting from Nango:', err);
        return NextResponse.json({
          error: 'Failed to disconnect from Nango',
          detail: err instanceof Error ? err.message : String(err)
        }, { status: 500 });
      }
    } else if (connectionId && !provider) {
      console.warn('Cannot delete from Nango without provider information');
      // Continue with database cleanup but log the issue
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

