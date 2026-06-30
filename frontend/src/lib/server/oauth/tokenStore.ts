import { createServiceRoleClient } from '@/lib/supabase/server';
import { decryptSecret, encryptSecret, type EncryptedSecret } from '@/lib/server/oauth/tokenCrypto';
import { refreshSlackToken } from '@/lib/server/oauth/slackClient';
import { canonicalProvider } from '@/lib/providers';

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
