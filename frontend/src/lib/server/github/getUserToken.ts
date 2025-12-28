/**
 * Get GitHub access token for a user from our database
 * Returns null if user doesn't have GitHub connected
 * NEVER falls back to global GITHUB_TOKEN - users must connect their own GitHub
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { createGitHubOAuthClient } from '@/lib/server/oauth/githubClient';
import { decryptSecret, encryptSecret, type EncryptedSecret } from '@/lib/server/oauth/tokenCrypto';

export async function getGitHubTokenForUser(connectionId: string): Promise<string | null> {
	try {
		const supabase = createServiceRoleClient();
		const { data: tokenRow, error } = await supabase
			.from('oauth_provider_tokens')
			.select('access_token, refresh_token, expires_at, token_type, scope')
			.eq('connection_id', connectionId)
			.eq('provider', 'github')
			.maybeSingle();

		if (error || !tokenRow) {
			return null;
		}

		const encryptedAccess = tokenRow.access_token as EncryptedSecret | undefined;
		const encryptedRefresh = (tokenRow.refresh_token as EncryptedSecret | null | undefined) ?? null;
		const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at).toISOString() : null;

		if (!encryptedAccess) return null;

		const shouldRefresh = (() => {
			if (!expiresAt) return false;
			const exp = new Date(expiresAt).getTime();
			if (Number.isNaN(exp)) return false;
			return Date.now() > exp - 60_000;
		})();

		if (shouldRefresh && encryptedRefresh) {
			try {
				const refreshToken = decryptSecret(encryptedRefresh);
				const client = createGitHubOAuthClient();
				const refreshed = await client.refresh(refreshToken);

				const newAccess = refreshed.access_token;
				if (!newAccess) {
					return null;
				}

				const newExpiresAt =
					typeof refreshed.expires_at === 'number' ? new Date(refreshed.expires_at * 1000).toISOString() : null;

				const { error: updateError } = await supabase
					.from('oauth_provider_tokens')
					.update({
						access_token: encryptSecret(newAccess),
						refresh_token: refreshed.refresh_token ? encryptSecret(refreshed.refresh_token) : encryptedRefresh,
						token_type: refreshed.token_type || tokenRow.token_type || null,
						scope: refreshed.scope || tokenRow.scope || null,
						expires_at: newExpiresAt ?? tokenRow.expires_at ?? null,
						updated_at: new Date().toISOString()
					})
					.eq('connection_id', connectionId)
					.eq('provider', 'github');

				if (updateError) {
					console.error('Failed to persist refreshed GitHub token:', updateError);
				}

				return newAccess;
			} catch (refreshError) {
				console.error('Error refreshing GitHub token:', refreshError);
				return null;
			}
		}

		return decryptSecret(encryptedAccess);
	} catch (error) {
		console.error('Error fetching GitHub token from database:', error);
		return null;
	}
}
