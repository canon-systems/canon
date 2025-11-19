/**
 * API Endpoint: Push Documentation to Google Docs
 * 
 * Pushes markdown documentation to a Google Doc using Nango
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { NANGO_CONFIG } from '$lib/server/nango/config';
import { marked } from 'marked';
import { parse, HTMLElement } from 'node-html-parser';

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
			documentId,
			title,
			markdown,
			html 
		} = body as { 
			submissionId?: string; 
			documentId?: string;
			title?: string;
			markdown?: string;
			html?: string;
		};

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

		// Convert HTML to Google Docs format
		const requests = convertHtmlToGoogleDocsRequests(docHtml, docTitle);

		if (documentId) {
			// Update existing document
			// Google Docs API: POST /v1/documents/{documentId}:batchUpdate
			const updateUrl = new URL(`/proxy/v1/documents/${documentId}:batchUpdate`, NANGO_CONFIG.host);
			
			const updateResponse = await fetch(updateUrl.toString(), {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
					'Content-Type': 'application/json',
					'Provider-Config-Key': 'google-docs', // Must match Nango dashboard Integration ID
					'Connection-Id': connection.connection_id
				},
				body: JSON.stringify({
					requests: requests
				})
			});

			if (!updateResponse.ok) {
				const updateErrorText = await updateResponse.text();
				console.error('Google Docs update failed:', {
					status: updateResponse.status,
					statusText: updateResponse.statusText,
					error: updateErrorText,
					url: updateUrl.toString(),
					documentId
				});
				throw new Error(`Google Docs API error: ${updateResponse.status} ${updateErrorText}`);
			}

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
									provider: 'googledocs',
									resourceId: documentId,
									metadata: {}
								}
							}
						})
						.eq('id', submissionId);
				}
			}

			return jsonResponse({
				success: true,
				documentId: documentId,
				message: 'Documentation updated in Google Docs successfully'
			});
		} else {
			// Create new document
			// Google Docs API: POST /v1/documents
			const createUrl = new URL('/proxy/v1/documents', NANGO_CONFIG.host);
			
			const createResponse = await fetch(createUrl.toString(), {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
					'Content-Type': 'application/json',
					'Provider-Config-Key': 'google-docs', // Must match Nango dashboard Integration ID
					'Connection-Id': connection.connection_id
				},
				body: JSON.stringify({
					title: docTitle
				})
			});

			if (!createResponse.ok) {
				const createErrorText = await createResponse.text();
				console.error('Google Docs create failed:', {
					status: createResponse.status,
					statusText: createResponse.statusText,
					error: createErrorText,
					url: createUrl.toString()
				});
				throw new Error(`Google Docs API error: ${createResponse.status} ${createErrorText}`);
			}

			const createData = await createResponse.json();
			// Google Docs API returns documentId in the response
			const newDocumentId = createData.documentId || createData.document?.documentId;
			
			if (!newDocumentId) {
				console.error('Google Docs create response:', createData);
				throw new Error('No documentId returned from Google Docs API');
			}

			// Now insert content into the new document
			// Google Docs API: POST /v1/documents/{documentId}:batchUpdate
			const insertUrl = new URL(`/proxy/v1/documents/${newDocumentId}:batchUpdate`, NANGO_CONFIG.host);
			
			const insertResponse = await fetch(insertUrl.toString(), {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
					'Content-Type': 'application/json',
					'Provider-Config-Key': 'google-docs', // Must match Nango dashboard Integration ID
					'Connection-Id': connection.connection_id
				},
				body: JSON.stringify({
					requests: requests
				})
			});

			if (!insertResponse.ok) {
				const insertErrorText = await insertResponse.text();
				console.error('Google Docs insert failed:', {
					status: insertResponse.status,
					statusText: insertResponse.statusText,
					error: insertErrorText,
					url: insertUrl.toString(),
					documentId: newDocumentId
				});
				throw new Error(`Google Docs API error: ${insertResponse.status} ${insertErrorText}`);
			}

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
									provider: 'googledocs',
									resourceId: newDocumentId,
									metadata: {}
								}
							}
						})
						.eq('id', submissionId);
				}
			}

			return jsonResponse({
				success: true,
				documentId: newDocumentId,
				message: 'Documentation pushed to Google Docs successfully'
			});
		}
	} catch (err: any) {
		console.error('Google Docs push error:', err);
		return jsonResponse(
			{
				error: 'Failed to push to Google Docs',
				detail: err.message || String(err)
			},
			500
		);
	}
};

/**
 * Convert HTML to Google Docs API batchUpdate requests
 * Preserves formatting: headings, lists, bold, italic, links, etc.
 */
