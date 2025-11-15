/**
 * API Endpoint: List User's OAuth Connections
 * 
 * Returns all active OAuth connections for the current user
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

function jsonResponse(data: unknown, status = 200) {
	return json(data, { status });
}

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return jsonResponse({ error: 'Unauthorized' }, 401);
		}

		// Fetch all connections for this user
		const { data: connections, error } = await locals.supabase
			.from('oauth_connections')
			.select('*')
			.eq('user_id', user.id)
			.eq('status', 'active')
			.order('updated_at', { ascending: false });

		if (error) {
			console.error('Failed to fetch connections:', error);
			return jsonResponse({ error: 'Failed to fetch connections' }, 500);
		}

		return jsonResponse({
			connections: connections || []
		});
	} catch (err: any) {
		console.error('List connections error:', err);
		return jsonResponse(
			{
				error: 'Failed to list connections',
				detail: err.message || String(err)
			},
			500
		);
	}
};

