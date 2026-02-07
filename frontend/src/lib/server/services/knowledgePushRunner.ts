import type { SupabaseClient } from '@supabase/supabase-js';
import { type PlanResult, type PlannedPage } from './knowledgePushPlanner';
import { getWorkspaceProvider } from '../workspaces/workspaceFactory';
import type { WorkspaceInfo, WorkspaceContent } from '../workspaces/base';
import { marked } from 'marked';

type Provider = 'notion' | 'confluence';

type PushParams = {
  supabase: SupabaseClient;
  userId: string;
  provider: Provider;
  plan: PlanResult;
  rootResourceId: string; // Notion: parent page/database. Confluence: cloudId:spaceId
  rootMetadata?: Record<string, unknown>; // e.g., { spaceId, spaceKey, cloudId, type }
  connectionId?: string | null; // optional override
  /** Existing root page resource ID to update instead of creating a new one (e.g., diff single-page report) */
  existingRootResourceId?: string | null;
};

type PageResult = {
  key: string;
  title: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  resourceId?: string | null;
  parentResourceId?: string | null;
  error?: string;
};

type DbRow = {
  entity_type: string;
  aku_id: string | null;
  audience: string | null;
  resource_id: string | null;
  parent_resource_id: string | null;
  content_hash: string | null;
  title: string | null;
};

async function getProviderConnectionId(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
  desiredConnectionId?: string | null
): Promise<string | null> {
  const base = () =>
    supabase
      .from('oauth_connections')
      .select('connection_id, status, provider')
      .eq('user_id', userId)
      .eq('provider', provider);

  if (desiredConnectionId) {
    const { data, error } = await base().eq('connection_id', desiredConnectionId).maybeSingle();
    if (!error && data?.connection_id) return data.connection_id;
  }

  const { data: active } = await base().eq('status', 'active').limit(1).maybeSingle();
  if (active?.connection_id) return active.connection_id;

  const { data: fallback } = await base().order('created_at', { ascending: false }).limit(1).maybeSingle();
  return fallback?.connection_id ?? null;
}

function pageKey(page: PlannedPage) {
  return `${page.type}:${page.akuId || 'root'}:${page.audience || ''}`;
}

function parseConfluenceResourceId(resourceId?: string | null): { cloudId?: string | null; id?: string | null } {
  if (!resourceId) return { cloudId: null, id: null };
  const [cloudId, ...rest] = resourceId.split(':');
  return { cloudId: cloudId || null, id: rest.length ? rest.join(':') : null };
}

function buildWorkspaceInfo(
  provider: Provider,
  createNew: boolean,
  resourceId: string | null,
  parentResourceId: string,
  rootMetadata?: Record<string, unknown>,
  pageType?: 'system' | 'aku' | 'audience',
  createAtSpaceRoot?: boolean
): WorkspaceInfo | null {
  if (provider === 'notion') {
    if (createNew) {
      return {
        provider,
        resourceId: parentResourceId, // parent page/database
        metadata: rootMetadata,
      };
    }
    if (!resourceId) return null;
    return { provider, resourceId, metadata: rootMetadata };
  }

  // confluence
  if (provider === 'confluence') {
    if (createNew) {
      // For Confluence we require cloudId and spaceId. parentResourceId is:
      // - System page: typically a space id (or cloudId:spaceId). We create at space root.
      // - Child pages: parentResourceId should be the system page id (cloudId:pageId).
      const parsedParent = parseConfluenceResourceId(parentResourceId);
      // Handle configs that pass only the cloudId as kb_resource_id (no colon)
      const cloudIdCandidate =
        (rootMetadata?.cloudId as string) ||
        parsedParent.cloudId ||
        (parsedParent.id && pageType === 'system' ? parsedParent.id : null);
      const cloudId = cloudIdCandidate || null;

      const spaceId =
        pageType === 'system'
          ? (rootMetadata?.spaceId as string) ||
            (rootMetadata?.spaceResourceId as string) ||
            parsedParent.id ||
            parentResourceId
          : (rootMetadata?.spaceId as string) || (rootMetadata?.spaceResourceId as string);

      const parentPageId =
        pageType === 'system'
          ? undefined
          : parsedParent.id || (rootMetadata?.parentId as string | undefined);

      console.debug('[KB Push][confluence] buildWorkspaceInfo', {
        createNew,
        pageType,
        parentResourceId,
        parsedParent,
        cloudId,
        spaceId,
        parentPageId,
        createAtSpaceRoot,
      });

      if (!cloudId) {
        console.error('[KB Push] Confluence create: missing cloudId (set communication.kb_root_metadata.cloudId)');
        return null;
      }
      // Common misconfig: kb_resource_id set to cloudId only; spaceId ends up identical to cloudId and Confluence returns 404.
      const normalizedSpaceId =
        spaceId ||
        (rootMetadata?.spaceId as string) ||
        (rootMetadata?.spaceResourceId as string) ||
        (rootMetadata?.spaceKey as string) ||
        null;

      if (!normalizedSpaceId) {
        console.error(
          '[KB Push] Confluence create: missing spaceId (set communication.kb_root_metadata.spaceId or pass cloudId:spaceId as kb_resource_id)'
        );
        return null;
      }

      return {
        provider,
        resourceId: `${cloudId}:${normalizedSpaceId}`, // for create we address the space; parent handled via metadata.parentId
        metadata: {
          ...rootMetadata,
          cloudId,
          spaceId: normalizedSpaceId,
          parentId: pageType === 'system' ? undefined : parentPageId,
        },
      };
    }
    if (!resourceId) return null;
    return { provider, resourceId, metadata: rootMetadata };
  }

  return null;
}

