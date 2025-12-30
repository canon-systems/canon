/**
 * Confluence Workspace Provider
 */

import type { WorkspaceProvider, WorkspaceInfo, WorkspaceContent } from '../base';
import { marked } from 'marked';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';

const CONFLUENCE_API_BASE = 'https://api.atlassian.com/ex/confluence';

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

export class ConfluenceProvider implements WorkspaceProvider {
	name = 'confluence';

	async pullContent(_workspaceInfo: WorkspaceInfo, _connectionId: string): Promise<WorkspaceContent | null> {
		// TODO: Implement Confluence pull
		// For now, return null - Confluence pull can be added later
		console.warn('Confluence pull not yet implemented');
		return null;
	}

	async pushContent(
		workspaceInfo: WorkspaceInfo,
		content: WorkspaceContent,
		connectionId: string,
		_createNew = true
	): Promise<WorkspaceInfo | null> {
		try {
			const accessToken = await getProviderAccessToken({ provider: 'confluence', connectionId });
			if (!accessToken) {
				console.error('Confluence push error: missing Confluence token (please reconnect Confluence)');
				return null;
			}

			const { cloudId, resourceId } = parseConfluenceResourceId(workspaceInfo.resourceId);
			const cloudInfo = await resolveCloudInfo(accessToken, cloudId);
			if (!cloudInfo) {
				console.error('Confluence push error: unable to resolve cloud id.');
				return null;
			}

			const html = content.html || (content.markdown ? await marked.parse(content.markdown) : '');
			const storageValue = convertHtmlToConfluenceStorage(html);

			if (_createNew) {
				const spaceId = String(workspaceInfo.metadata?.spaceId || resourceId || '');
				const spaceKey = workspaceInfo.metadata?.spaceKey ? String(workspaceInfo.metadata.spaceKey) : null;
				const parentId = workspaceInfo.metadata?.parentId ? String(workspaceInfo.metadata.parentId) : null;

				if (!spaceId) {
					console.error('Confluence push error: missing space id.');
					return null;
				}

				const createPayload: Record<string, any> = {
					spaceId,
					status: 'current',
					title: content.title || 'Documentation',
					body: {
						representation: 'storage',
						value: storageValue,
					},
				};

				if (parentId) {
					createPayload.parentId = parentId;
				}

				const createResponse = await fetch(
					`${CONFLUENCE_API_BASE}/${cloudInfo.cloudId}/wiki/api/v2/pages`,
					{
						method: 'POST',
						headers: confluenceHeaders(accessToken),
						body: JSON.stringify(createPayload),
					}
				);

				if (!createResponse.ok) {
					const errorText = await createResponse.text().catch(() => '');
					console.error(`Confluence create error: ${errorText}`);
					return null;
				}

				const created = await createResponse.json().catch(() => null);
				const pageId = created?.id ? String(created.id) : null;
				const pageUrl = buildConfluencePageUrl(created, cloudInfo.siteUrl);

				if (!pageId) {
					console.error('Confluence push error: missing page id.');
					return null;
				}

				return {
					provider: 'confluence',
					resourceId: `${cloudInfo.cloudId}:${pageId}`,
					metadata: {
						cloudId: cloudInfo.cloudId,
						siteUrl: cloudInfo.siteUrl,
						spaceId,
						spaceKey,
						parentId,
						url: pageUrl,
					},
				};
			}

			const pageId = resourceId;
			if (!pageId) {
				console.error('Confluence update error: missing page id.');
				return null;
			}

			const updated = await updateConfluencePage(
				accessToken,
				cloudInfo.cloudId,
				pageId,
				content.title,
				storageValue
			);

			if (!updated) {
				return null;
			}

			return {
				provider: 'confluence',
				resourceId: `${cloudInfo.cloudId}:${pageId}`,
				metadata: {
					cloudId: cloudInfo.cloudId,
					siteUrl: cloudInfo.siteUrl,
					url: updated.url,
				},
			};
		} catch (error) {
			console.error('Confluence push error:', error);
			return null;
		}
	}

