/**
 * Convert Markdown to Notion Blocks
 * 
 * Converts markdown content to Notion's block format for API calls
 */

export interface NotionBlock {
	object: 'block';
	type: string;
	[key: string]: unknown;
}

/**
 * Converts markdown text to Notion blocks
 * Handles common markdown elements: headings, paragraphs, lists, code blocks
 */
export function markdownToNotionBlocks(markdown: string): NotionBlock[] {
	const blocks: NotionBlock[] = [];
	const lines = markdown.split('\n');
	
	let currentParagraph: string[] = [];
	let inCodeBlock = false;
	let codeBlockLanguage = '';
	let codeBlockContent: string[] = [];
	
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		
		// Handle code blocks
		if (line.trim().startsWith('```')) {
			if (inCodeBlock) {
				// End of code block
				if (codeBlockContent.length > 0) {
					const codeText = codeBlockContent.join('\n');
					blocks.push({
						object: 'block',
						type: 'code',
						code: {
							rich_text: splitIntoRichTextChunks(codeText, 2000),
							language: codeBlockLanguage || 'plain text'
						}
					});
				}
				codeBlockContent = [];
				codeBlockLanguage = '';
				inCodeBlock = false;
			} else {
				// Start of code block
				// Flush any pending paragraph
				if (currentParagraph.length > 0) {
					blocks.push(createParagraphBlock(currentParagraph.join('\n')));
					currentParagraph = [];
				}
				inCodeBlock = true;
				codeBlockLanguage = line.trim().slice(3).trim() || 'plain text';
			}
			continue;
		}
		
		if (inCodeBlock) {
			codeBlockContent.push(line);
			continue;
		}
		
		// Handle headings
		const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
		if (headingMatch) {
			// Flush current paragraph
			if (currentParagraph.length > 0) {
				blocks.push(createParagraphBlock(currentParagraph.join('\n')));
				currentParagraph = [];
			}
			
			const level = headingMatch[1].length;
			const text = headingMatch[2].trim();
			blocks.push({
				object: 'block',
				type: `heading_${level}`,
				[`heading_${level}`]: {
					rich_text: [
						{
							type: 'text',
							text: {
								content: text
							}
						}
					]
				}
			});
			continue;
		}
		
		// Handle list items
		const listMatch = line.match(/^[-*]\s+(.+)$/);
		if (listMatch) {
			// Flush current paragraph
			if (currentParagraph.length > 0) {
				blocks.push(createParagraphBlock(currentParagraph.join('\n')));
				currentParagraph = [];
			}
			
			blocks.push({
				object: 'block',
				type: 'bulleted_list_item',
				bulleted_list_item: {
					rich_text: [
						{
							type: 'text',
							text: {
								content: listMatch[1].trim()
							}
						}
					]
				}
			});
			continue;
		}
		
		// Handle numbered lists
		const numberedListMatch = line.match(/^\d+\.\s+(.+)$/);
		if (numberedListMatch) {
			// Flush current paragraph
			if (currentParagraph.length > 0) {
				blocks.push(createParagraphBlock(currentParagraph.join('\n')));
				currentParagraph = [];
			}
			
			blocks.push({
				object: 'block',
				type: 'numbered_list_item',
				numbered_list_item: {
					rich_text: [
						{
							type: 'text',
							text: {
								content: numberedListMatch[1].trim()
							}
						}
					]
				}
			});
			continue;
		}
		
		// Regular paragraph line
		if (line.trim() === '') {
			// Empty line - flush paragraph if we have content
			if (currentParagraph.length > 0) {
				blocks.push(createParagraphBlock(currentParagraph.join('\n')));
				currentParagraph = [];
			}
		} else {
			currentParagraph.push(line);
		}
	}
	
	// Flush any remaining paragraph or code block
	if (inCodeBlock && codeBlockContent.length > 0) {
		const codeText = codeBlockContent.join('\n');
		blocks.push({
			object: 'block',
			type: 'code',
			code: {
				rich_text: splitIntoRichTextChunks(codeText, 2000),
				language: codeBlockLanguage || 'plain text'
			}
		});
	} else if (currentParagraph.length > 0) {
		blocks.push(createParagraphBlock(currentParagraph.join('\n')));
	}
	
	// Ensure we have at least one block
	if (blocks.length === 0) {
		blocks.push(createParagraphBlock(''));
	}
	
	return blocks;
}

function createParagraphBlock(text: string): NotionBlock {
	// Simple text processing - remove markdown formatting for now
	// In a production app, you'd want to handle bold, italic, links, etc.
	const cleanText = text
		.replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
		.replace(/\*(.+?)\*/g, '$1') // Remove italic
		.replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links, keep text
		.trim();
	
	return {
		object: 'block',
		type: 'paragraph',
		paragraph: {
			rich_text: cleanText
				? [
						{
							type: 'text',
							text: {
								content: cleanText
							}
						}
					]
				: []
		}
	};
}

/**
 * Splits text into chunks that fit within Notion's character limit.
 * Notion API has a 2000 character limit per rich_text item.
 */
function splitIntoRichTextChunks(text: string, maxLength: number = 2000): Array<{ type: 'text'; text: { content: string } }> {
	if (!text || text.length === 0) {
		return [];
	}

	if (text.length <= maxLength) {
		return [{ type: 'text', text: { content: text } }];
	}

	const chunks: Array<{ type: 'text'; text: { content: string } }> = [];
	let remaining = text;

	while (remaining.length > 0) {
		if (remaining.length <= maxLength) {
			chunks.push({ type: 'text', text: { content: remaining } });
			break;
		}

		// Try to split at a newline within the limit for cleaner breaks
		let splitIndex = remaining.lastIndexOf('\n', maxLength);
		if (splitIndex === -1 || splitIndex === 0) {
			// No newline found, split at maxLength
			splitIndex = maxLength;
		}

		chunks.push({ type: 'text', text: { content: remaining.slice(0, splitIndex) } });
		remaining = remaining.slice(splitIndex);
		
		// Remove leading newline if we split on one
		if (remaining.startsWith('\n')) {
			remaining = remaining.slice(1);
		}
	}

	return chunks;
}

