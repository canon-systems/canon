import crypto from 'crypto';

type NangoConnectSessionResponse = {
  data?: {
    token?: string;
    connect_link?: string;
    expires_at?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
  details?: Array<{ field?: string; issue?: string }>;
};

export type NangoConnectionSummary = {
  id: number;
  connection_id: string;
  provider: string;
  provider_config_key: string;
  created?: string;
  metadata?: Record<string, unknown> | null;
  tags?: Record<string, string | undefined>;
  errors?: Array<{ type?: string; log_id?: string }>;
};

type NangoConnectionsListResponse = {
  connections?: NangoConnectionSummary[];
  error?: {
    code?: string;
    message?: string;
  };
};

const NANGO_API_BASE_URL = process.env.NANGO_API_BASE_URL || 'https://api.nango.dev';

const NANGO_PROVIDER_CONFIG: Record<string, { integrationId: string; label: string }> = {
  granola: {
    integrationId:
      process.env.NANGO_GRANOLA_INTEGRATION_ID ||
      process.env.NANGO_GRANOLA_PROVIDER_CONFIG_KEY ||
      'granola',
    label: 'Granola',
  },
};

function getNangoApiKey() {
  const apiKey = process.env.NANGO_API_KEY;
  if (!apiKey) {
    throw new Error('Missing NANGO_API_KEY');
  }
  return apiKey;
}

function nangoUrl(path: string) {
  return `${NANGO_API_BASE_URL.replace(/\/$/, '')}${path}`;
}

async function parseNangoError(response: Response) {
  const data = (await response.json().catch(() => ({}))) as NangoConnectSessionResponse;
  const detail = Array.isArray(data.details)
    ? data.details
        .map((entry) => [entry.field, entry.issue].filter(Boolean).join(': '))
        .filter(Boolean)
        .join('; ')
    : '';
  const message = data.error?.message || data.message || data.error?.code || data.code;
  return [message, detail].filter(Boolean).join(' - ') || `Nango request failed with ${response.status}`;
}

export function supportedNangoProviders() {
  return Object.keys(NANGO_PROVIDER_CONFIG);
}

export function hasNangoApiKey() {
  return Boolean(process.env.NANGO_API_KEY);
}

export function nangoIntegrationForProvider(provider: string) {
  return NANGO_PROVIDER_CONFIG[provider];
}

export function providerForNangoIntegration(integrationId: string) {
  const normalizedIntegrationId = integrationId.trim().toLowerCase();
  return Object.entries(NANGO_PROVIDER_CONFIG).find(([, config]) => (
    config.integrationId.trim().toLowerCase() === normalizedIntegrationId
  ))?.[0] ?? normalizedIntegrationId;
}

export function resolveNangoWebhookUrl(origin: string) {
  if (process.env.NANGO_WEBHOOK_URL) return process.env.NANGO_WEBHOOK_URL;
  const url = new URL('/api/webhooks/nango', origin);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return null;
  return url.toString();
}

export async function createNangoConnectSession(params: {
  provider: string;
  userId: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  organizationId: string;
  organizationName?: string | null;
  webhookUrl?: string | null;
}) {
  const integration = nangoIntegrationForProvider(params.provider);
  if (!integration) {
    throw new Error(`Unsupported Nango provider: ${params.provider}`);
  }

  const body: Record<string, unknown> = {
    tags: {
      end_user_id: params.userId,
      end_user_email: params.userEmail || '',
      end_user_display_name: params.userDisplayName || params.userEmail || params.userId,
      organization_id: params.organizationId,
      organization_name: params.organizationName || '',
      canon_provider: params.provider,
    },
    allowed_integrations: [integration.integrationId],
  };

  if (params.webhookUrl) {
    body.integrations_config_defaults = {
      [integration.integrationId]: {
        connection_config: {
          webhook_url: params.webhookUrl,
        },
      },
    };
  }

  const response = await fetch(nangoUrl('/connect/sessions'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${getNangoApiKey()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await parseNangoError(response));
  }

  const data = (await response.json()) as NangoConnectSessionResponse;
  if (!data.data?.token) {
    throw new Error('Nango did not return a connect session token');
  }

  return {
    token: data.data.token,
    connectLink: data.data.connect_link ?? null,
    expiresAt: data.data.expires_at ?? null,
    integrationId: integration.integrationId,
  };
}

export async function listNangoConnectionsForUser(params: {
  userId: string;
  organizationId: string;
}) {
  const url = new URL(nangoUrl('/connections'));
  url.searchParams.set('tags[end_user_id]', params.userId);
  url.searchParams.set('tags[organization_id]', params.organizationId);
  url.searchParams.set('limit', '100');

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${getNangoApiKey()}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(await parseNangoError(response));
  }

  const data = (await response.json()) as NangoConnectionsListResponse;
  return data.connections ?? [];
}

export async function nangoProxyGet(params: {
  provider: string;
  connectionId: string;
  endpoint: string;
  query?: Record<string, string | number | boolean | null | undefined>;
}) {
  const integration = nangoIntegrationForProvider(params.provider);
  if (!integration) {
    throw new Error(`Unsupported Nango provider: ${params.provider}`);
  }

  const url = new URL(nangoUrl(`/proxy${params.endpoint.startsWith('/') ? params.endpoint : `/${params.endpoint}`}`));
  for (const [key, value] of Object.entries(params.query ?? {})) {
    if (value === null || value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${getNangoApiKey()}`,
      'provider-config-key': integration.integrationId,
      'connection-id': params.connectionId,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(await parseNangoError(response));
  }

  return response.json() as Promise<unknown>;
}

export async function deleteNangoConnection(params: { provider: string; connectionId: string }) {
  const integration = nangoIntegrationForProvider(params.provider);
  if (!integration) return { skipped: true };

  const url = new URL(nangoUrl(`/connections/${encodeURIComponent(params.connectionId)}`));
  url.searchParams.set('provider_config_key', integration.integrationId);

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${getNangoApiKey()}`,
    },
  });

  if (response.status === 404) return { deleted: false, missing: true };
  if (!response.ok) {
    throw new Error(await parseNangoError(response));
  }

  return { deleted: true };
}

export function verifyNangoWebhookSignature(rawBody: string, signature: string | null) {
  const signingKey = process.env.NANGO_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    return process.env.NODE_ENV !== 'production';
  }
  if (!signature) return false;

  const expected = crypto.createHmac('sha256', signingKey).update(rawBody).digest('hex');
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}
