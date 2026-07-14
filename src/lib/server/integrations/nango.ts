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

type NangoConnectionSummary = {
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

type NangoProvider = 'granola' | 'teams' | 'gmail' | 'google_calendar' | 'outlook';

type NangoProviderConfig = {
  integrationId: string;
  aliases?: string[];
  label: string;
  sourceType: 'meeting_notes' | 'team_chat' | 'email' | 'calendar';
  supportsWebhooks: boolean;
  supportsIncrementalSync: boolean;
  supportsConnectionConfigDefaults?: boolean;
};

type NangoRequestParams = {
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  cache?: RequestCache;
};

const NANGO_API_BASE_URL = process.env.NANGO_API_BASE_URL || 'https://api.nango.dev';
const NANGO_REQUEST_TIMEOUT_MS = 15_000;

const NANGO_PROVIDER_CONFIG: Record<NangoProvider, NangoProviderConfig> = {
  granola: {
    integrationId:
      process.env.NANGO_GRANOLA_INTEGRATION_ID ||
      process.env.NANGO_GRANOLA_PROVIDER_CONFIG_KEY ||
      'granola',
    aliases: ['granola'],
    label: 'Granola',
    sourceType: 'meeting_notes',
    supportsWebhooks: true,
    supportsIncrementalSync: true,
    supportsConnectionConfigDefaults: true,
  },
  teams: {
    integrationId:
      process.env.NANGO_TEAMS_INTEGRATION_ID ||
      process.env.NANGO_TEAMS_PROVIDER_CONFIG_KEY ||
      process.env.NANGO_MICROSOFT_TEAMS_INTEGRATION_ID ||
      process.env.NANGO_MICROSOFT_TEAMS_PROVIDER_CONFIG_KEY ||
      'microsoft-teams',
    aliases: ['teams', 'microsoft-teams', 'microsoft_teams', 'ms-teams'],
    label: 'Microsoft Teams',
    sourceType: 'team_chat',
    supportsWebhooks: true,
    supportsIncrementalSync: true,
    supportsConnectionConfigDefaults: true,
  },
  gmail: {
    integrationId:
      process.env.NANGO_GMAIL_INTEGRATION_ID ||
      process.env.NANGO_GMAIL_PROVIDER_CONFIG_KEY ||
      'google-mail',
    aliases: ['gmail', 'google-mail', 'google_mail'],
    label: 'Gmail',
    sourceType: 'email',
    supportsWebhooks: true,
    supportsIncrementalSync: true,
  },
  google_calendar: {
    integrationId:
      process.env.NANGO_GOOGLE_CALENDAR_INTEGRATION_ID ||
      process.env.NANGO_GOOGLE_CALENDAR_PROVIDER_CONFIG_KEY ||
      'google-calendar',
    aliases: ['google-calendar', 'google_calendar', 'gcal'],
    label: 'Google Calendar',
    sourceType: 'calendar',
    supportsWebhooks: true,
    supportsIncrementalSync: true,
  },
  outlook: {
    integrationId:
      process.env.NANGO_OUTLOOK_INTEGRATION_ID ||
      process.env.NANGO_OUTLOOK_PROVIDER_CONFIG_KEY ||
      process.env.NANGO_MICROSOFT_OUTLOOK_INTEGRATION_ID ||
      process.env.NANGO_MICROSOFT_OUTLOOK_PROVIDER_CONFIG_KEY ||
      'outlook',
    aliases: ['outlook', 'microsoft-outlook', 'microsoft_outlook', 'office365-mail', 'office365'],
    label: 'Outlook',
    sourceType: 'email',
    supportsWebhooks: true,
    supportsIncrementalSync: true,
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

async function nangoRequest<T>(params: NangoRequestParams): Promise<T> {
  const requestId = crypto.randomUUID();
  const url = new URL(nangoUrl(params.path));

  for (const [key, value] of Object.entries(params.query ?? {})) {
    if (value === null || value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: params.method ?? 'GET',
    headers: {
      authorization: `Bearer ${getNangoApiKey()}`,
      'x-canon-request-id': requestId,
      ...(params.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(params.headers ?? {}),
    },
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
    cache: params.cache,
    signal: AbortSignal.timeout(NANGO_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${await parseNangoError(response)} (requestId: ${requestId})`);
  }

  if (response.status === 204) return {} as T;
  const responseText = await response.text();
  return responseText ? JSON.parse(responseText) as T : {} as T;
}

function isNangoProvider(provider: string): provider is NangoProvider {
  return provider in NANGO_PROVIDER_CONFIG;
}

export function supportedNangoProviders(): string[] {
  return Object.keys(NANGO_PROVIDER_CONFIG);
}

export function hasNangoApiKey() {
  return Boolean(process.env.NANGO_API_KEY);
}

export function nangoIntegrationForProvider(provider: string) {
  if (!isNangoProvider(provider)) return undefined;
  return NANGO_PROVIDER_CONFIG[provider];
}

export function providerForNangoIntegration(integrationId: string) {
  const normalizedIntegrationId = integrationId.trim().toLowerCase();
  return Object.entries(NANGO_PROVIDER_CONFIG).find(([, config]) => {
    const knownIntegrationIds = [config.integrationId, ...(config.aliases ?? [])];
    return knownIntegrationIds.some((id) => id.trim().toLowerCase() === normalizedIntegrationId);
  })?.[0] ?? normalizedIntegrationId;
}

export function resolveNangoWebhookUrl(origin: string) {
  if (process.env.NANGO_WEBHOOK_URL) return process.env.NANGO_WEBHOOK_URL;
  const url = new URL('/api/webhooks/nango', origin);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return null;
  return url.toString();
}

function nangoTags(tags: Record<string, string | null | undefined>) {
  return Object.fromEntries(
    Object.entries(tags)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : ''] as const)
      .filter(([, value]) => value.length > 0)
  );
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
    tags: nangoTags({
      end_user_id: params.userId,
      end_user_email: params.userEmail,
      end_user_display_name: params.userDisplayName || params.userEmail || params.userId,
      organization_id: params.organizationId,
      organization_name: params.organizationName,
      canon_provider: params.provider,
    }),
    allowed_integrations: [integration.integrationId],
  };

  if (params.webhookUrl && integration.supportsConnectionConfigDefaults) {
    body.integrations_config_defaults = {
      [integration.integrationId]: {
        connection_config: {
          webhook_url: params.webhookUrl,
        },
      },
    };
  }

  const data = await nangoRequest<NangoConnectSessionResponse>({
    path: '/connect/sessions',
    method: 'POST',
    body,
  });
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

export async function listNangoConnectionsForOrganization(params: {
  organizationId: string;
}) {
  const data = await nangoRequest<NangoConnectionsListResponse>({
    path: '/connections',
    query: {
      'tags[organization_id]': params.organizationId,
      limit: 100,
    },
    cache: 'no-store',
  });
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

  return nangoRequest<unknown>({
    path: `/proxy${params.endpoint.startsWith('/') ? params.endpoint : `/${params.endpoint}`}`,
    query: params.query,
    headers: {
      'provider-config-key': integration.integrationId,
      'connection-id': params.connectionId,
    },
    cache: 'no-store',
  });
}

export async function nangoProxyPost(params: {
  provider: string;
  connectionId: string;
  endpoint: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
}) {
  const integration = nangoIntegrationForProvider(params.provider);
  if (!integration) {
    throw new Error(`Unsupported Nango provider: ${params.provider}`);
  }

  return nangoRequest<unknown>({
    path: `/proxy${params.endpoint.startsWith('/') ? params.endpoint : `/${params.endpoint}`}`,
    method: 'POST',
    query: params.query,
    body: params.body,
    headers: {
      'provider-config-key': integration.integrationId,
      'connection-id': params.connectionId,
    },
    cache: 'no-store',
  });
}

export async function deleteNangoConnection(params: { provider: string; connectionId: string }) {
  const integration = nangoIntegrationForProvider(params.provider);
  if (!integration) return { skipped: true };

  try {
    await nangoRequest<unknown>({
      path: `/connections/${encodeURIComponent(params.connectionId)}`,
      method: 'DELETE',
      query: { provider_config_key: integration.integrationId },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Nango request failed with 404')) {
      return { deleted: false, missing: true };
    }
    throw error;
  }

  return { deleted: true };
}

export function verifyNangoWebhookSignature(rawBody: string, signature: string | null) {
  const signingKey = process.env.NANGO_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    return process.env.ALLOW_UNSIGNED_NANGO_WEBHOOKS === 'true';
  }
  if (!signature) return false;

  const expected = crypto.createHmac('sha256', signingKey).update(rawBody).digest('hex');
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}
