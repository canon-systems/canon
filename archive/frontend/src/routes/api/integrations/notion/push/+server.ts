/**
 * API Endpoint: Push Documentation to Notion
 * 
 * Pushes markdown documentation to a Notion page using Nango
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
			submissionId, 
			pageId, 
			title,
			markdown,
			html 
		} = body as { 
			submissionId?: string; 
			pageId: string; 
			title?: string;
			markdown?: string;
			html?: string;
		};

		if (!pageId) {
			return jsonResponse({ error: 'pageId is required' }, 400);
		}

		// Get content from submission if not provided
		let docHtml = html;
		let docMarkdown = markdown;
		let docTitle = title || 'Documentation';

		if (submissionId && (!html && !markdown)) {
			const { data: submission, error: subError } = await locals.supabase
				.from('submissions')
				.select('markdown, title')
				.eq('id', submissionId)
				.eq('created_by', user.id)
				.single();

			if (subError || !submission) {
				return jsonResponse({ error: 'Submission not found' }, 404);
			}

			docMarkdown = submission.markdown || '';
			docTitle = submission.title || docTitle;
		}

		// Convert markdown to HTML if we have markdown but no HTML
		if (!docHtml && docMarkdown) {
			docHtml = marked.parse(docMarkdown) as string;
		}

		if (!docHtml) {
			return jsonResponse({ error: 'No content to push' }, 400);
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

		// Convert HTML to Notion blocks (preserves formatting)
		const blocks = htmlToNotionBlocks(docHtml);

		// Use Nango proxy to create a new child page in Notion
		// We'll create a new page under the selected parent page
		const createUrl = new URL('/proxy/v1/pages', NANGO_CONFIG.host);
		
		const createResponse = await fetch(createUrl.toString(), {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json',
				'Provider-Config-Key': 'notion',
				'Connection-Id': connection.connection_id
			},
			body: JSON.stringify({
				parent: {
					page_id: pageId
				},
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
				},
				children: blocks
			})
		});

		if (!createResponse.ok) {
			const createErrorText = await createResponse.text();
			console.error('Notion create failed:', createErrorText);
			throw new Error(`Notion API error: ${createResponse.status} ${createErrorText}`);
		}

		const createData = await createResponse.json();
		const createdPageId = createData.id;

		// Store workspace info in submission's source_meta if submissionId provided
		if (submissionId) {
			const { data: submission } = await locals.supabase
				.from('submissions')
				.select('source_meta')
				.eq('id', submissionId)
				.eq('created_by', user.id)
				.single();

			if (submission) {
				const sourceMeta = submission.source_meta || {};
				await locals.supabase
					.from('submissions')
					.update({
						source_meta: {
							...sourceMeta,
							workspace: {
								provider: 'notion',
								resourceId: createdPageId,
								metadata: {}
							}
						}
					})
					.eq('id', submissionId);
			}
		}

		return jsonResponse({
			success: true,
			pageId: createdPageId,
			message: 'Documentation pushed to Notion successfully'
		});
	} catch (err: any) {
		console.error('Notion push error:', err);
		return jsonResponse(
			{
				error: 'Failed to push to Notion',
				detail: err.message || String(err)
			},
			500
		);
	}
};

