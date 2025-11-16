/**
 * API Endpoint: Pull Documentation from Notion
 * 
 * Fetches content from a Notion page and converts it to markdown
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { NANGO_CONFIG } from '$lib/server/nango/config';

function jsonResponse(data: unknown, status = 200) {
	return json(data, { status });
}

/**
 * Convert Notion blocks to markdown
 */
function blocksToMarkdown(blocks: any[]): string {
	const markdown: string[] = [];

	for (const block of blocks) {
		if (!block || block.type === 'unsupported') continue;

		switch (block.type) {
			case 'paragraph':
				markdown.push(extractRichText(block.paragraph?.rich_text || []));
				break;

			case 'heading_1':
				markdown.push(`# ${extractRichText(block.heading_1?.rich_text || [])}`);
				break;

			case 'heading_2':
				markdown.push(`## ${extractRichText(block.heading_2?.rich_text || [])}`);
				break;

			case 'heading_3':
				markdown.push(`### ${extractRichText(block.heading_3?.rich_text || [])}`);
				break;

			case 'bulleted_list_item':
				markdown.push(`- ${extractRichText(block.bulleted_list_item?.rich_text || [])}`);
				break;

			case 'numbered_list_item':
				markdown.push(`1. ${extractRichText(block.numbered_list_item?.rich_text || [])}`);
				break;

			case 'code':
				const code = extractRichText(block.code?.rich_text || []);
				const language = block.code?.language || '';
				markdown.push(`\`\`\`${language}\n${code}\n\`\`\``);
				break;

			case 'quote':
				markdown.push(`> ${extractRichText(block.quote?.rich_text || [])}`);
				break;

			case 'divider':
				markdown.push('---');
				break;

			case 'to_do':
				const checked = block.to_do?.checked ? 'x' : ' ';
				markdown.push(`- [${checked}] ${extractRichText(block.to_do?.rich_text || [])}`);
				break;
		}

		// Handle children (nested blocks)
		if (block.has_children && block.children) {
			const childMarkdown = blocksToMarkdown(block.children);
			if (childMarkdown) {
				markdown.push(childMarkdown);
			}
		}
	}

	return markdown.filter(Boolean).join('\n\n');
}

/**
 * Extract text from Notion rich_text array
 */
function extractRichText(richText: any[]): string {
	return richText
		.map((item: any) => {
			if (item.type === 'text') {
				return item.text?.content || '';
			}
			if (item.type === 'mention') {
				return item.mention?.type === 'page' ? `[[${item.mention.page}]]` : '';
			}
			return '';
		})
		.join('');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return jsonResponse({ error: 'Unauthorized' }, 401);
		}

		const body = await request.json();
		const { pageId } = body as { pageId: string };

		if (!pageId) {
			return jsonResponse({ error: 'pageId is required' }, 400);
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

		// Fetch page properties (title, etc.)
		const pageUrl = new URL(`/proxy/v1/pages/${pageId}`, NANGO_CONFIG.host);
		const pageResponse = await fetch(pageUrl.toString(), {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json',
				'Provider-Config-Key': 'notion',
				'Connection-Id': connection.connection_id
			}
		});

		if (!pageResponse.ok) {
			const errorText = await pageResponse.text();
			throw new Error(`Failed to fetch Notion page: ${pageResponse.status} ${errorText}`);
		}

		const pageData = await pageResponse.json();

		// Extract title from page properties
		let title = 'Documentation';
		const titleProp = pageData.properties?.title || pageData.properties?.Name;
		if (titleProp?.title) {
			title = extractRichText(titleProp.title);
		}

		// Fetch page blocks (content)
		const blocksUrl = new URL(`/proxy/v1/blocks/${pageId}/children`, NANGO_CONFIG.host);
		const blocksResponse = await fetch(blocksUrl.toString(), {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json',
				'Provider-Config-Key': 'notion',
				'Connection-Id': connection.connection_id
			}
		});

		if (!blocksResponse.ok) {
			const errorText = await blocksResponse.text();
			throw new Error(`Failed to fetch Notion blocks: ${blocksResponse.status} ${errorText}`);
		}

		const blocksData = await blocksResponse.json();
		const blocks = blocksData.results || [];

		// Recursively fetch all blocks (handle pagination)
		let allBlocks = [...blocks];
		let nextCursor = blocksData.next_cursor;

		while (nextCursor) {
			const nextUrl = new URL(`/proxy/v1/blocks/${pageId}/children`, NANGO_CONFIG.host);
			nextUrl.searchParams.set('start_cursor', nextCursor);

			const nextResponse = await fetch(nextUrl.toString(), {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
					'Content-Type': 'application/json',
					'Provider-Config-Key': 'notion',
					'Connection-Id': connection.connection_id
				}
			});

			if (!nextResponse.ok) break;

			const nextData = await nextResponse.json();
			allBlocks = [...allBlocks, ...(nextData.results || [])];
			nextCursor = nextData.next_cursor;
		}

		// Recursively fetch children for blocks that have them
		async function fetchChildren(block: any): Promise<void> {
			if (block.has_children && block.id) {
				const childrenUrl = new URL(`/proxy/v1/blocks/${block.id}/children`, NANGO_CONFIG.host);
				const childrenResponse = await fetch(childrenUrl.toString(), {
					method: 'GET',
					headers: {
						'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
						'Content-Type': 'application/json',
						'Provider-Config-Key': 'notion',
						'Connection-Id': connection.connection_id
					}
				});

				if (childrenResponse.ok) {
					const childrenData = await childrenResponse.json();
					block.children = childrenData.results || [];
					
					// Recursively fetch children of children
					for (const child of block.children) {
						await fetchChildren(child);
					}
				}
			}
		}

		// Fetch children for all blocks
		for (const block of allBlocks) {
			await fetchChildren(block);
		}

		// Convert blocks to markdown
		const markdown = blocksToMarkdown(allBlocks);

		return jsonResponse({
			success: true,
			pageId,
			title,
			markdown,
			blocks: allBlocks.length
		});
	} catch (err: any) {
		console.error('Notion pull error:', err);
		return jsonResponse(
			{
				error: 'Failed to pull from Notion',
				detail: err.message || String(err)
			},
			500
		);
	}
};

