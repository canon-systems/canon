import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { NANGO_CONFIG } from '@/lib/server/nango/config';

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { provider = 'notion' } = body as { provider?: string };

    // Validate provider
    if (!(provider in NANGO_CONFIG.providers)) {
      console.error('Invalid provider requested:', provider);
      console.error('Available providers:', Object.keys(NANGO_CONFIG.providers));
      return NextResponse.json({ error: `Invalid provider: ${provider}` }, { status: 400 });
    }

    const providerConfig = NANGO_CONFIG.providers[provider as keyof typeof NANGO_CONFIG.providers];

    console.log('Creating Connect session for provider:', {
      requestedProvider: provider,
      providerConfigKey: providerConfig.providerConfigKey,
      oauthScopes: providerConfig.oauthScopes
    });

    // Verify secret key is set
    if (!NANGO_CONFIG.secretKey) {
      throw new Error('NANGO_SECRET_KEY is not configured. Please set it in your environment variables.');
    }

    // Create a Connect session token using Nango API
    const sessionUrl = new URL('/connect/sessions', NANGO_CONFIG.host).toString();

    const sessionResponse = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        end_user: {
          id: user.id,
          email: user.email || undefined,
          display_name: user.email || undefined
        },
        allowed_integrations: [providerConfig.providerConfigKey]
      })
    });

    if (!sessionResponse.ok) {
      const errorData = await sessionResponse.json().catch(() => ({}));
      const errorText = await sessionResponse.text().catch(() => '');
      console.error('Nango session creation failed:', {
        status: sessionResponse.status,
        statusText: sessionResponse.statusText,
        errorData,
        errorText,
        providerConfigKey: providerConfig.providerConfigKey
      });
      throw new Error(
        errorData.error?.message ||
        errorData.message ||
        errorText ||
        `Failed to create Connect session: ${sessionResponse.status} ${sessionResponse.statusText}`
      );
    }

    const sessionData = await sessionResponse.json();
    const sessionToken = sessionData.data?.token;

    if (!sessionToken) {
      throw new Error('No session token returned from Nango');
    }

    return NextResponse.json({
      sessionToken,
      provider: providerConfig.providerConfigKey
    });
  } catch (err: any) {
    console.error('Connect error:', err);
    return NextResponse.json(
      {
        error: 'Failed to create connection session',
        detail: err.message || String(err)
      },
      { status: 500 }
    );
  }
}

