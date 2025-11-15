/**
 * API Endpoint: Save OAuth Connection
 * 
 * Saves a connection created via Nango Connect UI to Supabase
 * Called from the frontend when the connect event fires
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { NANGO_CONFIG } from '$lib/server/nango/config';

function jsonResponse(data: unknown, status = 200) {
	return json(data, { status });
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Ensure user is authenticated
		const { user } = await locals.safeGetSession();
		if (!user) {
			return jsonResponse({ error: 'Unauthorized' }, 401);
		}

		const body = await request.json();
		const { connectionId, provider } = body as { connectionId: string; provider: string };

		if (!connectionId || !provider) {
			return jsonResponse({ error: 'Missing connectionId or provider' }, 400);
		}

		// Verify the connection exists in Nango and get details
		const nangoUrl = new URL(`/connection/${connectionId}`, NANGO_CONFIG.host);
		nangoUrl.searchParams.set('provider_config_key', provider);
		
		const nangoResponse = await fetch(nangoUrl.toString(), {
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json'
			}
		});

		if (!nangoResponse.ok) {
			const errorText = await nangoResponse.text();
			console.error('Nango connection verification failed:', errorText);
			return jsonResponse(
				{ error: 'Connection not found in Nango' },
				404
			);
		}

		const connectionData = await nangoResponse.json();

		// Store the connection in Supabase
		const { error: dbError } = await locals.supabase
			.from('oauth_connections')
			.upsert({
				user_id: user.id,
				provider: provider,
				connection_id: connectionId,
				status: 'active',
				metadata: {
					provider_config_key: provider,
					connected_at: new Date().toISOString(),
					// Store any additional metadata from Nango if needed
				},
				updated_at: new Date().toISOString()
			}, {
				onConflict: 'user_id,provider'
			});

		if (dbError) {
			console.error('Failed to store connection:', dbError);
			return jsonResponse({ error: 'Failed to store connection' }, 500);
		}

		return jsonResponse({
			success: true,
			connectionId,
			provider
		});
	} catch (err: any) {
		console.error('Save connection error:', err);
		return jsonResponse(
			{
				error: 'Failed to save connection',
				detail: err.message || String(err)
			},
			500
		);
	}
};

