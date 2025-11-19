/**
 * API Endpoint: Push Documentation to Confluence
 * 
 * Pushes markdown documentation to a Confluence page using Nango
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { NANGO_CONFIG } from '$lib/server/nango/config';
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
			spaceKey,
			parentPageId,
			title,
			markdown,
			html 
		} = body as { 
			submissionId?: string; 
			spaceKey: string;
			parentPageId?: string;
			title?: string;
			markdown?: string;
			html?: string;
		};

		if (!spaceKey) {
			return jsonResponse({ error: 'spaceKey is required' }, 400);
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

		// Convert HTML to Confluence Storage Format (XHTML-like)
		// For now, we'll use a simple conversion - in production you'd want a proper converter
		const confluenceBody = convertHtmlToConfluenceStorage(docHtml);

		// Use Nango proxy to create a new page in Confluence with cloudId
		// Confluence Cloud API: POST /ex/confluence/{cloudId}/wiki/rest/api/content
		// When using Base-Url-Override, the endpoint path should be relative to that base URL
		const endpoint = `/ex/confluence/${cloudId}/wiki/rest/api/content`;
		const createUrl = new URL(`/proxy${endpoint}`, NANGO_CONFIG.host);
		
		const pageData: any = {
			type: 'page',
			title: docTitle,
			space: {
				key: spaceKey
			},
			body: {
				storage: {
					value: confluenceBody,
					representation: 'storage'
				}
			}
		};

		// If parentPageId is provided, create as child page
		if (parentPageId) {
			pageData.ancestors = [{ id: parentPageId }];
		}

		const createResponse = await fetch(createUrl.toString(), {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json',
				'Provider-Config-Key': 'confluence',
				'Connection-Id': connection.connection_id,
				'Base-Url-Override': 'https://api.atlassian.com' // Explicitly set Atlassian API base URL
			},
			body: JSON.stringify(pageData)
		});

		if (!createResponse.ok) {
			const createErrorText = await createResponse.text();
			console.error('Confluence create failed:', {
				status: createResponse.status,
				statusText: createResponse.statusText,
				error: createErrorText,
				url: createUrl.toString(),
				spaceKey,
				parentPageId,
				connectionId: connection.connection_id
			});
			throw new Error(`Confluence API error: ${createResponse.status} ${createErrorText}`);
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
								provider: 'confluence',
								resourceId: createdPageId,
								metadata: {
									spaceKey,
									cloudId,
									parentPageId
								}
							}
						}
					})
					.eq('id', submissionId);
			}
		}

		return jsonResponse({
			success: true,
			pageId: createdPageId,
			message: 'Documentation pushed to Confluence successfully'
		});
	} catch (err: any) {
		console.error('Confluence push error:', err);
		return jsonResponse(
			{
				error: 'Failed to push to Confluence',
				detail: err.message || String(err)
			},
			500
		);
	}
};

/**
 * Convert HTML to Confluence Storage Format
 * This is a simplified converter - for production, consider using a library like html-to-confluence
 */
function convertHtmlToConfluenceStorage(html: string): string {
	// Basic conversion - replace common HTML tags with Confluence storage format
	let confluence = html
		.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '<h1>$1</h1>')
		.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '<h2>$1</h2>')
		.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '<h3>$1</h3>')
		.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '<strong>$1</strong>')
		.replace(/<b[^>]*>(.*?)<\/b>/gi, '<strong>$1</strong>')
		.replace(/<em[^>]*>(.*?)<\/em>/gi, '<em>$1</em>')
		.replace(/<i[^>]*>(.*?)<\/i>/gi, '<em>$1</em>')
		.replace(/<code[^>]*>(.*?)<\/code>/gi, '<code>$1</code>')
		.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '<a href="$1">$2</a>')
		.replace(/<ul[^>]*>/gi, '<ul>')
		.replace(/<ol[^>]*>/gi, '<ol>')
		.replace(/<li[^>]*>/gi, '<li>')
		.replace(/<p[^>]*>/gi, '<p>')
		.replace(/<br\s*\/?>/gi, '<br />');

	return confluence;
}

