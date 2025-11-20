/**
 * API Endpoint: Fetch Confluence Pages
 * 
 * Uses Nango to fetch pages from a specific Confluence space
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { NANGO_CONFIG } from '$lib/server/nango/config';

function jsonResponse(data: unknown, status = 200) {
	return json(data, { status });
}

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return jsonResponse({ error: 'Unauthorized' }, 401);
		}

		const spaceKey = url.searchParams.get('spaceKey');
		if (!spaceKey) {
			return jsonResponse({ error: 'spaceKey is required' }, 400);
		}

		// Find the user's Confluence connection
		const { data: connection, error: connError } = await locals.supabase
			.from('oauth_connections')
			.select('connection_id')
			.eq('user_id', user.id)
			.eq('provider', 'confluence')
			.eq('status', 'active')
			.single();

		if (connError || !connection) {
			return jsonResponse({ error: 'Confluence not connected' }, 404);
		}

		// First, fetch the cloudId for Confluence OAuth
		const accessibleResourcesUrl = new URL('/proxy/oauth/token/accessible-resources', NANGO_CONFIG.host);
		
		const resourcesResponse = await fetch(accessibleResourcesUrl.toString(), {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json',
				'Provider-Config-Key': 'confluence',
				'Connection-Id': connection.connection_id,
				'Base-Url-Override': 'https://api.atlassian.com'
			}
		});

		if (!resourcesResponse.ok) {
			const errorText = await resourcesResponse.text();
			throw new Error(`Failed to get Confluence cloudId: ${resourcesResponse.status} ${errorText}`);
		}

		const resourcesData = await resourcesResponse.json();
		const cloudId = resourcesData[0]?.id || resourcesData.id;

		if (!cloudId) {
			throw new Error('No cloudId found for Confluence connection');
		}

		// Use Nango proxy to fetch Confluence pages in the space with cloudId
		// Confluence Cloud API: GET /ex/confluence/{cloudId}/wiki/rest/api/content?spaceKey={spaceKey}
		// When using Base-Url-Override, the endpoint path should be relative to that base URL
		const endpoint = `/ex/confluence/${cloudId}/wiki/rest/api/content`;
		const nangoUrl = new URL(`/proxy${endpoint}`, NANGO_CONFIG.host);
		nangoUrl.searchParams.set('spaceKey', spaceKey);
		nangoUrl.searchParams.set('limit', '100');
		nangoUrl.searchParams.set('expand', 'space,version');

		const response = await fetch(nangoUrl.toString(), {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json',
				'Provider-Config-Key': 'confluence',
				'Connection-Id': connection.connection_id,
				'Base-Url-Override': 'https://api.atlassian.com' // Explicitly set Atlassian API base URL
			}
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Nango proxy error: ${response.status} ${errorText}`);
		}

		const confluenceData = await response.json();

		return jsonResponse({
			pages: confluenceData.results || []
		});
	} catch (err: any) {
		console.error('Confluence API error:', err);
		return jsonResponse(
			{
				error: 'Failed to fetch Confluence pages',
				detail: err.message || String(err)
			},
			500
		);
	}
};

