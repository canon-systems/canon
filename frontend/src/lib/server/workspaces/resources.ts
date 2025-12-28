import { NANGO_CONFIG } from '../nango/config';
import { getProviderAccessToken } from '@/lib/server/oauth/tokenStore';

export type WorkspaceResource = {
  id: string;
  type: string;
  title: string;
  url?: string;
};

async function notionSearch(connectionId: string, objectValue: 'page' | 'database') {
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
    return [];
  }

  const payload = await response.json().catch(() => null);
  if (!payload || !Array.isArray(payload.results)) {
    return [];
  }

  return payload.results.map((item: any) => {
    let title = 'Untitled';
    const props = item.properties || {};
    const titleProp = props.title || props.Name;
    if (Array.isArray(titleProp?.title)) {
      title = titleProp.title.map((t: any) => t.text?.content || '').join('').trim() || title;
    } else if (Array.isArray(item.title)) {
      title = item.title.map((t: any) => t.text?.content || '').join('').trim() || title;
    }

    return {
      id: item.id,
      type: objectValue === 'page' ? 'page' : 'database',
      title,
      url: item.url,
    };
  });
}

async function getNotionResources(connectionId: string): Promise<WorkspaceResource[]> {
  const pages = await notionSearch(connectionId, 'page');
  const databases = await notionSearch(connectionId, 'database');
  return [...pages, ...databases];
}

async function getConfluenceResources(connectionId: string): Promise<WorkspaceResource[]> {
  try {
    const accessibleUrl = new URL('/proxy/oauth/token/accessible-resources', NANGO_CONFIG.host);
    const accessible = await fetch(accessibleUrl.toString(), {
      headers: {
        Authorization: `Bearer ${NANGO_CONFIG.secretKey}`,
        'Content-Type': 'application/json',
        'Provider-Config-Key': 'confluence',
        'Connection-Id': connectionId,
        'Base-Url-Override': 'https://api.atlassian.com',
      },
    });

    if (!accessible.ok) {
      return [];
    }

    const accessibleData = await accessible.json().catch(() => null);
    const cloudId = accessibleData?.[0]?.id || accessibleData?.id;
    if (!cloudId) {
      return [];
    }

    const spacesUrl = new URL(`/proxy/ex/confluence/${cloudId}/wiki/rest/api/space`, NANGO_CONFIG.host);
    spacesUrl.searchParams.set('limit', '100');
    const spacesResponse = await fetch(spacesUrl.toString(), {
      headers: {
        Authorization: `Bearer ${NANGO_CONFIG.secretKey}`,
        'Content-Type': 'application/json',
        'Provider-Config-Key': 'confluence',
        'Connection-Id': connectionId,
      },
    });

    if (!spacesResponse.ok) {
      return [];
    }

    const spacesData = await spacesResponse.json().catch(() => null);
    if (!spacesData || !Array.isArray(spacesData.results)) {
      return [];
    }

    return spacesData.results.map((space: any) => ({
      id: space.key,
      type: 'space',
      title: space.name || space.key,
      url: space._links?.webui,
    }));
  } catch {
    return [];
  }
}

async function getCodaResources(connectionId: string): Promise<WorkspaceResource[]> {
  const url = new URL('/proxy/v1/docs', NANGO_CONFIG.host);
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${NANGO_CONFIG.secretKey}`,
      'Content-Type': 'application/json',
      'Provider-Config-Key': 'coda',
      'Connection-Id': connectionId,
    },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json().catch(() => null);
  if (!data?.items) {
    return [];
  }

  return data.items.map((doc: any) => ({
    id: doc.id,
    type: 'doc',
    title: doc.name || 'Untitled',
    url: doc.browserLink,
  }));
}

export async function listResources(provider: string, connectionId: string): Promise<WorkspaceResource[]> {
  switch (provider) {
    case 'notion':
      return getNotionResources(connectionId);
    case 'confluence':
      return getConfluenceResources(connectionId);
    case 'coda':
      return getCodaResources(connectionId);
    default:
      return [];
  }
}
