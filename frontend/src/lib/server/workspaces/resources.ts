import { getProviderAccessToken, withConfluenceAccessToken } from '@/lib/server/oauth/tokenStore';

export type WorkspaceResource = {
  id: string;
  type: string;
  title: string;
  url?: string;
  metadata?: Record<string, unknown>;
};

async function notionSearch(connectionId: string, objectValue: 'page' | 'database') {
  try {
    const token = await getProviderAccessToken({ provider: 'notion', connectionId });
    if (!token) {
      return [];
    }

    const url = new URL('https://api.notion.com/v1/search');
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        filter: {
          property: 'object',
          value: objectValue,
        },
        page_size: 100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Notion API error (${response.status}): ${errorText || response.statusText}`);
    }

    const payload = await response.json().catch(() => null);
    if (!payload || !Array.isArray(payload.results)) {
      return [];
    }

    return payload.results.map((item: {
      properties?: {
        title?: { title?: Array<{ text?: { content?: string } }> };
        Name?: { title?: Array<{ text?: { content?: string } }> };
      };
      title?: Array<{ text?: { content?: string } }>;
      id?: string;
      url?: string;
      [key: string]: unknown;
    }) => {
      let title = 'Untitled';
      const props = item.properties || {};
      const titleProp = props.title || props.Name;
      if (Array.isArray(titleProp?.title)) {
        title = titleProp.title.map((t: { text?: { content?: string } }) => t.text?.content || '').join('').trim() || title;
      } else if (Array.isArray(item.title)) {
        title = item.title.map((t: { text?: { content?: string } }) => t.text?.content || '').join('').trim() || title;
      }

      const url = typeof item.url === 'string' ? item.url : undefined;

      return {
        id: item.id || '',
        type: objectValue === 'page' ? 'page' : 'database',
        title,
        url,
      };
    });
  } catch (error) {
    console.error(`Notion search error (${objectValue}):`, error);
    throw error;
  }
}

async function getNotionResources(connectionId: string): Promise<WorkspaceResource[]> {
  try {
    const pages = await notionSearch(connectionId, 'page');
    const databases = await notionSearch(connectionId, 'database');
    return [...pages, ...databases];
  } catch (error) {
    console.error('Failed to get Notion resources:', error);
    throw error;
  }
}

async function getConfluenceResources(connectionId: string): Promise<WorkspaceResource[]> {
  const token = await getProviderAccessToken({ provider: 'confluence', connectionId });
  if (!token) {
    return [];
  }

  const resourcesResponse = await withConfluenceAccessToken({
    connectionId,
    run: async (accessToken) =>
      fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }),
  });

  if (!resourcesResponse.ok) {
    return [];
  }

  const resourcesPayload = await resourcesResponse.json().catch(() => []);
  const resources = Array.isArray(resourcesPayload) ? resourcesPayload : [];

  const allSpaces: WorkspaceResource[] = [];

  for (const resource of resources) {
    const cloudId = resource?.id;
    const siteUrl = resource?.url;
    if (!cloudId) continue;

    let nextUrl: string | null = `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/spaces?limit=200`;
    while (nextUrl) {
      const currentUrl = nextUrl; // Capture for TypeScript narrowing
      const spacesResponse: Response = await withConfluenceAccessToken({
        connectionId,
        run: async (accessToken) =>
          fetch(currentUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
          }),
      });

      if (!spacesResponse.ok) {
        break;
      }

      const payload = await spacesResponse.json().catch(() => null);
      const spaces = Array.isArray(payload?.results) ? payload.results : [];

      for (const space of spaces) {
        const spaceId = space?.id ? String(space.id) : null;
        const spaceKey = space?.key ? String(space.key) : null;
        if (!spaceId) continue;
        const spaceUrl = siteUrl && spaceKey ? `${siteUrl}/wiki/spaces/${spaceKey}` : undefined;
        allSpaces.push({
          id: `${cloudId}:${spaceId}`,
          type: 'space',
          title: space.name || spaceKey || `Space ${spaceId}`,
          url: spaceUrl,
          metadata: {
            cloudId,
            spaceId,
            spaceKey,
          },
        });
      }

      const nextLink = payload?._links?.next || payload?.next;
      if (nextLink) {
        nextUrl = nextLink.startsWith('http')
          ? nextLink
          : `https://api.atlassian.com/ex/confluence/${cloudId}${nextLink.startsWith('/') ? '' : '/'}${nextLink}`;
      } else {
        nextUrl = null;
      }
    }
  }

  return allSpaces;
}

