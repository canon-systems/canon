import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeRepository } from './analyzeRepository';

export type SourceExtractionTarget = {
  sourceId: string;
  repoUrl: string;
  branch: string;
  fallbackName?: string;
};

export type SourceCodeArtifacts = {
  codeFiles: Array<{ path: string; content: string }>;
  manifestFiles: Array<{ path: string; content: string }>;
};

type WorkspaceSourceRow = {
  id: string;
  repo_url?: string | null;
  external_url?: string | null;
  default_branch?: string | null;
  scope?: Record<string, unknown> | null;
  [key: string]: unknown;
};

const SUPPORTED_EXTENSIONS = new Set(['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'cs', 'php', 'rb']);

function isManifestPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith('package.json') ||
    lower.endsWith('requirements.txt') ||
    lower.endsWith('pipfile') ||
    lower.endsWith('pyproject.toml') ||
    lower.endsWith('go.mod') ||
    lower.endsWith('cargo.toml') ||
    lower.endsWith('pom.xml') ||
    lower.endsWith('build.gradle') ||
    lower.endsWith('build.gradle.kts') ||
    lower.endsWith('composer.json') ||
    lower.endsWith('gemfile') ||
    lower.endsWith('gemfile.lock') ||
    lower.endsWith('.csproj') ||
    lower.endsWith('package.swift');
}

function slugForRepo(repoUrl: string, fallback: string): string {
  try {
    const cleaned = repoUrl.replace(/\.git$/, '');
    const parts = cleaned.split('/').filter(Boolean);
    const owner = parts[parts.length - 2];
    const name = parts[parts.length - 1];
    return owner && name ? `${owner}/${name}` : fallback;
  } catch {
    return fallback;
  }
}

export async function buildExtractionTargetsFromSourceIds(
  supabase: SupabaseClient,
  userId: string,
  sourceIds: string[]
): Promise<SourceExtractionTarget[]> {
  if (sourceIds.length === 0) return [];
  const { data } = await supabase
    .from('workspace_sources')
    .select('id, repo_url, external_url, default_branch, scope')
    .in('id', sourceIds)
    .eq('user_id', userId);

  let rows = (data || []) as WorkspaceSourceRow[];
  if (rows.length === 0) {
    // Some background execution paths have shown user-scoped reads returning no rows; retry by id only.
    const retry = await supabase
      .from('workspace_sources')
      .select('id, repo_url, external_url, default_branch, scope')
      .in('id', sourceIds);
    rows = (retry.data || []) as WorkspaceSourceRow[];
    console.warn(
      `[sourceCodeArtifacts] user-scoped source lookup returned 0 rows; id-only retry found ${rows.length} row(s)`
    );
  }

  const targets: SourceExtractionTarget[] = [];
  for (const row of rows) {
    let scope: Record<string, unknown> = {};
    if (typeof row.scope === 'string') {
      try {
        scope = JSON.parse(row.scope) as Record<string, unknown>;
      } catch {
        scope = {};
      }
    } else if (row.scope && typeof row.scope === 'object') {
      scope = row.scope as Record<string, unknown>;
    }
    const repoFromScope = typeof scope.repo === 'string' ? scope.repo : null;
    const repoUrl = row.repo_url || row.external_url || (repoFromScope ? (repoFromScope.startsWith('http') ? repoFromScope : `https://github.com/${repoFromScope}`) : null);
    if (!repoUrl) {
      console.warn(
        `[sourceCodeArtifacts] skipping source ${row.id}: no repo URL found (repo_url/external_url/scope.repo all empty)`
      );
      continue;
    }
    const branchFromScope = typeof scope.branch === 'string' ? scope.branch : null;
    const branch = branchFromScope || row.default_branch || 'main';
    targets.push({
      sourceId: row.id,
      repoUrl,
      branch,
      fallbackName: row.id,
    });
  }
  console.log(`[sourceCodeArtifacts] Built ${targets.length} extraction target(s) from ${sourceIds.length} source id(s)`);
  return targets;
}

export async function fetchSourceCodeArtifacts(
  supabase: SupabaseClient,
  userId: string,
  targets: SourceExtractionTarget[],
  namespace: 'sourceId' | 'repoSlug' = 'sourceId'
): Promise<SourceCodeArtifacts> {
  const codeFiles: Array<{ path: string; content: string }> = [];
  const manifestFiles: Array<{ path: string; content: string }> = [];

  for (const target of targets) {
    const analysis = await analyzeRepository({
      supabase,
      userId,
      repoUrl: target.repoUrl,
      branch: target.branch,
      useZipFetch: true,
    });
    if (!analysis.success || !analysis.rawFiles) continue;

    const basePrefix = namespace === 'sourceId'
      ? target.sourceId
      : slugForRepo(target.repoUrl, target.fallbackName || target.sourceId);

    for (const file of analysis.rawFiles) {
      const ext = file.path.split('.').pop()?.toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext || '')) {
        codeFiles.push({
          path: `${basePrefix}/${file.path}`,
          content: file.content,
        });
      }
      if (isManifestPath(file.path)) {
        manifestFiles.push({
          path: `${basePrefix}/${file.path}`,
          content: file.content,
        });
      }
    }
  }

  return { codeFiles, manifestFiles };
}
