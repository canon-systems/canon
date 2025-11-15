/**
 * API Endpoint: Fetch Notion Pages
 * 
 * Uses Nango to fetch pages from the user's connected Notion account
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

		// Find the user's Notion connection
		const { data: connection, error: connError } = await locals.supabase
			.from('oauth_connections')
			.select('connection_id')
			.eq('user_id', user.id)
			.eq('provider', 'notion')
			.eq('status', 'active')
			.single();

		if (connError || !connection) {
			return jsonResponse({ error: 'Notion not connected' }, 404);
		}

		// Use Nango proxy to make Notion API request
		// The correct format is: /proxy/{endpoint} with headers
		const nangoUrl = new URL(`/proxy/v1/search`, NANGO_CONFIG.host);

		const response = await fetch(nangoUrl.toString(), {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json',
				'Provider-Config-Key': 'notion',
				'Connection-Id': connection.connection_id
			},
			body: JSON.stringify({
				filter: {
					property: 'object',
					value: 'page'
				}
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Nango proxy error: ${response.status} ${errorText}`);
		}

		const notionData = await response.json();

		return jsonResponse({
			pages: notionData.results || []
		});
	} catch (err: any) {
		console.error('Notion API error:', err);
		return jsonResponse(
			{
				error: 'Failed to fetch Notion pages',
				detail: err.message || String(err)
			},
			500
		);
	}
};

