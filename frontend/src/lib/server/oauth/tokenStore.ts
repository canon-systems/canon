import { createServiceRoleClient } from '@/lib/supabase/server';
import { decryptSecret, encryptSecret, type EncryptedSecret } from '@/lib/server/oauth/tokenCrypto';
import { refreshSlackToken } from '@/lib/server/oauth/slackClient';
import { createLogger } from '@/lib/server/logging';
import { ATLASSIAN_PROVIDER, canonicalProvider } from '@/lib/providers';

const log = createLogger('oauth.atlassian.token', {
  label: 'Atlassian Token',
});

async function refreshConfluenceToken(params: {
  refreshToken: string;
}) {
  const clientId = process.env.ATLASSIAN_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ATLASSIAN_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Atlassian OAuth env for refresh.');
  }

  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: params.refreshToken,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Failed to refresh Atlassian token.');
    try {
      const parsed = JSON.parse(message);
      const code = typeof parsed?.error === 'string' ? parsed.error : '';
      const description = typeof parsed?.error_description === 'string' ? parsed.error_description : '';
      if (code === 'unauthorized_client' || code === 'invalid_grant') {
        log.warn('refresh_invalid', { error: code, description });
        throw new Error(`Atlassian refresh token invalid. Reconnect required. (${description || code})`);
      }
    } catch {
      // fall through with raw message
    }
    log.warn('refresh_failed', { error: message });
    throw new Error(message);
  }

  log.info('refresh_success');
  return response.json();
}

async function markConnectionError(
  supabase: ReturnType<typeof createServiceRoleClient>,
  connectionId: string,
  errorMessage: string
) {
  const { data: connectionRow } = await supabase
    .from('oauth_connections')
    .select('metadata')
    .eq('connection_id', connectionId)
    .maybeSingle();

  const existingMetadata = connectionRow?.metadata && typeof connectionRow.metadata === 'object'
    ? (connectionRow.metadata as Record<string, unknown>)
    : {};

  await supabase
    .from('oauth_connections')
    .update({
      status: 'error',
      metadata: {
        ...existingMetadata,
        token_error: errorMessage,
        token_error_at: new Date().toISOString(),
      },
    })
    .eq('connection_id', connectionId);
}

