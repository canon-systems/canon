/**
 * API Endpoint: Update Existing Notion Page
 * 
 * Updates an existing Notion page with new content
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { NANGO_CONFIG } from '$lib/server/nango/config';
import { htmlToNotionBlocks } from '$lib/server/notion/htmlToBlocks';
import { marked } from 'marked';

function jsonResponse(data: unknown, status = 200) {
	return json(data, { status });
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return jsonResponse({ error: 'Unauthorized' }, 401);
		}

		const body = await request.json();
		const { 
			pageId, 
			title,
			markdown,
			html 
		} = body as { 
			pageId: string; 
			title?: string;
			markdown?: string;
			html?: string;
		};

		if (!pageId) {
			return jsonResponse({ error: 'pageId is required' }, 400);
		}

		// Get content
		let docHtml = html;
		let docMarkdown = markdown;
		let docTitle = title || 'Documentation';

		// Convert markdown to HTML if we have markdown but no HTML
		if (!docHtml && docMarkdown) {
			docHtml = marked.parse(docMarkdown) as string;
		}

		if (!docHtml) {
			return jsonResponse({ error: 'No content to update' }, 400);
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

		// Convert HTML to Notion blocks
		const blocks = htmlToNotionBlocks(docHtml);

		// First, clear existing content by fetching and deleting all blocks
		const blocksUrl = new URL(`/proxy/v1/blocks/${pageId}/children`, NANGO_CONFIG.host);
		const getBlocksResponse = await fetch(blocksUrl.toString(), {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json',
				'Provider-Config-Key': 'notion',
				'Connection-Id': connection.connection_id
			}
		});

		if (getBlocksResponse.ok) {
			const blocksData = await getBlocksResponse.json();
			const existingBlocks = blocksData.results || [];

			// Delete all existing blocks
			for (const block of existingBlocks) {
				const deleteUrl = new URL(`/proxy/v1/blocks/${block.id}`, NANGO_CONFIG.host);
				await fetch(deleteUrl.toString(), {
					method: 'DELETE',
					headers: {
						'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
						'Content-Type': 'application/json',
						'Provider-Config-Key': 'notion',
						'Connection-Id': connection.connection_id
					}
				});
			}
		}

		// Update page title if provided
		if (docTitle) {
			const updatePageUrl = new URL(`/proxy/v1/pages/${pageId}`, NANGO_CONFIG.host);
			await fetch(updatePageUrl.toString(), {
				method: 'PATCH',
				headers: {
					'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
					'Content-Type': 'application/json',
					'Provider-Config-Key': 'notion',
					'Connection-Id': connection.connection_id
				},
				body: JSON.stringify({
					properties: {
						title: {
							title: [
								{
									text: {
										content: docTitle
									}
								}
							]
						}
					}
				})
			});
		}

		// Add new blocks
		if (blocks.length > 0) {
			const appendUrl = new URL(`/proxy/v1/blocks/${pageId}/children`, NANGO_CONFIG.host);
			const appendResponse = await fetch(appendUrl.toString(), {
				method: 'PATCH',
				headers: {
					'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
					'Content-Type': 'application/json',
					'Provider-Config-Key': 'notion',
					'Connection-Id': connection.connection_id
				},
				body: JSON.stringify({
					children: blocks
				})
			});

			if (!appendResponse.ok) {
				const errorText = await appendResponse.text();
				throw new Error(`Failed to append blocks: ${appendResponse.status} ${errorText}`);
			}
		}

		return jsonResponse({
			success: true,
			pageId,
			message: 'Notion page updated successfully'
		});
	} catch (err: any) {
		console.error('Notion update error:', err);
		return jsonResponse(
			{
				error: 'Failed to update Notion page',
				detail: err.message || String(err)
			},
			500
		);
	}
};