async function getConfluencePages(params: {
  connectionId: string;
  cloudId: string;
  spaceId: string;
}): Promise<WorkspaceResource[]> {
  const { connectionId, cloudId, spaceId } = params;
  const token = await getProviderAccessToken({ provider: 'confluence', connectionId });
  if (!token) {
    return [];
  }

  type RawPage = { id?: string; title?: string; parentId?: string | null; _links?: { webui?: string } };
  const pages: RawPage[] = [];
  let nextUrl: string | null = `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/pages?limit=200&space-id=${encodeURIComponent(spaceId)}`;

  while (nextUrl) {
    const currentUrl = nextUrl; // Capture for TypeScript narrowing
    const response: Response = await withConfluenceAccessToken({
      connectionId,
      run: async (accessToken) =>
        fetch(currentUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        }),
    });

    if (!response.ok) {
      break;
    }

    const payload = await response.json().catch(() => null);
    const results = Array.isArray(payload?.results) ? payload.results : [];
    type ConfluencePageResult = { id?: string; title?: string; parentId?: string | null; _links?: { webui?: string } };
    pages.push(
      ...(results as ConfluencePageResult[]).map((p) => ({
        id: p?.id ? String(p.id) : undefined,
        title: p?.title,
        parentId: p?.parentId ?? null,
        _links: p?._links,
      }))
    );

    const nextLink = payload?._links?.next || payload?.next;
    if (nextLink) {
      nextUrl = nextLink.startsWith('http')
        ? nextLink
        : `https://api.atlassian.com/ex/confluence/${cloudId}${nextLink.startsWith('/') ? '' : '/'}${nextLink}`;
    } else {
      nextUrl = null;
    }
  }

  // Build hierarchical labels so users can pick any page as a folder (similar to Notion).
  const pageMap = new Map<string, RawPage>();
  pages.forEach((p) => {
    if (p.id) pageMap.set(p.id, p);
  });

  const pathCache = new Map<string, string>();
  const buildPath = (pageId: string): string => {
    if (pathCache.has(pageId)) return pathCache.get(pageId)!;

    const segments: string[] = [];
    const visited = new Set<string>();
    let currentId: string | undefined = pageId;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const current = pageMap.get(currentId);
      if (!current) break;
      const label = current.title?.trim() || `Page ${currentId}`;
      segments.push(label);
      const parentId =
        typeof current.parentId === 'string' && current.parentId.trim().length > 0
          ? current.parentId
          : undefined;
      currentId = parentId;
    }

    const path = segments.reverse().join(' / ');
    pathCache.set(pageId, path);
    return path;
  };

  const resources: WorkspaceResource[] = pages
    .filter((p) => p.id)
    .map((p) => {
      const pageId = String(p.id);
      return {
        id: `${cloudId}:${pageId}`,
        type: 'page',
        title: buildPath(pageId),
        url: p._links?.webui,
        metadata: { cloudId, spaceId, parentId: p.parentId ?? null },
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return resources;
}

async function getCodaResources(connectionId: string): Promise<WorkspaceResource[]> {
  void connectionId;
  return [];
}

function dedupeResources(list: WorkspaceResource[]): WorkspaceResource[] {
  const seen = new Set<string>();
  return list.filter((r) => {
    if (!r?.id) return false;
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

export async function listResources(provider: string, connectionId: string): Promise<WorkspaceResource[]> {
  switch (provider) {
    case 'notion':
      return dedupeResources(await getNotionResources(connectionId));
    case 'confluence':
      return dedupeResources(await getConfluenceResources(connectionId));
    case 'coda':
      return dedupeResources(await getCodaResources(connectionId));
    default:
      return [];
  }
}

export async function listConfluencePages(params: {
  connectionId: string;
  cloudId: string;
  spaceId: string;
}): Promise<WorkspaceResource[]> {
  return getConfluencePages(params);
}
