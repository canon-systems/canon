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
  void connectionId;
  return [];
}

async function getCodaResources(connectionId: string): Promise<WorkspaceResource[]> {
  void connectionId;
  return [];
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
