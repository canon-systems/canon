/**
 * Convert HTML to Notion Blocks
 * 
 * Converts HTML content (from TipTap editor) to Notion's block format
 * Preserves rich text formatting: bold, italic, code, links, etc.
 */

import { parse, HTMLElement } from 'node-html-parser';

export interface NotionBlock {
	object: 'block';
	type: string;
	[key: string]: any;
}

export interface NotionRichText {
	type: 'text';
	text: {
		content: string;
		link?: {
			url: string;
		} | null;
	};
	annotations?: {
		bold?: boolean;
		italic?: boolean;
		strikethrough?: boolean;
		underline?: boolean;
		code?: boolean;
		color?: string;
	};
}

/**
 * Converts HTML content to Notion blocks
 * Handles rich text formatting, headings, lists, code blocks, etc.
 */
export function htmlToNotionBlocks(html: string): NotionBlock[] {
	// Parse HTML using node-html-parser
	const root = parse(html);
	const body = root.querySelector('body') || root;

	const blocks: NotionBlock[] = [];
	
	// Process each top-level child element
	const children = body.childNodes || [];
	for (const node of children) {
		if (node instanceof HTMLElement) {
			const tagName = node.tagName.toLowerCase();
			
			// Handle lists specially - create blocks for each list item
			if (tagName === 'ul' || tagName === 'ol') {
				const listItems = node.querySelectorAll('li');
				for (const li of listItems) {
					const block = createListItemBlock(li as HTMLElement, tagName === 'ul' ? 'bulleted' : 'numbered');
					if (block) {
						blocks.push(block);
					}
				}
			} else if (tagName === 'p') {
				// Handle paragraphs - check for images inside
				const images = node.querySelectorAll('img');
				if (images.length > 0) {
					// Process paragraph content, splitting text and images
					const paragraphContent = processParagraphWithImages(node as HTMLElement);
					blocks.push(...paragraphContent);
				} else {
					const block = elementToNotionBlock(node);
					if (block) {
						blocks.push(block);
					}
				}
			} else {
				const block = elementToNotionBlock(node);
				if (block) {
					blocks.push(block);
				}
			}
		} else if (node.nodeType === 3) {
			// Text node
			const text = node.text?.trim();
			if (text) {
				blocks.push(createParagraphBlock([{ type: 'text', text: { content: text } }]));
			}
		}
	}

	// Ensure we have at least one block
	if (blocks.length === 0) {
		blocks.push(createParagraphBlock([]));
	}

	return blocks;
}

function createListItemBlock(li: HTMLElement, type: 'bulleted' | 'numbered'): NotionBlock | null {
	const richText = extractRichText(li);
	if (richText.length === 0) return null;
	
	return {
		object: 'block',
		type: type === 'bulleted' ? 'bulleted_list_item' : 'numbered_list_item',
		[type === 'bulleted' ? 'bulleted_list_item' : 'numbered_list_item']: {
			rich_text: richText
		}
	};
}

/**
 * Processes a paragraph element that may contain images
 * Returns an array of blocks (text paragraphs and images)
 */
function processParagraphWithImages(p: HTMLElement): NotionBlock[] {
	const blocks: NotionBlock[] = [];
	const images = p.querySelectorAll('img');
	
	// Extract text content (excluding images)
	// Create a copy by parsing the outerHTML and removing images
	const htmlContent = p.outerHTML;
	const tempElement = parse(htmlContent).querySelector(p.tagName);
	if (tempElement) {
		tempElement.querySelectorAll('img').forEach(img => img.remove());
		const richText = extractRichText(tempElement);
		
		// Add text paragraph if there's text
		if (richText.length > 0) {
			blocks.push(createParagraphBlock(richText));
		}
	} else {
		// Fallback: extract rich text directly from p (will include image alt text)
		const richText = extractRichText(p);
		if (richText.length > 0) {
			blocks.push(createParagraphBlock(richText));
		}
	}
	
	// Add image blocks
	for (const img of images) {
		const imgBlock = elementToNotionBlock(img as HTMLElement);
		if (imgBlock) {
			blocks.push(imgBlock);
		}
	}
	
	return blocks.length > 0 ? blocks : [createParagraphBlock([])];
}

