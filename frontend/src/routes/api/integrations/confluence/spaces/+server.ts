/**
 * API Endpoint: Fetch Confluence Spaces
 * 
 * Uses Nango to fetch spaces from the user's connected Confluence account
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { NANGO_CONFIG } from '$lib/server/nango/config';

function jsonResponse(data: unknown, status = 200) {
	return json(data, { status });
}

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return jsonResponse({ error: 'Unauthorized' }, 401);
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
		// Confluence OAuth requires cloudId to construct API paths
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
			console.error('Failed to fetch Confluence cloudId:', {
				status: resourcesResponse.status,
				statusText: resourcesResponse.statusText,
				error: errorText,
				url: accessibleResourcesUrl.toString()
			});
			throw new Error(`Failed to get Confluence cloudId: ${resourcesResponse.status} ${errorText}`);
		}

		const resourcesData = await resourcesResponse.json().catch(() => null);
		
		if (!resourcesData) {
			const errorText = await resourcesResponse.text();
			console.error('Failed to parse Confluence resources response:', errorText);
			throw new Error('Invalid response from accessible-resources endpoint');
		}
		
		console.log('Confluence accessible resources:', {
			data: resourcesData,
			isArray: Array.isArray(resourcesData),
			firstItem: Array.isArray(resourcesData) ? resourcesData[0] : null,
			keys: Object.keys(resourcesData)
		});
		
		// Handle both array and object responses
		const cloudId = Array.isArray(resourcesData) 
			? resourcesData[0]?.id 
			: resourcesData.id || resourcesData.cloudId;

		if (!cloudId) {
			console.error('No cloudId found in resources:', resourcesData);
			throw new Error('No cloudId found for Confluence connection');
		}

		console.log('Using cloudId:', cloudId);

		// Use Nango proxy to fetch Confluence spaces with cloudId
		// Confluence Cloud API: GET /ex/confluence/{cloudId}/wiki/rest/api/space
		// When using Base-Url-Override, the endpoint path should be relative to that base URL
		const endpoint = `/ex/confluence/${cloudId}/wiki/rest/api/space`;
		const nangoUrl = new URL(`/proxy${endpoint}`, NANGO_CONFIG.host);
		nangoUrl.searchParams.set('limit', '100');
		
		console.log('Fetching Confluence spaces:', {
			endpoint,
			fullUrl: nangoUrl.toString(),
			baseUrlOverride: 'https://api.atlassian.com'
		});

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
			console.error('Confluence spaces fetch failed:', {
				status: response.status,
				statusText: response.statusText,
				error: errorText,
				url: nangoUrl.toString(),
				connectionId: connection.connection_id
			});
			throw new Error(`Nango proxy error: ${response.status} ${errorText}`);
		}

		const confluenceData = await response.json();
		console.log('Confluence spaces response:', {
			hasResults: !!confluenceData.results,
			resultsLength: confluenceData.results?.length,
			keys: Object.keys(confluenceData)
		});

		// Confluence API returns spaces in results array
		const spaces = confluenceData.results || confluenceData || [];

		return jsonResponse({
			spaces: Array.isArray(spaces) ? spaces : []
		});
	} catch (err: any) {
		console.error('Confluence API error:', err);
		return jsonResponse(
			{
				error: 'Failed to fetch Confluence spaces',
				detail: err.message || String(err)
			},
			500
		);
	}
};

