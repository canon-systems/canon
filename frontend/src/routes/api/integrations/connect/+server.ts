/**
 * API Endpoint: Generate Connect Session Token
 * 
 * Creates a Nango Connect session token for the user to authorize
 * their Notion (or other) account using the Nango frontend SDK
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

		const body = await request.json().catch(() => ({}));
		const { provider = 'notion' } = body as { provider?: string };

		// Validate provider
		if (!(provider in NANGO_CONFIG.providers)) {
			return jsonResponse({ error: `Invalid provider: ${provider}` }, 400);
		}

		const providerConfig = NANGO_CONFIG.providers[provider as keyof typeof NANGO_CONFIG.providers];

		// Verify secret key is set
		if (!NANGO_CONFIG.secretKey) {
			throw new Error('NANGO_SECRET_KEY is not configured. Please set it in your environment variables.');
		}

		// Create a Connect session token using Nango API
		// This is the recommended approach per Nango docs
		const sessionUrl = new URL('/connect/sessions', NANGO_CONFIG.host).toString();
		
		const sessionResponse = await fetch(sessionUrl, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				end_user: {
					id: user.id,
					email: user.email || undefined,
					display_name: user.email || undefined
				},
				allowed_integrations: [providerConfig.providerConfigKey]
			})
		});

		if (!sessionResponse.ok) {
			const errorData = await sessionResponse.json().catch(() => ({}));
			console.error('Nango session creation failed:', errorData);
			throw new Error(
				errorData.error?.message || 
				`Failed to create Connect session: ${sessionResponse.statusText}`
			);
		}

		const sessionData = await sessionResponse.json();
		const sessionToken = sessionData.data?.token;

		if (!sessionToken) {
			throw new Error('No session token returned from Nango');
		}

		return jsonResponse({
			sessionToken,
			provider: providerConfig.providerConfigKey
		});
	} catch (err: any) {
		console.error('Connect session creation error:', err);
		const errorMessage = err.message || String(err);
		return jsonResponse(
			{
				error: 'Failed to create Connect session',
				detail: errorMessage,
				// Include helpful debugging info in development
				...(process.env.NODE_ENV === 'development' && {
					debug: {
						hasSecretKey: !!NANGO_CONFIG.secretKey,
						nangoHost: NANGO_CONFIG.host,
						provider: providerConfig?.providerConfigKey
					}
				})
			},
			500
		);
	}
};