function elementToNotionBlock(element: HTMLElement): NotionBlock | null {
	const tagName = element.tagName.toLowerCase();
	const richText = extractRichText(element);

	switch (tagName) {
		case 'h1':
			return {
				object: 'block',
				type: 'heading_1',
				heading_1: { rich_text: richText }
			};
		case 'h2':
			return {
				object: 'block',
				type: 'heading_2',
				heading_2: { rich_text: richText }
			};
		case 'h3':
			return {
				object: 'block',
				type: 'heading_3',
				heading_3: { rich_text: richText }
			};
		case 'h4':
		case 'h5':
		case 'h6':
			// Notion only supports h1-h3, so treat h4+ as h3
			return {
				object: 'block',
				type: 'heading_3',
				heading_3: { rich_text: richText }
			};
		case 'p':
			return createParagraphBlock(richText);
		case 'ul':
		case 'ol':
		case 'li':
			// Lists are handled separately in the main function
			return null;
		case 'blockquote':
			return {
				object: 'block',
				type: 'quote',
				quote: { rich_text: richText }
			};
		case 'pre':
			const codeElement = element.querySelector('code');
			const codeText = codeElement?.text || element.text || '';
			const classNames = (codeElement?.classNames as string) || '';
			const language = classNames.match(/language-(\w+)/)?.[1] || 'plain text';
			return {
				object: 'block',
				type: 'code',
				code: {
					rich_text: [{ type: 'text', text: { content: codeText } }],
					language: language
				}
			};
		case 'hr':
			return {
				object: 'block',
				type: 'divider',
				divider: {}
			};
		case 'img':
			const src = element.getAttribute('src') || '';
			const alt = element.getAttribute('alt') || '';
			if (src) {
				return {
					object: 'block',
					type: 'image',
					image: {
						type: 'external',
						external: {
							url: src
						},
						caption: alt ? [{ type: 'text', text: { content: alt } }] : []
					}
				};
			}
			return null;
		default:
			// For unknown elements, treat as paragraph
			return createParagraphBlock(richText);
	}
}

/**
 * Extracts rich text with formatting from an HTML element
 * Handles nested formatting (e.g., bold + italic together)
 */
function extractRichText(element: HTMLElement): NotionRichText[] {
	const richText: NotionRichText[] = [];
	
	function processNode(node: any, annotations: NotionRichText['annotations'] = {}): void {
		if (node.nodeType === 3) {
			// Text node
			const text = node.text || '';
			if (text.trim()) {
				richText.push({
					type: 'text',
					text: { content: text },
					annotations: Object.keys(annotations).length > 0 ? annotations : undefined
				});
			}
		} else if (node instanceof HTMLElement) {
			const el = node;
			const tagName = el.tagName.toLowerCase();
			
			// Build annotations object for nested formatting
			const newAnnotations = { ...annotations };
			
			// Handle inline formatting
			if (tagName === 'strong' || tagName === 'b') {
				newAnnotations.bold = true;
			} else if (tagName === 'em' || tagName === 'i') {
				newAnnotations.italic = true;
			} else if (tagName === 'u') {
				newAnnotations.underline = true;
			} else if (tagName === 's' || tagName === 'strike' || tagName === 'del') {
				newAnnotations.strikethrough = true;
			} else if (tagName === 'code') {
				newAnnotations.code = true;
			}
			
			// Handle links
			if (tagName === 'a') {
				const href = el.getAttribute('href') || '';
				const text = el.text || '';
				if (text) {
					richText.push({
						type: 'text',
						text: {
							content: text,
							link: href ? { url: href } : null
						},
						annotations: Object.keys(newAnnotations).length > 0 ? newAnnotations : undefined
					});
				}
				return; // Don't process children of links
			}
			
			// Process children recursively with updated annotations
			const children = el.childNodes || [];
			for (const child of children) {
				processNode(child, newAnnotations);
			}
		}
	}

	// Process all child nodes
	const children = element.childNodes || [];
	for (const child of children) {
		processNode(child);
	}

	// If no rich text was extracted, try to get plain text
	if (richText.length === 0) {
		const text = element.text?.trim() || '';
		if (text) {
			richText.push({
				type: 'text',
				text: { content: text }
			});
		}
	}

	return richText;
}

function createParagraphBlock(richText: NotionRichText[]): NotionBlock {
	return {
		object: 'block',
		type: 'paragraph',
		paragraph: {
			rich_text: richText.length > 0 ? richText : []
		}
	};
}

