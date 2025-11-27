/**
 * Notion Workspace Provider
 */

import type { WorkspaceProvider, WorkspaceInfo, WorkspaceContent } from '../base';
import { NANGO_CONFIG } from '@/lib/server/nango/config';
import { htmlToNotionBlocks } from '@/lib/server/notion/htmlToBlocks';
import { marked } from 'marked';

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

		if (block.has_children && block.children) {
			const childMarkdown = blocksToMarkdown(block.children);
			if (childMarkdown) {
				markdown.push(childMarkdown);
			}
		}
	}

	return markdown.filter(Boolean).join('\n\n');
}

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

async function fetchAllBlocks(pageId: string, connectionId: string): Promise<any[]> {
	const blocksUrl = new URL(`/proxy/v1/blocks/${pageId}/children`, NANGO_CONFIG.host);
	let allBlocks: any[] = [];
	let nextCursor: string | undefined;

	do {
		const url = new URL(blocksUrl.toString());
		if (nextCursor) {
			url.searchParams.set('start_cursor', nextCursor);
		}

		const response = await fetch(url.toString(), {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json',
				'Provider-Config-Key': 'notion',
				'Connection-Id': connectionId
			}
		});

		if (!response.ok) break;

		const data = await response.json();
		allBlocks = [...allBlocks, ...(data.results || [])];
		nextCursor = data.next_cursor;

		// Fetch children for each block
		for (const block of data.results || []) {
			if (block.has_children && block.id) {
				const children = await fetchAllBlocks(block.id, connectionId);
				block.children = children;
			}
		}
	} while (nextCursor);

	return allBlocks;
}

export class NotionProvider implements WorkspaceProvider {
	name = 'notion';

	async pullContent(workspaceInfo: WorkspaceInfo, connectionId: string): Promise<WorkspaceContent | null> {
		try {
			const pageId = workspaceInfo.resourceId;

			// Fetch page properties
			const pageUrl = new URL(`/proxy/v1/pages/${pageId}`, NANGO_CONFIG.host);
			const pageResponse = await fetch(pageUrl.toString(), {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
					'Content-Type': 'application/json',
					'Provider-Config-Key': 'notion',
					'Connection-Id': connectionId
				}
			});

			if (!pageResponse.ok) return null;

			const pageData = await pageResponse.json();

			// Extract title
			let title = 'Documentation';
			const titleProp = pageData.properties?.title || pageData.properties?.Name;
			if (titleProp?.title) {
				title = extractRichText(titleProp.title);
			}

			// Fetch all blocks
			const blocks = await fetchAllBlocks(pageId, connectionId);

			// Convert to markdown
			const markdown = blocksToMarkdown(blocks);

			return {
				title,
				markdown,
				metadata: {
					pageId,
					blocksCount: blocks.length
				}
			};
		} catch (err) {
			console.error('Notion pull error:', err);
			return null;
		}
	}

	async pushContent(
		workspaceInfo: WorkspaceInfo,
		content: WorkspaceContent,
		connectionId: string,
		createNew = true
	): Promise<WorkspaceInfo | null> {
		try {
			const html = content.html || (marked.parse(content.markdown) as string);
			const blocks = htmlToNotionBlocks(html);

			if (createNew) {
				// Create new page or database entry
				const parentPageId = workspaceInfo.resourceId;
				const metadata = workspaceInfo.metadata || {};
				const databaseId =
					metadata.database_id ||
					((metadata.type === 'database' || metadata.type === 'collection') ? parentPageId : undefined);
				const isDatabaseParent = Boolean(databaseId);

				const parentPayload = isDatabaseParent
					? { database_id: databaseId }
					: parentPageId
					? { page_id: parentPageId }
					: null;

				if (!parentPayload) {
					console.error('Notion push error: missing parent resource ID');
					return null;
				}

				const titleValue = content.title?.trim() || 'Untitled';
				const titleProperty = isDatabaseParent
					? {
							Name: {
								title: [
									{
										text: {
											content: titleValue
										}
									}
								]
							}
					  }
					: {
							title: {
								title: [
									{
										text: {
											content: titleValue
										}
									}
								]
							}
					  };

				const createUrl = new URL('/proxy/v1/pages', NANGO_CONFIG.host);

				const createResponse = await fetch(createUrl.toString(), {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${NANGO_CONFIG.secretKey}`,
						'Content-Type': 'application/json',
						'Provider-Config-Key': 'notion',
						'Connection-Id': connectionId
					},
					body: JSON.stringify({
						parent: parentPayload,
						properties: titleProperty,
						children: blocks
					})
				});

				if (!createResponse.ok) {
					console.error('Notion create response error:', await createResponse.text().catch(() => ''));
					return null;
				}

				const createData = await createResponse.json();
				return {
					provider: 'notion',
					resourceId: createData.id,
					metadata: workspaceInfo.metadata
				};
			} else {
				// Update existing page
				const success = await this.updateContent(workspaceInfo, content, connectionId);
				return success ? workspaceInfo : null;
			}
		} catch (err) {
			console.error('Notion push error:', err);
			return null;
		}
	}

	async updateContent(
		workspaceInfo: WorkspaceInfo,
		content: WorkspaceContent,
		connectionId: string
	): Promise<boolean> {
		try {
			const pageId = workspaceInfo.resourceId;
			const html = content.html || marked.parse(content.markdown) as string;
			const blocks = htmlToNotionBlocks(html);

			// Delete existing blocks
			const blocksUrl = new URL(`/proxy/v1/blocks/${pageId}/children`, NANGO_CONFIG.host);
			const getBlocksResponse = await fetch(blocksUrl.toString(), {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
					'Content-Type': 'application/json',
					'Provider-Config-Key': 'notion',
					'Connection-Id': connectionId
				}
			});

			if (getBlocksResponse.ok) {
				const blocksData = await getBlocksResponse.json();
				for (const block of blocksData.results || []) {
					const deleteUrl = new URL(`/proxy/v1/blocks/${block.id}`, NANGO_CONFIG.host);
					await fetch(deleteUrl.toString(), {
						method: 'DELETE',
						headers: {
							'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
							'Content-Type': 'application/json',
							'Provider-Config-Key': 'notion',
							'Connection-Id': connectionId
						}
					});
				}
			}

			// Update title
			const updatePageUrl = new URL(`/proxy/v1/pages/${pageId}`, NANGO_CONFIG.host);
			await fetch(updatePageUrl.toString(), {
				method: 'PATCH',
				headers: {
					'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
					'Content-Type': 'application/json',
					'Provider-Config-Key': 'notion',
					'Connection-Id': connectionId
				},
				body: JSON.stringify({
					properties: {
						title: {
							title: [
								{
									text: {
										content: content.title
									}
								}
							]
						}
					}
				})
			});

			// Add new blocks
			if (blocks.length > 0) {
				const appendUrl = new URL(`/proxy/v1/blocks/${pageId}/children`, NANGO_CONFIG.host);
				const appendResponse = await fetch(appendUrl.toString(), {
					method: 'PATCH',
					headers: {
						'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
						'Content-Type': 'application/json',
						'Provider-Config-Key': 'notion',
						'Connection-Id': connectionId
					},
					body: JSON.stringify({
						children: blocks
					})
				});

				return appendResponse.ok;
			}

			return true;
		} catch (err) {
			console.error('Notion update error:', err);
			return false;
		}
	}
}

