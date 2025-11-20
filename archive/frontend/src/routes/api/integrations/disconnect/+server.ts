/**
 * API Endpoint: Disconnect OAuth Connection
 * 
 * Removes an OAuth connection for the user
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { NANGO_CONFIG } from '$lib/server/nango/config';

function jsonResponse(data: unknown, status = 200) {
	return json(data, { status });
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return jsonResponse({ error: 'Unauthorized' }, 401);
		}

		const body = await request.json().catch(() => ({}));
		const { connectionId, provider } = body as { connectionId?: string; provider?: string };

		if (!connectionId && !provider) {
			return jsonResponse({ error: 'Missing connectionId or provider' }, 400);
		}

		// Delete from Nango (optional - you may want to keep it for reconnection)
		if (connectionId) {
			try {
				const nangoUrl = new URL(`/connection/${connectionId}`, NANGO_CONFIG.host);
				await fetch(nangoUrl.toString(), {
					method: 'DELETE',
					headers: {
						'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
						'Content-Type': 'application/json'
					}
				});
			} catch (err) {
				console.warn('Failed to delete from Nango (may not exist):', err);
				// Continue anyway
			}
		}

		// Remove from database
		const query = locals.supabase
			.from('oauth_connections')
			.delete()
			.eq('user_id', user.id);

		if (connectionId) {
			query.eq('connection_id', connectionId);
		} else if (provider) {
			query.eq('provider', provider);
		}

		const { error } = await query;

		if (error) {
			console.error('Failed to disconnect:', error);
			return jsonResponse({ error: 'Failed to disconnect' }, 500);
		}

		return jsonResponse({ success: true });
	} catch (err: any) {
		console.error('Disconnect error:', err);
		return jsonResponse(
			{
				error: 'Failed to disconnect',
				detail: err.message || String(err)
			},
			500
		);
	}
};

