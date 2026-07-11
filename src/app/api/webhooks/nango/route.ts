import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  providerForNangoIntegration,
  verifyNangoWebhookSignature,
} from '@/lib/server/integrations/nango';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { trackIntegrationStateChanged } from '@/lib/server/services/usageTracking';

export const runtime = 'nodejs';

type NangoWebhookPayload = {
  type?: string;
  operation?: string;
  success?: boolean;
  connectionId?: string;
  providerConfigKey?: string;
  provider?: string;
  authMode?: string;
  environment?: string;
  tags?: Record<string, string | undefined>;
  error?: {
    type?: string;
    description?: string;
  };
};

const log = createLogger('api.webhooks.nango', {
  label: 'Nango Webhook',
  eventLabels: {
    webhook_ignored: 'Webhook Ignored',
    webhook_rejected: 'Webhook Rejected',
    connection_stored: 'Connection Stored',
    connection_error_recorded: 'Connection Error Recorded',
    webhook_failed: 'Webhook Failed',
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-nango-hmac-sha256');

  if (!verifyNangoWebhookSignature(rawBody, signature)) {
    log.warn('webhook_rejected', { reason: 'invalid_signature' });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as NangoWebhookPayload;

    if (payload.type !== 'auth') {
      log.info('webhook_ignored', {
        type: payload.type ?? 'unknown',
        operation: payload.operation ?? 'unknown',
      });
      return NextResponse.json({ ok: true, ignored: true });
    }

    const providerConfigKey = stringValue(payload.providerConfigKey);
    const connectionId = stringValue(payload.connectionId);
    const tags = isRecord(payload.tags) ? payload.tags : {};
    const userId = stringValue(tags.end_user_id);
    const organizationId = stringValue(tags.organization_id);
    const taggedProvider = stringValue(tags.canon_provider);
    const provider = taggedProvider || (providerConfigKey ? providerForNangoIntegration(providerConfigKey) : null);

    if (!connectionId || !providerConfigKey || !userId || !provider) {
      log.warn('webhook_rejected', {
        reason: 'missing_required_fields',
        hasConnectionId: Boolean(connectionId),
        hasProviderConfigKey: Boolean(providerConfigKey),
        hasUserId: Boolean(userId),
        provider: provider ?? 'unknown',
      });
      return NextResponse.json({ error: 'Missing required webhook fields' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const metadata = {
      source: 'nango',
      provider_config_key: providerConfigKey,
      nango_provider: payload.provider ?? null,
      auth_mode: payload.authMode ?? null,
      environment: payload.environment ?? null,
      organization_id: organizationId,
      last_webhook_at: new Date().toISOString(),
      last_webhook_operation: payload.operation ?? null,
      last_webhook_success: payload.success ?? null,
      error_type: payload.error?.type ?? null,
      error_description: payload.error?.description ?? null,
    };

    if (payload.operation === 'refresh' && payload.success === false) {
      const { error } = await supabase
        .from('oauth_connections')
        .update({
          status: 'error',
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('connection_id', connectionId)
        .eq('user_id', userId);

      if (error) throw error;
      log.info('connection_error_recorded', { userId, provider, connectionId });
      return NextResponse.json({ ok: true });
    }

    if ((payload.operation === 'creation' || payload.operation === 'override') && payload.success === true) {
      const { error } = await supabase
        .from('oauth_connections')
        .upsert(
          {
            user_id: userId,
            provider,
            connection_id: connectionId,
            status: 'active',
            metadata,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,provider' }
        );

      if (error) throw error;
      await trackIntegrationStateChanged(supabase, userId, 'connected', provider, connectionId);

      log.info('connection_stored', {
        userId,
        organizationId,
        provider,
        providerConfigKey,
        connectionId,
        operation: payload.operation,
      });
      return NextResponse.json({ ok: true });
    }

    log.info('webhook_ignored', {
      type: payload.type,
      operation: payload.operation ?? 'unknown',
      success: payload.success,
    });
    return NextResponse.json({ ok: true, ignored: true });
  } catch (error) {
    const detail = errorMessage(error);
    log.error('webhook_failed', { error: detail });
    return NextResponse.json({ error: 'Failed to process Nango webhook', detail }, { status: 500 });
  }
}
