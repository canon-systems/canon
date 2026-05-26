import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/server/logging';
import { trackIntegrationStateChanged } from '@/lib/server/services/usageTracking';
import { encodeGongCredentials, GONG_PROVIDER, normalizeApiBaseUrl } from '@/lib/server/oauth/gongCredentials';

export const dynamic = 'force-dynamic';

const log = createLogger('api.integrations.gong.connect', {
  label: 'Gong Integration',
  eventLabels: {
    connect_requested: 'Connect Requested',
    connect_complete: 'Connect Complete',
    connect_failed: 'Connect Failed',
  },
});

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function verifyGongCredentials(params: {
  accessKey: string;
  accessKeySecret: string;
  apiBaseUrl: string;
}) {
  const authorization = `Basic ${Buffer.from(`${params.accessKey}:${params.accessKeySecret}`, 'utf8').toString('base64')}`;
  const toDateTime = new Date().toISOString();
  const fromDateTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url = new URL('/v2/calls', params.apiBaseUrl);
  url.searchParams.set('fromDateTime', fromDateTime);
  url.searchParams.set('toDateTime', toDateTime);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: authorization,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('Gong rejected these credentials.');
  }

  if (!response.ok && response.status !== 404) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `Gong credential check failed with status ${response.status}.`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const accessKey = stringField(body.accessKey);
    const accessKeySecret = stringField(body.accessKeySecret);
    const apiBaseUrl = normalizeApiBaseUrl(stringField(body.apiBaseUrl) || undefined);

    if (!accessKey || !accessKeySecret) {
      return NextResponse.json({ error: 'Gong access key and secret are required.' }, { status: 400 });
    }

    log.info('connect_requested', { userId: user.id, apiBaseUrl });
    await verifyGongCredentials({ accessKey, accessKeySecret, apiBaseUrl });

    const supabase = createServiceRoleClient();
    const connectionId = `gong:${user.id}`;
    const now = new Date().toISOString();

    const { error: connectionError } = await supabase
      .from('oauth_connections')
      .upsert({
        user_id: user.id,
        provider: GONG_PROVIDER,
        connection_id: connectionId,
        status: 'active',
        metadata: {
          source: 'api_key',
          auth_method: 'basic',
          api_base_url: apiBaseUrl,
        },
        updated_at: now,
      }, { onConflict: 'user_id,provider' });

    if (connectionError) throw connectionError;

    const { error: tokenError } = await supabase
      .from('oauth_provider_tokens')
      .upsert({
        user_id: user.id,
        connection_id: connectionId,
        provider: GONG_PROVIDER,
        provider_account_id: null,
        access_token: encodeGongCredentials(accessKey, accessKeySecret),
        refresh_token: null,
        token_type: 'basic',
        scope: 'api:calls:read:basic api:calls:read:transcript',
        expires_at: null,
        updated_at: now,
      }, { onConflict: 'connection_id' });

    if (tokenError) throw tokenError;

    await trackIntegrationStateChanged(supabase, user.id, 'connected', GONG_PROVIDER, connectionId);

    log.info('connect_complete', { userId: user.id, connectionId, apiBaseUrl });
    return NextResponse.json({ ok: true, connectionId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('connect_failed', { error: message });
    return NextResponse.json({ error: 'Failed to connect Gong', detail: message }, { status: 500 });
  }
}