	async updateContent(
		workspaceInfo: WorkspaceInfo,
		content: WorkspaceContent,
		connectionId: string
	): Promise<boolean> {
		try {
			const accessToken = await getProviderAccessToken({ provider: 'confluence', connectionId });
			if (!accessToken) {
				console.error('Confluence update error: missing Confluence token (please reconnect Confluence)');
				return false;
			}

			const { cloudId, resourceId } = parseConfluenceResourceId(workspaceInfo.resourceId);
			const cloudInfo = await resolveCloudInfo(accessToken, cloudId);
			if (!cloudInfo || !resourceId) {
				console.error('Confluence update error: missing cloud id or resource id.');
				return false;
			}

			const html = content.html || (content.markdown ? await marked.parse(content.markdown) : '');
			const storageValue = convertHtmlToConfluenceStorage(html);
			const updated = await updateConfluencePage(
				accessToken,
				cloudInfo.cloudId,
				resourceId,
				content.title,
				storageValue
			);
			return Boolean(updated);
		} catch (error) {
			console.error('Confluence update error:', error);
			return false;
		}
	}
}

function confluenceHeaders(accessToken: string) {
	return {
		Authorization: `Bearer ${accessToken}`,
		'Content-Type': 'application/json',
		Accept: 'application/json',
	} as const;
}

function parseConfluenceResourceId(resourceId?: string | null): { cloudId?: string | null; resourceId?: string | null } {
	if (!resourceId) return { cloudId: null, resourceId: null };
	const parts = resourceId.split(':');
	if (parts.length >= 2) {
		return { cloudId: parts[0], resourceId: parts.slice(1).join(':') };
	}
	return { cloudId: null, resourceId };
}

async function resolveCloudInfo(accessToken: string, preferredCloudId?: string | null): Promise<{ cloudId: string; siteUrl?: string | null } | null> {
	const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/json',
		},
	});

	if (!response.ok) {
		return preferredCloudId ? { cloudId: preferredCloudId, siteUrl: null } : null;
	}

	const resources = await response.json().catch(() => []);
	const list = Array.isArray(resources) ? resources : [];
	const resource = preferredCloudId
		? list.find((item) => item?.id === preferredCloudId)
		: list[0];
	if (!resource?.id) {
		return preferredCloudId ? { cloudId: preferredCloudId, siteUrl: null } : null;
	}

	return {
		cloudId: resource.id,
		siteUrl: resource.url || null,
	};
}

async function updateConfluencePage(
	accessToken: string,
	cloudId: string,
	pageId: string,
	title: string | undefined,
	storageValue: string
): Promise<{ id: string; url?: string | null } | null> {
	const pageResponse = await fetch(
		`${CONFLUENCE_API_BASE}/${cloudId}/wiki/api/v2/pages/${pageId}`,
		{
			headers: confluenceHeaders(accessToken),
		}
	);

	if (!pageResponse.ok) {
		const errorText = await pageResponse.text().catch(() => '');
		console.error(`Confluence fetch page error: ${errorText}`);
		return null;
	}

	const page = await pageResponse.json().catch(() => null);
	const currentVersion = page?.version?.number ? Number(page.version.number) : null;
	if (!currentVersion) {
		console.error('Confluence update error: missing current version.');
		return null;
	}

	const updateResponse = await fetch(
		`${CONFLUENCE_API_BASE}/${cloudId}/wiki/api/v2/pages/${pageId}`,
		{
			method: 'PUT',
			headers: confluenceHeaders(accessToken),
			body: JSON.stringify({
				id: pageId,
				status: 'current',
				title: title || page.title || 'Documentation',
				version: {
					number: currentVersion + 1,
				},
				body: {
					representation: 'storage',
					value: storageValue,
				},
			}),
		}
	);

	if (!updateResponse.ok) {
		const errorText = await updateResponse.text().catch(() => '');
		console.error(`Confluence update error: ${errorText}`);
		return null;
	}

	const updated = await updateResponse.json().catch(() => null);
	return {
		id: updated?.id ? String(updated.id) : pageId,
		url: buildConfluencePageUrl(updated, updated?._links?.base || updated?.links?.base || null),
	};
}

function buildConfluencePageUrl(payload: any, siteUrl?: string | null): string | null {
	const links = payload?._links || payload?.links || {};
	const base = links?.base || siteUrl || null;
	const webui = links?.webui || null;
	if (base && webui) {
		return `${base}${webui}`;
	}
	return null;
}