async function updateTokens(
  supabase: ReturnType<typeof createServiceRoleClient>,
  connectionId: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: string | null
) {
  await supabase
    .from('oauth_provider_tokens')
    .update({
      access_token: encryptSecret(accessToken),
      refresh_token: refreshToken ? encryptSecret(refreshToken) : null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('connection_id', connectionId);
}

export async function getProviderAccessToken(params: {
  provider: string;
  connectionId: string;
}): Promise<string | null> {
  const { provider, connectionId } = params;
  const supabase = createServiceRoleClient();
  const normalizedProvider = canonicalProvider(provider);

  const { data, error } = await supabase
    .from('oauth_provider_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('provider', normalizedProvider)
    .eq('connection_id', connectionId)
    .maybeSingle();

  if (error || !data) return null;

  const encrypted = data.access_token as EncryptedSecret | undefined;
  if (!encrypted) return null;

  const accessToken = decryptSecret(encrypted);

  if (normalizedProvider === ATLASSIAN_PROVIDER) {
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    const refreshTokenEncrypted = data.refresh_token as EncryptedSecret | undefined;
    const now = new Date();

    const shouldRefreshSoon = expiresAt && expiresAt.getTime() - now.getTime() < 5 * 60_000;
    if (expiresAt && refreshTokenEncrypted && shouldRefreshSoon) {
      try {
        const refreshToken = decryptSecret(refreshTokenEncrypted);
        log.info('refresh_due', { connectionId, expiresAt: data.expires_at });
        const refreshed = await refreshConfluenceToken({ refreshToken });

        const newAccessToken = typeof refreshed.access_token === 'string'
          ? refreshed.access_token
          : accessToken;
        const newRefreshToken = typeof refreshed.refresh_token === 'string'
          ? refreshed.refresh_token
          : refreshToken;

        const newExpiresAt = typeof refreshed.expires_in === 'number'
          ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
          : data.expires_at;

        await updateTokens(
          supabase,
          connectionId,
          newAccessToken,
          newRefreshToken || null,
          newExpiresAt
        );

        log.info('refresh_completed', { connectionId, expiresAt: newExpiresAt });
        return newAccessToken;
      } catch (refreshError) {
        log.warn('refresh_error', {
          connectionId,
          error: refreshError instanceof Error ? refreshError.message : String(refreshError),
        });
        const errorMessage = refreshError instanceof Error ? refreshError.message : String(refreshError);
        await markConnectionError(supabase, connectionId, errorMessage);
        throw new Error(errorMessage);
      }
    }
  }

  if (normalizedProvider === 'slack') {
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    const refreshTokenEncrypted = data.refresh_token as EncryptedSecret | undefined;
    const now = new Date();
    const shouldRefreshSoon = expiresAt && expiresAt.getTime() - now.getTime() < 5 * 60_000;

    if (expiresAt && refreshTokenEncrypted && shouldRefreshSoon) {
      try {
        const refreshToken = decryptSecret(refreshTokenEncrypted);
        const refreshed = await refreshSlackToken({ refreshToken });

        const newAccessToken = typeof refreshed.access_token === 'string'
          ? refreshed.access_token
          : accessToken;
        const newRefreshToken = typeof refreshed.refresh_token === 'string'
          ? refreshed.refresh_token
          : refreshToken;
        const newExpiresAt =
          typeof refreshed.expires_in === 'number'
            ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
            : typeof refreshed.expires_at === 'number'
              ? new Date(refreshed.expires_at * 1000).toISOString()
              : data.expires_at;

        await updateTokens(
          supabase,
          connectionId,
          newAccessToken,
          newRefreshToken || null,
          newExpiresAt
        );

        return newAccessToken;
      } catch (refreshError) {
        console.warn('Failed to refresh Slack token:', refreshError);
        const errorMessage = refreshError instanceof Error ? refreshError.message : String(refreshError);
        await markConnectionError(supabase, connectionId, errorMessage);
        throw new Error(errorMessage);
      }
    }
  }

  return accessToken;
}

export async function withConfluenceAccessToken<T>(params: {
  connectionId: string;
  run: (accessToken: string) => Promise<T>;
  onRefresh?: (newAccessToken: string) => Promise<void>;
}): Promise<T> {
  const supabase = createServiceRoleClient();
  const { connectionId } = params;

  const { data, error } = await supabase
    .from('oauth_provider_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('provider', 'atlassian')
    .eq('connection_id', connectionId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Missing Atlassian token.');
  }

  const encrypted = data.access_token as EncryptedSecret | undefined;
  if (!encrypted) throw new Error('Missing Atlassian token.');
  const accessToken = decryptSecret(encrypted);

  try {
    return await params.run(accessToken);
  } catch (err: unknown) {
    const errorObj = err as { status?: number; response?: { status?: number } };
    const status = errorObj?.status || errorObj?.response?.status;
    if (status !== 401) throw err;

    const refreshTokenEncrypted = data.refresh_token as EncryptedSecret | undefined;
    if (!refreshTokenEncrypted) throw err;

    const refreshToken = decryptSecret(refreshTokenEncrypted);
    const refreshed = await refreshConfluenceToken({ refreshToken });
    const newAccessToken = typeof refreshed.access_token === 'string'
      ? refreshed.access_token
      : accessToken;
    const newRefreshToken = typeof refreshed.refresh_token === 'string'
      ? refreshed.refresh_token
      : refreshToken;
    const newExpiresAt = typeof refreshed.expires_in === 'number'
      ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      : data.expires_at;

    await updateTokens(
      supabase,
      connectionId,
      newAccessToken,
      newRefreshToken || null,
      newExpiresAt
    );

    if (params.onRefresh) {
      await params.onRefresh(newAccessToken);
    }

    log.info('refresh_after_401', { connectionId, expiresAt: newExpiresAt });
    console.info('[atlassian][token][refresh_after_401]', { connectionId, expiresAt: newExpiresAt });
    return await params.run(newAccessToken);
  }
}
