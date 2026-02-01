/**
 * Confluence Workspace Provider
 */

import type { WorkspaceProvider, WorkspaceInfo, WorkspaceContent } from '../base';
import { marked } from 'marked';
import { getProviderAccessToken, withConfluenceAccessToken } from '@/lib/server/oauth/tokenStore';

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

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

				// If a page with this title already exists in this space (and under this parent), update it instead of creating
				let existingPageId = await findPageByTitle(
					connectionId,
					cloudInfo.cloudId,
					spaceId,
					content.title || 'Documentation',
					parentId ?? undefined
				);
				// Fallback: parent may have changed (e.g. system page recreated at space root); find by title anywhere in space and update
				if (!existingPageId && parentId != null) {
					existingPageId = await findPageByTitle(
						connectionId,
						cloudInfo.cloudId,
						spaceId,
						content.title || 'Documentation',
						undefined
					);
					if (existingPageId) {
						console.log(`[Confluence] Found existing page by title (different parent), updating: "${content.title || 'Documentation'}" (id=${existingPageId})`);
					}
				}
				if (existingPageId) {
					const existingWorkspaceInfo: WorkspaceInfo = {
						provider: 'confluence',
						resourceId: `${cloudInfo.cloudId}:${existingPageId}`,
						metadata: { ...workspaceInfo.metadata, spaceId, spaceKey, parentId },
					};
					const updated = await this.updateContent(existingWorkspaceInfo, content, connectionId);
					if (updated) {
						console.log(`[Confluence] Updated existing page by title: "${content.title || 'Documentation'}" (id=${existingPageId})`);
						return {
							provider: 'confluence',
							resourceId: `${cloudInfo.cloudId}:${existingPageId}`,
							metadata: {
								cloudId: cloudInfo.cloudId,
								siteUrl: cloudInfo.siteUrl,
								spaceId,
								spaceKey,
								parentId,
							},
						};
					}
				}

				const createPayload: Record<string, unknown> = {
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

				const createResponse = await withConfluenceAccessToken({
					connectionId,
					run: async (token) =>
						fetch(`${CONFLUENCE_API_BASE}/${cloudInfo.cloudId}/wiki/api/v2/pages`, {
							method: 'POST',
							headers: confluenceHeaders(token),
							body: JSON.stringify(createPayload),
						}),
				});

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
				connectionId,
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
				connectionId,
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

	async resourceExists(workspaceInfo: WorkspaceInfo, connectionId: string): Promise<boolean> {
		try {
			const { cloudId, resourceId } = parseConfluenceResourceId(workspaceInfo.resourceId);
			if (!cloudId || !resourceId) return false;

			const response = await withConfluenceAccessToken({
				connectionId,
				run: async (token) =>
					fetch(`${CONFLUENCE_API_BASE}/${cloudId}/wiki/api/v2/pages/${resourceId}`, {
						headers: confluenceHeaders(token),
					}),
			});

			return response.ok;
		} catch {
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

function matchPageByTitleAndParent(
	results: { id?: string; title?: string; parentId?: string | null }[],
	title: string,
	parentId?: string
): string | null {
	const wantTitle = title.trim().toLowerCase();
	let firstMatch: string | null = null;
	for (const page of results) {
		if (!page?.id) continue;
		const pageTitle = (page.title != null ? String(page.title).trim() : '').toLowerCase();
		if (pageTitle !== wantTitle) continue;
		const pageParentId = page.parentId != null ? String(page.parentId) : undefined;
		if (parentId === undefined) {
			if (pageParentId === undefined || pageParentId === '') return String(page.id);
			if (firstMatch === null) firstMatch = String(page.id);
		} else if (pageParentId === parentId) {
			return String(page.id);
		}
	}
	return firstMatch;
}

/**
 * Find a page in a space by title (and optionally under a given parent). Returns the page id if found.
 * Tries GET /spaces/{id}/pages then GET /pages?title=...&space-id=... so we always find existing pages and can update instead of create.
 */
async function findPageByTitle(
	connectionId: string,
	cloudId: string,
	spaceId: string,
	title: string,
	parentId?: string
): Promise<string | null> {
	// 1) GET /spaces/{id}/pages?title=... (spaces endpoint may filter by title)
	let url = new URL(`${CONFLUENCE_API_BASE}/${cloudId}/wiki/api/v2/spaces/${spaceId}/pages`);
	url.searchParams.set('title', title);
	url.searchParams.set('limit', '50');

	let response = await withConfluenceAccessToken({
		connectionId,
		run: async (token) => fetch(url.toString(), { headers: confluenceHeaders(token) }),
	});

	if (response.ok) {
		const payload = await response.json().catch(() => null);
		const results = Array.isArray(payload?.results) ? payload.results : [];
		const match = matchPageByTitleAndParent(results, title, parentId);
		if (match) return match;
	}

	// 2) Fallback: GET /pages?title=...&space-id=... (global pages endpoint)
	url = new URL(`${CONFLUENCE_API_BASE}/${cloudId}/wiki/api/v2/pages`);
	url.searchParams.set('title', title);
	url.searchParams.set('space-id', spaceId);
	url.searchParams.set('limit', '50');

	response = await withConfluenceAccessToken({
		connectionId,
		run: async (token) => fetch(url.toString(), { headers: confluenceHeaders(token) }),
	});

	if (!response.ok) return null;

	const payload = await response.json().catch(() => null);
	const results = Array.isArray(payload?.results) ? payload.results : [];
	return matchPageByTitleAndParent(results, title, parentId);
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
	connectionId: string,
	cloudId: string,
	pageId: string,
	title: string | undefined,
	storageValue: string
): Promise<{ id: string; url?: string | null } | null> {
	const pageResponse = await withConfluenceAccessToken({
		connectionId,
		run: async (token) =>
			fetch(`${CONFLUENCE_API_BASE}/${cloudId}/wiki/api/v2/pages/${pageId}`, {
				headers: confluenceHeaders(token),
			}),
	});

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

	const updateResponse = await withConfluenceAccessToken({
		connectionId,
		run: async (token) =>
			fetch(`${CONFLUENCE_API_BASE}/${cloudId}/wiki/api/v2/pages/${pageId}`, {
				method: 'PUT',
				headers: confluenceHeaders(token),
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
			}),
	});

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

function buildConfluencePageUrl(payload: Record<string, unknown>, siteUrl?: string | null): string | null {
	const links = (payload?._links || payload?.links || {}) as Record<string, unknown>;
	const base = (typeof links?.base === 'string' ? links.base : null) || siteUrl || null;
	const webui = links?.webui || null;
	if (base && webui) {
		return `${base}${webui}`;
	}
	return null;
}
