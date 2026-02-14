import type { SupabaseClient } from '@supabase/supabase-js';

type WorkspaceSourceRow = {
  id: string;
  provider: string;
  scope: Record<string, unknown> | null;
};

type AkuForRefSync = {
  id: string;
  source_ids: string[];
  scope_refs: string[];
};

type AkuEvidenceRefRow = {
  id: string;
  aku_id: string;
  provider: string;
  entity_type: string;
  entity_id: string;
  repo_full_name: string | null;
};

function extractIssueKeys(scopeRefs: string[]): string[] {
  const keys = new Set<string>();
  for (const ref of scopeRefs) {
    if (typeof ref !== 'string') continue;
    const match = ref.trim().toUpperCase().match(/[A-Z][A-Z0-9]+-\d+/g);
    if (!match) continue;
    for (const key of match) keys.add(key);
  }
  return Array.from(keys);
}

function buildRepoRef(scope: Record<string, unknown> | null): string | null {
  if (!scope || typeof scope !== 'object') return null;
  const repo = scope.repo;
  if (typeof repo === 'string' && repo.trim().length > 0) return repo.trim();
  return null;
}

export async function syncAkuEvidenceRefsForAkus(params: {
  supabase: SupabaseClient;
  userId: string;
  akus: AkuForRefSync[];
}): Promise<void> {
  const { supabase, userId, akus } = params;
  if (akus.length === 0) return;

  const sourceIds = Array.from(new Set(akus.flatMap((aku) => aku.source_ids)));
  const { data: sourceRows } = sourceIds.length
    ? await supabase
        .from('workspace_sources')
        .select('id, provider, scope')
        .eq('user_id', userId)
        .in('id', sourceIds)
    : { data: [] as WorkspaceSourceRow[] };

  const sourceById = new Map<string, WorkspaceSourceRow>();
  for (const row of (sourceRows || []) as WorkspaceSourceRow[]) {
    sourceById.set(row.id, row);
  }

  const inserts: Array<{
    user_id: string;
    aku_id: string;
    source_id: string | null;
    provider: string;
    entity_type: string;
    entity_id: string;
    repo_full_name: string | null;
  }> = [];

  for (const aku of akus) {
    const issueKeys = extractIssueKeys(Array.isArray(aku.scope_refs) ? aku.scope_refs : []);

    for (const sourceId of Array.isArray(aku.source_ids) ? aku.source_ids : []) {
      const source = sourceById.get(sourceId);
      if (!source) continue;
      const provider = String(source.provider || '').toLowerCase();

      if (provider === 'github') {
        const repo = buildRepoRef(source.scope);
        if (repo) {
          inserts.push({
            user_id: userId,
            aku_id: aku.id,
            source_id: sourceId,
            provider: 'github',
            entity_type: 'repo',
            entity_id: repo,
            repo_full_name: repo,
          });
        }
      }

      if (provider === 'jira') {
        for (const issueKey of issueKeys) {
          inserts.push({
            user_id: userId,
            aku_id: aku.id,
            source_id: sourceId,
            provider: 'jira',
            entity_type: 'ticket',
            entity_id: issueKey,
            repo_full_name: null,
          });
        }
      }
    }
  }

  const akuIds = akus.map((aku) => aku.id);
  await supabase
    .from('aku_evidence_refs')
    .delete()
    .eq('user_id', userId)
    .in('aku_id', akuIds);

  if (inserts.length === 0) return;

  await supabase
    .from('aku_evidence_refs')
    .upsert(inserts, { onConflict: 'aku_id,provider,entity_type,entity_id' });
}

export async function loadAkuEvidenceRefMap(params: {
  supabase: SupabaseClient;
  userId: string;
  sourceIds: string[];
}): Promise<Map<string, Set<string>>> {
  const { supabase, userId, sourceIds } = params;
  let query = supabase
    .from('aku_evidence_refs')
    .select('id, aku_id, provider, entity_type, entity_id, repo_full_name')
    .eq('user_id', userId);

  if (sourceIds.length > 0) {
    query = query.in('source_id', sourceIds);
  }

  const { data } = (await query) as { data: AkuEvidenceRefRow[] | null };
  const map = new Map<string, Set<string>>();

  for (const row of data || []) {
    const key = `${row.provider}:${row.entity_type}:${row.entity_id}`;
    const current = map.get(key) ?? new Set<string>();
    current.add(row.aku_id);
    map.set(key, current);

    if (row.repo_full_name && row.provider === 'github' && row.entity_type === 'repo') {
      const repoKey = `github:repo:${row.repo_full_name}`;
      const repoSet = map.get(repoKey) ?? new Set<string>();
      repoSet.add(row.aku_id);
      map.set(repoKey, repoSet);
    }
  }

  return map;
}

export function canonicalEventEntityType(eventKind: string): 'ticket' | 'pr' | 'commit' | null {
  switch (eventKind) {
    case 'ticket_moved':
    case 'ticket_completed':
    case 'ticket_regressed':
    case 'ticket_created':
      return 'ticket';
    case 'pr_opened':
    case 'pr_merged':
    case 'pr_closed':
      return 'pr';
    case 'commit':
      return 'commit';
    default:
      return null;
  }
}
