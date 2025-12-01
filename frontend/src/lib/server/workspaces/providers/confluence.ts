/**
 * Confluence Workspace Provider
 */

import type { WorkspaceProvider, WorkspaceInfo, WorkspaceContent } from '../base';
import { NANGO_CONFIG } from '../../nango/config';
import { marked } from 'marked';

function convertHtmlToConfluenceStorage(html: string): string {
	// Basic conversion - replace common HTML tags with Confluence storage format
	return html
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
}

async function getCloudId(connectionId: string): Promise<string | null> {
	try {
		const accessibleResourcesUrl = new URL('/proxy/oauth/token/accessible-resources', NANGO_CONFIG.host);
		const resourcesResponse = await fetch(accessibleResourcesUrl.toString(), {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
				'Content-Type': 'application/json',
				'Provider-Config-Key': 'confluence',
				'Connection-Id': connectionId,
				'Base-Url-Override': 'https://api.atlassian.com'
			}
		});

		if (!resourcesResponse.ok) return null;

		const resourcesData = await resourcesResponse.json();
		return resourcesData[0]?.id || resourcesData.id || null;
	} catch {
		return null;
	}
}

export class ConfluenceProvider implements WorkspaceProvider {
	name = 'confluence';

	async pullContent(workspaceInfo: WorkspaceInfo, connectionId: string): Promise<WorkspaceContent | null> {
		// TODO: Implement Confluence pull
		// For now, return null - Confluence pull can be added later
		console.warn('Confluence pull not yet implemented');
		return null;
	}

	async pushContent(
		workspaceInfo: WorkspaceInfo,
		content: WorkspaceContent,
		connectionId: string,
		createNew = true
	): Promise<WorkspaceInfo | null> {
		try {
			const cloudId = await getCloudId(connectionId);
			if (!cloudId) return null;

			const spaceKey = workspaceInfo.metadata?.spaceKey || workspaceInfo.resourceId;
			const parentPageId = workspaceInfo.metadata?.parentPageId;
			const html = content.html || marked.parse(content.markdown) as string;
			const confluenceBody = convertHtmlToConfluenceStorage(html);

			const endpoint = `/ex/confluence/${cloudId}/wiki/rest/api/content`;
			const createUrl = new URL(`/proxy${endpoint}`, NANGO_CONFIG.host);

			const pageData: any = {
				type: 'page',
				title: content.title,
				space: { key: spaceKey },
				body: {
					storage: {
						value: confluenceBody,
						representation: 'storage'
					}
				}
			};

			if (parentPageId) {
				pageData.ancestors = [{ id: parentPageId }];
			}

			const createResponse = await fetch(createUrl.toString(), {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${NANGO_CONFIG.secretKey}`,
					'Content-Type': 'application/json',
					'Provider-Config-Key': 'confluence',
					'Connection-Id': connectionId,
					'Base-Url-Override': 'https://api.atlassian.com'
				},
				body: JSON.stringify(pageData)
			});

			if (!createResponse.ok) return null;

			const createData = await createResponse.json();
			return {
				provider: 'confluence',
				resourceId: createData.id,
				metadata: {
					spaceKey,
					cloudId
				}
			};
		} catch (err) {
			console.error('Confluence push error:', err);
			return null;
		}
	}

	async updateContent(
		workspaceInfo: WorkspaceInfo,
		content: WorkspaceContent,
		connectionId: string
	): Promise<boolean> {
		// TODO: Implement Confluence update
		console.warn('Confluence update not yet implemented');
		return false;
	}
}

