/**
 * Notion Workspace Provider
 */

import type { WorkspaceProvider, WorkspaceInfo, WorkspaceContent } from '../base';
import { htmlToNotionBlocks } from '../../notion/htmlToBlocks';
import { markdownToNotionBlocks } from '../../notion/markdownToBlocks';
import { marked } from 'marked';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function notionHeaders(accessToken: string) {
	return {
		Authorization: `Bearer ${accessToken}`,
		'Content-Type': 'application/json',
		'Notion-Version': NOTION_VERSION,
	} as const;
}

type NotionRichTextItem = {
	type: string;
	text?: { content?: string };
	mention?: {
		type?: string;
		page?: string;
		[key: string]: unknown;
	};
	[key: string]: unknown;
};

type NotionBlock = {
	type: string;
	paragraph?: { rich_text?: NotionRichTextItem[] };
	heading_1?: { rich_text?: NotionRichTextItem[] };
	heading_2?: { rich_text?: NotionRichTextItem[] };
	heading_3?: { rich_text?: NotionRichTextItem[] };
	bulleted_list_item?: { rich_text?: NotionRichTextItem[] };
	numbered_list_item?: { rich_text?: NotionRichTextItem[] };
	code?: { rich_text?: NotionRichTextItem[]; language?: string };
	quote?: { rich_text?: NotionRichTextItem[] };
	to_do?: { rich_text?: NotionRichTextItem[]; checked?: boolean };
	has_children?: boolean;
	children?: NotionBlock[];
	[key: string]: unknown;
};

/**
 * Convert Notion blocks to markdown
 */
