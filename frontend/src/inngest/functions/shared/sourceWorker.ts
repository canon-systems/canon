import type { SupabaseClient } from '@supabase/supabase-js';

type SourceWorkerEventData = {
  sourceId?: string;
  sourceName?: string;
  userId?: string;
};

export function parseSourceWorkerEvent(data: SourceWorkerEventData): {
  sourceId: string;
  userId: string;
  sourceNameFromEvent: string;
} {
  const sourceId = typeof data.sourceId === 'string' ? data.sourceId : '';
  const userId = typeof data.userId === 'string' ? data.userId : '';
  const sourceNameFromEvent = typeof data.sourceName === 'string' ? data.sourceName.trim() : '';

  if (!sourceId || !userId) {
    throw new Error('Missing sourceId or userId');
  }

  return { sourceId, userId, sourceNameFromEvent };
}

export function parseNonEmptyStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

export function resolveSourceDisplayName(params: {
  sourceId: string;
  persistedName?: string | null;
  sourceNameFromEvent?: string;
}): string {
  const persistedName = typeof params.persistedName === 'string' ? params.persistedName.trim() : '';
  if (persistedName) return persistedName;
  const eventName = typeof params.sourceNameFromEvent === 'string' ? params.sourceNameFromEvent.trim() : '';
  if (eventName) return eventName;
  return params.sourceId;
}

export async function loadWorkspaceSourceForUser<T>(params: {
  supabase: SupabaseClient;
  sourceId: string;
  userId: string;
  select: string;
}): Promise<{ row: T | null; errorMessage: string | null }> {
  const { supabase, sourceId, userId, select } = params;

  const { data, error } = await supabase
    .from('workspace_sources')
    .select(select)
    .eq('id', sourceId)
    .eq('user_id', userId)
    .maybeSingle();

  return {
    row: (data as T | null) || null,
    errorMessage: error?.message || null,
  };
}

