/**
 * API Endpoint: Fetch Google Docs Documents
 * 
 * Uses Nango to fetch documents from the user's connected Google account
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

		// Find the user's Google Docs connection
		const { data: connection, error: connError } = await locals.supabase
			.from('oauth_connections')
			.select('connection_id')
			.eq('user_id', user.id)
			.eq('provider', 'googledocs')
			.eq('status', 'active')
			.single();

		if (connError || !connection) {
			return jsonResponse({ error: 'Google Docs not connected' }, 404);
		}

		// Use Nango proxy to fetch Google Drive files (filtered to Google Docs)
		// Google Drive API: GET /drive/v3/files?q=mimeType='application/vnd.google-apps.document'
		// Note: We need to use baseUrlOverride to access Drive API through Docs integration
		const nangoUrl = new URL('/proxy/drive/v3/files', NANGO_CONFIG.host);
		nangoUrl.searchParams.set('q', "mimeType='application/vnd.google-apps.document'");
		nangoUrl.searchParams.set('pageSize', '100');
		nangoUrl.searchParams.set('fields', 'files(id,name,createdTime,modifiedTime)');

		const response = await fetch(nangoUrl.toString(), {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json',
				'Provider-Config-Key': 'google-docs', // Must match Nango dashboard Integration ID
				'Connection-Id': connection.connection_id,
				'Base-Url-Override': 'https://www.googleapis.com' // Explicitly set Drive API base URL
			}
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Google Drive API error:', {
				status: response.status,
				statusText: response.statusText,
				error: errorText,
				url: nangoUrl.toString(),
				connectionId: connection.connection_id
			});
			throw new Error(`Nango proxy error: ${response.status} ${errorText}`);
		}

		const driveData = await response.json();
		console.log('Google Drive response:', {
			hasFiles: !!driveData.files,
			filesLength: driveData.files?.length,
			keys: Object.keys(driveData)
		});

		return jsonResponse({
			documents: driveData.files || []
		});
	} catch (err: any) {
		console.error('Google Docs API error:', err);
		return jsonResponse(
			{
				error: 'Failed to fetch Google Docs',
				detail: err.message || String(err)
			},
			500
		);
	}
};