function blocksToMarkdown(blocks: NotionBlock[]): string {
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

function extractRichText(richText: NotionRichTextItem[]): string {
	return richText
		.map((item) => {
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

async function fetchAllBlocks(pageId: string, accessToken: string): Promise<NotionBlock[]> {
	const blocksUrl = new URL(`${NOTION_API_BASE}/blocks/${pageId}/children`);
	let allBlocks: NotionBlock[] = [];
	let nextCursor: string | undefined;

	do {
		const url = new URL(blocksUrl.toString());
		if (nextCursor) {
			url.searchParams.set('start_cursor', nextCursor);
		}

		const response = await fetch(url.toString(), {
			method: 'GET',
			headers: notionHeaders(accessToken),
		});

		if (!response.ok) break;

		const data = await response.json();
		allBlocks = [...allBlocks, ...(data.results || [])];
		nextCursor = data.next_cursor;

		// Fetch children for each block
		for (const block of data.results || []) {
			if (block.has_children && block.id) {
				const children = await fetchAllBlocks(block.id, accessToken);
				block.children = children;
			}
		}
	} while (nextCursor);

	return allBlocks;
}

/**
 * Split blocks into chunks of max 100 (Notion API limit)
 */
function chunkBlocks(blocks: NotionBlock[], chunkSize: number = 100): NotionBlock[][] {
	const chunks: NotionBlock[][] = [];
	for (let i = 0; i < blocks.length; i += chunkSize) {
		chunks.push(blocks.slice(i, i + chunkSize));
	}
	return chunks;
}

const delayMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Append blocks to a Notion page in chunks.
 * Retries on 404 (object_not_found) with a short delay to handle Notion's eventual consistency.
 */
async function appendBlocksInChunks(
	pageId: string,
	blocks: NotionBlock[],
	accessToken: string,
	options?: { retryOn404?: boolean }
): Promise<boolean> {
	const chunks = chunkBlocks(blocks, 100);
	const retryOn404 = options?.retryOn404 ?? true;
	const maxRetries = retryOn404 ? 2 : 0;

	for (const chunk of chunks) {
		const appendUrl = new URL(`${NOTION_API_BASE}/blocks/${pageId}/children`);
		let lastError: string | null = null;
		let lastOk = false;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			if (attempt > 0) {
				await delayMs(1500 * attempt);
			}

			const appendResponse = await fetch(appendUrl.toString(), {
				method: 'PATCH',
				headers: notionHeaders(accessToken),
				body: JSON.stringify({
					children: chunk
				})
			});

			if (appendResponse.ok) {
				lastOk = true;
				break;
			}

			const errorText = await appendResponse.text().catch(() => '');
			lastError = errorText;

			const is404 = appendResponse.status === 404;
			const isObjectNotFound = errorText.includes('object_not_found');
			if (is404 && isObjectNotFound && attempt < maxRetries) {
				console.warn(`[Notion] Append to page ${pageId} returned 404 (attempt ${attempt + 1}/${maxRetries + 1}), retrying after delay...`);
				continue;
			}

			break;
		}

		if (!lastOk && lastError) {
			console.error(`Notion append blocks error (pageId=${pageId}): ${lastError}`);
			console.error(
				'[Notion] Fix: In Notion, open the KB root page you selected for this push → … (top right) → Add connections → select your integration. Then retry the push.'
			);
			return false;
		}
	}

	return true;
}

export class NotionProvider implements WorkspaceProvider {
	name = 'notion';

	async pullContent(workspaceInfo: WorkspaceInfo, connectionId: string): Promise<WorkspaceContent | null> {
		try {
			const accessToken = await getProviderAccessToken({ provider: 'notion', connectionId });
			if (!accessToken) {
				console.error('Notion pull error: missing Notion token (please reconnect Notion)');
				return null;
			}

			const pageId = workspaceInfo.resourceId;

			// Fetch page properties
			const pageUrl = new URL(`${NOTION_API_BASE}/pages/${pageId}`);
			const pageResponse = await fetch(pageUrl.toString(), {
				method: 'GET',
				headers: notionHeaders(accessToken),
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
			const blocks = await fetchAllBlocks(pageId, accessToken);

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
			const accessToken = await getProviderAccessToken({ provider: 'notion', connectionId });
			if (!accessToken) {
				console.error('Notion push error: missing Notion token (please reconnect Notion)');
				return null;
			}

			// Try HTML conversion first, fall back to markdown if it produces poor results
			let blocks: NotionBlock[] = [];
			
			if (content.html) {
				blocks = htmlToNotionBlocks(content.html);
			} else if (content.markdown) {
				// Try HTML conversion via marked first
				const html = marked.parse(content.markdown) as string;
				blocks = htmlToNotionBlocks(html);
				
				// If HTML conversion produced too few meaningful blocks, use direct markdown conversion
			const hasContent = blocks.some(b => {
				if (b.type === 'paragraph') {
					const richText = (b as NotionBlock).paragraph?.rich_text || [];
					return richText.some((rt) => rt.text?.content?.trim());
				}
				return b.type !== 'paragraph'; // Non-paragraph blocks are considered content
			});
				
				if (!hasContent || blocks.length <= 1) {
					console.log('[Notion] HTML conversion produced few blocks, falling back to markdown conversion');
					blocks = markdownToNotionBlocks(content.markdown);
				}
			}
			
			// Ensure we have at least one block
			if (blocks.length === 0) {
				blocks = [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } }];
			}

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

				const createUrl = new URL(`${NOTION_API_BASE}/pages`);

				// Create page with title only; then append all blocks. Notion often returns 404 when
				// appending to a page that was created with many children in the same request, so we
				// create minimally and always append content in a separate request.
				const createResponse = await fetch(createUrl.toString(), {
					method: 'POST',
					headers: notionHeaders(accessToken),
					body: JSON.stringify({
						parent: parentPayload,
						properties: titleProperty,
						children: []
					})
				});

				if (!createResponse.ok) {
					const errorText = await createResponse.text().catch(() => '');
					console.error('Notion create response error:', errorText);
					return null;
				}

				const createData = await createResponse.json();
				const pageId = createData.id;

				// Append all blocks in chunks. Brief delay + retries help with eventual consistency.
				if (blocks.length > 0) {
					await delayMs(500);
					const appendSuccess = await appendBlocksInChunks(pageId, blocks, accessToken, {
						retryOn404: true
					});
					if (!appendSuccess) {
						console.warn(`[Notion] Failed to append blocks to page ${pageId}, but page was created`);
					}
				}

				return {
					provider: 'notion',
					resourceId: pageId,
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
			const accessToken = await getProviderAccessToken({ provider: 'notion', connectionId });
			if (!accessToken) {
				console.error('Notion update error: missing Notion token (please reconnect Notion)');
				return false;
			}

			const pageId = workspaceInfo.resourceId;
			
			// Try HTML conversion first, fall back to markdown if it produces poor results
			let blocks: NotionBlock[] = [];
			
			if (content.html) {
				blocks = htmlToNotionBlocks(content.html);
			} else if (content.markdown) {
				const html = marked.parse(content.markdown) as string;
				blocks = htmlToNotionBlocks(html);
				
				// If HTML conversion produced too few meaningful blocks, use direct markdown conversion
			const hasContent = blocks.some(b => {
				if (b.type === 'paragraph') {
					const richText = (b as NotionBlock).paragraph?.rich_text || [];
					return richText.some((rt) => rt.text?.content?.trim());
				}
				return b.type !== 'paragraph';
			});
				
				if (!hasContent || blocks.length <= 1) {
					console.log('[Notion] HTML conversion produced few blocks in update, falling back to markdown conversion');
					blocks = markdownToNotionBlocks(content.markdown);
				}
			}

			// Delete existing blocks
			const blocksUrl = new URL(`${NOTION_API_BASE}/blocks/${pageId}/children`);
			const getBlocksResponse = await fetch(blocksUrl.toString(), {
				method: 'GET',
				headers: notionHeaders(accessToken),
			});

			if (getBlocksResponse.ok) {
				const blocksData = await getBlocksResponse.json();
				for (const block of blocksData.results || []) {
					const deleteUrl = new URL(`${NOTION_API_BASE}/blocks/${block.id}`);
					await fetch(deleteUrl.toString(), {
						method: 'DELETE',
						headers: notionHeaders(accessToken),
					});
				}
			}

			// Update title
			const updatePageUrl = new URL(`${NOTION_API_BASE}/pages/${pageId}`);
			await fetch(updatePageUrl.toString(), {
				method: 'PATCH',
				headers: notionHeaders(accessToken),
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

			// Add new blocks in chunks (Notion allows max 100 children per request)
			if (blocks.length > 0) {
				const success = await appendBlocksInChunks(pageId, blocks, accessToken);
				return success;
			}

			return true;
		} catch (err) {
			console.error('Notion update error:', err);
			return false;
		}
	}

	async resourceExists(workspaceInfo: WorkspaceInfo, connectionId: string): Promise<boolean> {
		try {
			const accessToken = await getProviderAccessToken({ provider: 'notion', connectionId });
			if (!accessToken || !workspaceInfo.resourceId) return false;

			const pageUrl = new URL(`${NOTION_API_BASE}/pages/${workspaceInfo.resourceId}`);
			const response = await fetch(pageUrl.toString(), {
				method: 'GET',
				headers: notionHeaders(accessToken),
			});

			return response.ok;
		} catch {
			return false;
		}
	}
}
