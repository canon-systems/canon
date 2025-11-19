/**
 * Get GitHub access token for a user from Nango
 * Returns null if user doesn't have GitHub connected
 * NEVER falls back to global GITHUB_TOKEN - users must connect their own GitHub
 */

import { NANGO_CONFIG } from '@/lib/server/nango/config';

export async function getGitHubTokenForUser(connectionId: string): Promise<string | null> {
	try {
		// Fetch the connection details from Nango
		const nangoUrl = new URL(`/connection/${connectionId}`, NANGO_CONFIG.host);
		nangoUrl.searchParams.set('provider_config_key', 'github');

		const response = await fetch(nangoUrl.toString(), {
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			console.error(`Failed to get GitHub token for connection ${connectionId}: ${response.status}`);
			return null;
		}

		const connectionData = await response.json();

		// Extract the access token from Nango's connection data
		// Nango stores tokens in connection.credentials.access_token
		const accessToken = connectionData.credentials?.access_token || connectionData.access_token;

		if (!accessToken) {
			console.error('No access token found in Nango connection data');
			return null;
		}

		return accessToken;
	} catch (error) {
		console.error('Error fetching GitHub token from Nango:', error);
		return null;
	}
}

