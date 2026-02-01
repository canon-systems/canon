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
      const { cloudId, id } = parseConfluenceResourceId(parentResourceId);
      if (!cloudId || !id) return null;
      // When root page was deleted, create at space root (parentId omitted); need spaceId from metadata
      const spaceId = createAtSpaceRoot
        ? (rootMetadata?.spaceId as string)
        : ((rootMetadata?.spaceId as string) || id);
      if (!spaceId) return null;
      const parentPageId = createAtSpaceRoot ? undefined : (id || undefined);
      return {
        provider,
        resourceId: `${cloudId}:${spaceId}`,
        metadata: {
          ...rootMetadata,
          spaceId,
          parentId: parentPageId,
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
  // We only persist AKU and audience pages; system is an immutable root and has no aku_id/audience
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

export async function runKnowledgePush(params: PushParams): Promise<{ results: PageResult[] }> {
  const { supabase, userId, provider, plan, rootResourceId, rootMetadata, connectionId: desiredConnectionId } = params;
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

  const results: PageResult[] = [];
  const producedResourceIds = new Map<string, string>(); // page.key -> resourceId
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

    const createNew = !prior?.resource_id || forceCreate;
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

  return { results };
}