function convertHtmlToGoogleDocsRequests(html: string, title: string): any[] {
	const requests: any[] = [];
	
	// Parse HTML
	const root = parse(html);
	const body = root.querySelector('body') || root;
	
	// Track current index in the document (starts at 1)
	let currentIndex = 1;
	
	// Process each top-level element
	const children = body.childNodes || [];
	
	for (const node of children) {
		if (node instanceof HTMLElement) {
			const tagName = node.tagName.toLowerCase();
			
			// Handle lists specially
			if (tagName === 'ul' || tagName === 'ol') {
				const listItems = node.querySelectorAll('li');
				for (const li of listItems) {
					const text = extractTextContent(li);
					if (!text.trim()) continue;
					
					// Insert list item text with bullet/number
					const prefix = tagName === 'ul' ? '• ' : '';
					requests.push({
						insertText: {
							location: { index: currentIndex },
							text: prefix + text + '\n'
						}
					});
					
					// Apply list formatting
					const endIndex = currentIndex + prefix.length + text.length;
					requests.push({
						createParagraphBullets: {
							range: {
								startIndex: currentIndex,
								endIndex: endIndex
							},
							bulletPreset: tagName === 'ul' ? 'BULLET_DISC_CIRCLE_SQUARE' : 'NUMBERED_DECIMAL_ALPHA_ROMAN'
						}
					});
					
					// Apply text formatting within list item
					const textStyles = extractTextStyles(li, currentIndex + prefix.length, endIndex);
					requests.push(...textStyles);
					
					currentIndex = endIndex + 1; // +1 for the newline
				}
				continue;
			}
			
			const text = extractTextContent(node);
			
			if (!text.trim()) continue;
			
			// Insert the text
			requests.push({
				insertText: {
					location: { index: currentIndex },
					text: text + '\n'
				}
			});
			
			// Apply formatting based on element type
			const endIndex = currentIndex + text.length;
			
			// Handle headings
			if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || tagName === 'h4' || tagName === 'h5' || tagName === 'h6') {
				const headingLevel = parseInt(tagName.charAt(1)) || 1;
				requests.push({
					updateParagraphStyle: {
						range: {
							startIndex: currentIndex,
							endIndex: endIndex
						},
						paragraphStyle: {
							namedStyleType: `HEADING_${Math.min(headingLevel, 6)}`
						},
						fields: 'namedStyleType'
					}
				});
			}
			
			// Apply text formatting (bold, italic, etc.)
			const textStyles = extractTextStyles(node, currentIndex, endIndex);
			requests.push(...textStyles);
			
			currentIndex = endIndex + 1; // +1 for the newline
		} else if (node.nodeType === 3) {
			// Text node
			const text = node.text || '';
			if (text.trim()) {
				requests.push({
					insertText: {
						location: { index: currentIndex },
						text: text + '\n'
					}
				});
				currentIndex += text.length + 1;
			}
		}
	}
	
	// If no content was added, add a placeholder
	if (requests.length === 0) {
		requests.push({
			insertText: {
				location: { index: 1 },
				text: 'Documentation\n'
			}
		});
	}
	
	return requests;
}

/**
 * Extract plain text content from an HTML element
 */
function extractTextContent(element: HTMLElement): string {
	let text = '';
	
	function traverse(node: any) {
		if (node.nodeType === 3) {
			// Text node
			text += node.text || '';
		} else if (node instanceof HTMLElement) {
			// Element node - process children
			const children = node.childNodes || [];
			for (const child of children) {
				traverse(child);
			}
		}
	}
	
	traverse(element);
	return text;
}

/**
 * Extract text style updates for formatted text (bold, italic, links, etc.)
 */
function extractTextStyles(element: HTMLElement, startIndex: number, endIndex: number): any[] {
	const styles: any[] = [];
	
	function processNode(node: any, offset: number): number {
		if (node.nodeType === 3) {
			// Text node - return its length
			return (node.text || '').length;
		} else if (node instanceof HTMLElement) {
			const tagName = node.tagName.toLowerCase();
			const text = extractTextContent(node);
			const textLength = text.length;
			
			// Build style object
			const style: any = {};
			let hasStyle = false;
			
			if (tagName === 'strong' || tagName === 'b') {
				style.bold = true;
				hasStyle = true;
			}
			if (tagName === 'em' || tagName === 'i') {
				style.italic = true;
				hasStyle = true;
			}
			if (tagName === 'u') {
				style.underline = true;
				hasStyle = true;
			}
			if (tagName === 'code') {
				style.foregroundColor = { color: { rgbColor: { red: 0.8, green: 0.2, blue: 0.2 } } };
				hasStyle = true;
			}
			
			// Handle links
			if (tagName === 'a') {
				const href = node.getAttribute('href') || '';
				if (href && text) {
					styles.push({
						updateTextStyle: {
							range: {
								startIndex: startIndex + offset,
								endIndex: startIndex + offset + textLength
							},
							textStyle: {
								link: { url: href }
							},
							fields: 'link'
						}
					});
				}
			}
			
			// Apply text styles if any
			if (hasStyle && textLength > 0) {
				styles.push({
					updateTextStyle: {
						range: {
							startIndex: startIndex + offset,
							endIndex: startIndex + offset + textLength
						},
						textStyle: style,
						fields: Object.keys(style).join(',')
					}
				});
			}
			
			// Process children recursively
			let childOffset = offset;
			const children = node.childNodes || [];
			for (const child of children) {
				const childLength = processNode(child, childOffset);
				childOffset += childLength;
			}
			
			return textLength;
		}
		return 0;
	}
	
	processNode(element, 0);
	return styles;
}

