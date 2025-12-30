import { createServiceRoleClient } from '@/lib/supabase/server';
import { decryptSecret, encryptSecret, type EncryptedSecret } from '@/lib/server/oauth/tokenCrypto';

async function refreshConfluenceToken(params: {
  refreshToken: string;
}) {
  const clientId = process.env.CONFLUENCE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.CONFLUENCE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Confluence OAuth env for refresh.');
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
    const message = await response.text().catch(() => 'Failed to refresh Confluence token.');
    throw new Error(message);
  }

  return response.json();
}

export async function getProviderAccessToken(params: {
  provider: string;
  connectionId: string;
}): Promise<string | null> {
  const { provider, connectionId } = params;
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('oauth_provider_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('provider', provider)
    .eq('connection_id', connectionId)
    .maybeSingle();

  if (error || !data) return null;

  const encrypted = data.access_token as EncryptedSecret | undefined;
  if (!encrypted) return null;

  const accessToken = decryptSecret(encrypted);

  if (provider === 'confluence') {
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    const refreshTokenEncrypted = data.refresh_token as EncryptedSecret | undefined;
    const now = new Date();

    if (expiresAt && refreshTokenEncrypted && expiresAt.getTime() - now.getTime() < 60_000) {
      try {
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

        await supabase
          .from('oauth_provider_tokens')
          .update({
            access_token: encryptSecret(newAccessToken),
            refresh_token: encryptSecret(newRefreshToken),
            expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('connection_id', connectionId);

        return newAccessToken;
      } catch (refreshError) {
        console.warn('Failed to refresh Confluence token:', refreshError);
      }
    }
  }

  return accessToken;
}