async function upsertKnowledgePush(
  supabase: SupabaseClient,
  userId: string,
  provider: Provider,
  page: PlannedPage,
  resourceId: string,
  parentResourceId: string,
  contentHash: string
) {
  // System pages are tracked via existingRootResourceId; skip DB upsert to avoid FK constraints on aku_id
  if (page.type === 'system') return;
  if (!page.akuId) {
    console.warn('[KB Push] missing aku_id, skipping persistence', { page });
    return;
  }
  if (page.type === 'audience' && !page.audience) {
    console.warn('[KB Push] missing audience, skipping persistence', { page });
    return;
  }

  const now = new Date().toISOString();
  const payload = {
    user_id: userId,
    provider,
    entity_type: page.type,
    aku_id: page.akuId,
    audience: page.audience ?? '',
    title: page.title,
    resource_id: resourceId,
    parent_resource_id: parentResourceId,
    content_hash: contentHash,
    updated_at: now,
  };

  const { error } = await supabase.from('knowledge_pushes').upsert(payload, {
    onConflict: 'user_id,provider,entity_type,aku_id,audience',
  });
  if (error) {
    console.error('[KB Push] upsert error', { error, payload });
  }
}

export async function runKnowledgePush(params: PushParams): Promise<{ results: PageResult[]; rootPageId: string | null }> {
  const {
    supabase,
    userId,
    provider,
    plan,
    rootResourceId,
    rootMetadata,
    connectionId: desiredConnectionId,
    existingRootResourceId,
  } = params;
  const providerImpl = getWorkspaceProvider(provider);
  if (!providerImpl) throw new Error(`Unsupported provider ${provider}`);

  console.log(`[KB Push] start`, {
    userId,
    provider,
    pages: plan.pages.length,
    rootResourceId,
  });

  const connectionId = await getProviderConnectionId(supabase, userId, provider, desiredConnectionId);
  if (!connectionId) throw new Error(`No active connection for ${provider}`);

  const { data: existingRows } = await supabase
    .from('knowledge_pushes')
    .select('entity_type, aku_id, audience, resource_id, parent_resource_id, content_hash, title')
    .eq('user_id', userId)
    .eq('provider', provider);
  const existingMap = new Map<string, DbRow>();
  (existingRows || []).forEach((row) => {
    const key = `${row.entity_type}:${row.aku_id || 'root'}:${row.audience || ''}`;
    existingMap.set(key, row);
  });
  if (existingRootResourceId) {
    existingMap.set('system:root:', {
      entity_type: 'system',
      aku_id: 'root',
      audience: '',
      resource_id: existingRootResourceId,
      parent_resource_id: rootResourceId,
      content_hash: null,
      title: null,
    });
  }

  const results: PageResult[] = [];
  const producedResourceIds = new Map<string, string>(); // page.key -> resourceId
  let rootPageId: string | null = existingRootResourceId || null;
  const parentLookup = (page: PlannedPage): string | null => {
    if (page.parentKey === null) return rootResourceId;
    return producedResourceIds.get(page.parentKey) ?? null;
  };

  for (const page of plan.pages) {
    const key = pageKey(page);
    const prior = existingMap.get(key);
    const parentResourceId = parentLookup(page);

    if (!parentResourceId) {
      console.warn(`[KB Push] missing parent`, { key: page.key, title: page.title });
      results.push({ key, title: page.title, status: 'failed', error: 'Missing parent resource' });
      continue;
    }

    const unchanged = prior?.content_hash === page.hash;
    let forceCreate = false;
    if (unchanged && prior?.resource_id) {
      // Parent may have been recreated (e.g. system page deleted and re-exported); children must be recreated under the new parent
      if (parentResourceId !== prior.parent_resource_id) {
        forceCreate = true;
        console.log(`[KB Push] parent changed, will recreate`, { key: page.key, title: page.title });
      }
      if (!forceCreate && typeof providerImpl.resourceExists === 'function') {
        const existsInfo: WorkspaceInfo = {
          provider,
          resourceId: prior.resource_id,
          metadata: rootMetadata,
        };
        const exists = await providerImpl.resourceExists(existsInfo, connectionId);
        if (!exists) {
          forceCreate = true;
          console.log(`[KB Push] resource no longer exists, will recreate`, { key: page.key, title: page.title });
        }
      }
      if (!forceCreate) {
        producedResourceIds.set(page.key, prior.resource_id);
        console.log(`[KB Push] skip (unchanged)`, { key: page.key, title: page.title });
        results.push({
          key,
          title: page.title,
          status: 'skipped',
          resourceId: prior.resource_id,
          parentResourceId,
        });
        continue;
      }
    }

    let createNew = !prior?.resource_id || forceCreate;
    // When creating the system page under Confluence, if the selected root page was deleted, create at space root instead
    let createAtSpaceRoot = false;
    if (
      page.parentKey === null &&
      provider === 'confluence' &&
      createNew &&
      typeof providerImpl.resourceExists === 'function'
    ) {
      const rootExistsInfo: WorkspaceInfo = {
        provider,
        resourceId: parentResourceId,
        metadata: rootMetadata,
      };
      const rootExists = await providerImpl.resourceExists(rootExistsInfo, connectionId);
      if (!rootExists) {
        createAtSpaceRoot = true;
        console.log(`[KB Push] root page no longer exists, creating System Knowledge at space root`);
      }
    }
    // If we plan to update an existing page, verify it still exists; otherwise fall back to create.
    if (!createNew && typeof providerImpl.resourceExists === 'function') {
      const existsInfo: WorkspaceInfo = {
        provider,
        resourceId: prior?.resource_id || '',
        metadata: rootMetadata,
      };
      const exists = await providerImpl.resourceExists(existsInfo, connectionId);
      if (!exists) {
        createNew = true;
        console.log(`[KB Push] target missing, will recreate`, { key: page.key, title: page.title });
      }
    }

    const workspaceInfo = buildWorkspaceInfo(
      provider,
      createNew,
      prior?.resource_id || null,
      parentResourceId,
      rootMetadata,
      page.type,
      createAtSpaceRoot
    );
    if (!workspaceInfo) {
      console.warn(`[KB Push] workspace info missing`, { key: page.key, title: page.title });
      results.push({ key, title: page.title, status: 'failed', error: 'Workspace info missing' });
      continue;
    }

    const content: WorkspaceContent = {
      title: page.title,
      markdown: page.markdown,
      html: marked.parse(page.markdown) as string,
    };

    const pushed = await providerImpl.pushContent(workspaceInfo, content, connectionId, createNew);
    if (!pushed || !pushed.resourceId) {
      console.error(`[KB Push] provider push failed`, { key: page.key, title: page.title });
      results.push({ key, title: page.title, status: 'failed', error: 'Provider push failed' });
      continue;
    }

    producedResourceIds.set(page.key, pushed.resourceId);
    if (page.parentKey === null) {
      rootPageId = pushed.resourceId;
    }
    if (page.type !== 'system') {
      await upsertKnowledgePush(supabase, userId, provider, page, pushed.resourceId, parentResourceId, page.hash);
    }

    console.log(`[KB Push] ${createNew ? 'created' : 'updated'}`, {
      key: page.key,
      title: page.title,
      resourceId: pushed.resourceId,
      parentResourceId,
    });

    results.push({
      key,
      title: page.title,
      status: createNew ? 'created' : 'updated',
      resourceId: pushed.resourceId,
      parentResourceId,
    });
  }

  return { results, rootPageId };
}
