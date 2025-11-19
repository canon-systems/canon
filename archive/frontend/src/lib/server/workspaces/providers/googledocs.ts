/**
 * Google Docs Workspace Provider
 */

import type { WorkspaceProvider, WorkspaceInfo, WorkspaceContent } from '../base';
import { NANGO_CONFIG } from '$lib/server/nango/config';
import { marked } from 'marked';
import { parse, HTMLElement } from 'node-html-parser';

function convertHtmlToGoogleDocsRequests(html: string, title: string): any[] {
	const root = parse(html);
	const body = root.querySelector('body') || root;
	const requests: any[] = [];

	// Clear existing content
	requests.push({
		deleteContent: {
			range: {
				startIndex: 1,
				endIndex: 1
			}
		}
	});

	// Insert title
	if (title) {
		requests.push({
			insertText: {
				location: { index: 1 },
				text: title + '\n'
			}
		});
		requests.push({
			updateParagraphStyle: {
				range: {
					startIndex: 1,
					endIndex: title.length + 1
				},
				paragraphStyle: {
					namedStyleType: 'HEADING_1'
				},
				fields: 'namedStyleType'
			}
		});
	}

	// Process content (simplified - full implementation would handle all HTML elements)
	const textContent = body.text || '';
	if (textContent) {
		requests.push({
			insertText: {
				location: { index: title ? title.length + 2 : 1 },
				text: textContent
			}
		});
	}

	return requests;
}

export class GoogleDocsProvider implements WorkspaceProvider {
	name = 'googledocs';

	async pullContent(workspaceInfo: WorkspaceInfo, connectionId: string): Promise<WorkspaceContent | null> {
		// TODO: Implement Google Docs pull
		// For now, return null - Google Docs pull can be added later
		console.warn('Google Docs pull not yet implemented');
		return null;
	}

	async pushContent(
		workspaceInfo: WorkspaceInfo,
		content: WorkspaceContent,
		connectionId: string,
		createNew = true
	): Promise<WorkspaceInfo | null> {
		try {
			const html = content.html || marked.parse(content.markdown) as string;
			const requests = convertHtmlToGoogleDocsRequests(html, content.title);

			if (createNew) {
				// Create new document
				const createUrl = new URL('/proxy/v1/documents', NANGO_CONFIG.host);
				const createResponse = await fetch(createUrl.toString(), {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
						'Content-Type': 'application/json',
						'Provider-Config-Key': 'google-docs',
						'Connection-Id': connectionId
					},
					body: JSON.stringify({
						title: content.title
					})
				});

				if (!createResponse.ok) return null;

				const createData = await createResponse.json();
				const documentId = createData.documentId || createData.document?.documentId;
				if (!documentId) return null;

				// Insert content
				const insertUrl = new URL(`/proxy/v1/documents/${documentId}:batchUpdate`, NANGO_CONFIG.host);
				const insertResponse = await fetch(insertUrl.toString(), {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
						'Content-Type': 'application/json',
						'Provider-Config-Key': 'google-docs',
						'Connection-Id': connectionId
					},
					body: JSON.stringify({ requests })
				});

				if (!insertResponse.ok) return null;

				return {
					provider: 'googledocs',
					resourceId: documentId,
					metadata: workspaceInfo.metadata
				};
			} else {
				const success = await this.updateContent(workspaceInfo, content, connectionId);
				return success ? workspaceInfo : null;
			}
		} catch (err) {
			console.error('Google Docs push error:', err);
			return null;
		}
	}

	async updateContent(
		workspaceInfo: WorkspaceInfo,
		content: WorkspaceContent,
		connectionId: string
	): Promise<boolean> {
		try {
			const documentId = workspaceInfo.resourceId;
			const html = content.html || marked.parse(content.markdown) as string;
			const requests = convertHtmlToGoogleDocsRequests(html, content.title);

			const updateUrl = new URL(`/proxy/v1/documents/${documentId}:batchUpdate`, NANGO_CONFIG.host);
			const updateResponse = await fetch(updateUrl.toString(), {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
					'Content-Type': 'application/json',
					'Provider-Config-Key': 'google-docs',
					'Connection-Id': connectionId
				},
				body: JSON.stringify({ requests })
			});

			return updateResponse.ok;
		} catch (err) {
			console.error('Google Docs update error:', err);
			return false;
		}
	}
}

