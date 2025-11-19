import type { SupabaseClient } from '@supabase/supabase-js';
import type { DetectionResult } from './detectTools';
import type { ArchitectureDiagramVersion } from './types';
import { compareDetectionResults, generateChangeSummary } from './detectChanges';

/**
 * Create a new version of an architecture diagram
 */
export async function createDiagramVersion(
  supabase: SupabaseClient,
  diagramId: string,
  detectionResult: DetectionResult,
  diagramMarkdown: string | null,
  codeSnapshot: {
    commitSha?: string;
    fileShas?: Record<string, string | null>;
    createdAt?: string;
  } | null,
  commitSha: string | null,
  previousVersion?: ArchitectureDiagramVersion | null
): Promise<ArchitectureDiagramVersion | null> {
  // Get current version number
  const { data: latestVersion } = await supabase
    .from('architecture_diagram_versions')
    .select('version_number')
    .eq('diagram_id', diagramId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();

  const nextVersionNumber = latestVersion ? (latestVersion.version_number as number) + 1 : 1;

  // Compare with previous version if available
  let changeSummary: string | null = null;
  let toolsAdded: string[] = [];
  let toolsRemoved: string[] = [];
  let connectionsAdded: Array<{ from: string; to: string; label: string }> = [];
  let connectionsRemoved: Array<{ from: string; to: string; label: string }> = [];

  if (previousVersion) {
    const comparison = compareDetectionResults(
      previousVersion.detection_result as DetectionResult,
      detectionResult
    );
    changeSummary = generateChangeSummary(comparison);
    toolsAdded = comparison.toolsAdded;
    toolsRemoved = comparison.toolsRemoved;
    connectionsAdded = comparison.connectionsAdded;
    connectionsRemoved = comparison.connectionsRemoved;
  } else {
    // First version - all tools are "added"
    toolsAdded = detectionResult.tools.map((t) => t.name);
    changeSummary = `Initial version with ${toolsAdded.length} tool(s): ${toolsAdded.join(', ')}`;
  }

  const { error, data } = await supabase
    .from('architecture_diagram_versions')
    .insert({
      diagram_id: diagramId,
      detection_result: detectionResult,
      diagram_markdown: diagramMarkdown,
      code_snapshot: codeSnapshot,
      commit_sha: commitSha,
      version_number: nextVersionNumber,
      change_summary: changeSummary,
      tools_added: toolsAdded,
      tools_removed: toolsRemoved,
      connections_added: connectionsAdded,
      connections_removed: connectionsRemoved,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating diagram version:', error);
    return null;
  }

  return data as ArchitectureDiagramVersion;
}

/**
 * Get all versions for a diagram
 */
export async function getDiagramVersions(
  supabase: SupabaseClient,
  diagramId: string
): Promise<ArchitectureDiagramVersion[]> {
  const { error, data } = await supabase
    .from('architecture_diagram_versions')
    .select('*')
    .eq('diagram_id', diagramId)
    .order('version_number', { ascending: false });

  if (error) {
    console.error('Error fetching diagram versions:', error);
    return [];
  }

  return (data || []) as ArchitectureDiagramVersion[];
}

/**
 * Get a specific version by ID
 */
export async function getDiagramVersion(
  supabase: SupabaseClient,
  versionId: string
): Promise<ArchitectureDiagramVersion | null> {
  const { error, data } = await supabase
    .from('architecture_diagram_versions')
    .select('*')
    .eq('id', versionId)
    .single();

  if (error) {
    console.error('Error fetching diagram version:', error);
    return null;
  }

  return data as ArchitectureDiagramVersion;
}

/**
 * Compare two versions
 */
export function compareVersions(
  version1: ArchitectureDiagramVersion,
  version2: ArchitectureDiagramVersion
): {
  toolsAdded: string[];
  toolsRemoved: string[];
  connectionsAdded: Array<{ from: string; to: string; label: string }>;
  connectionsRemoved: Array<{ from: string; to: string; label: string }>;
  summary: string;
} {
  const result1 = version1.detection_result as DetectionResult;
  const result2 = version2.detection_result as DetectionResult;

  const comparison = compareDetectionResults(result1, result2);
  const summary = generateChangeSummary(comparison);

  return {
    ...comparison,
    summary,
  };
}

/**
 * Get version history with growth metrics
 */
export async function getVersionHistory(
  supabase: SupabaseClient,
  diagramId: string
): Promise<{
  versions: ArchitectureDiagramVersion[];
  metrics: {
    totalVersions: number;
    totalTools: number;
    toolsAddedOverTime: number;
    toolsRemovedOverTime: number;
    firstVersionDate: string | null;
    lastVersionDate: string | null;
  };
}> {
  const versions = await getDiagramVersions(supabase, diagramId);

  if (versions.length === 0) {
    return {
      versions: [],
      metrics: {
        totalVersions: 0,
        totalTools: 0,
        toolsAddedOverTime: 0,
        toolsRemovedOverTime: 0,
        firstVersionDate: null,
        lastVersionDate: null,
      },
    };
  }

  const latestVersion = versions[0];
  const totalTools = (latestVersion.detection_result as DetectionResult).tools.length;

  let toolsAddedOverTime = 0;
  let toolsRemovedOverTime = 0;

  versions.forEach((version) => {
    toolsAddedOverTime += version.tools_added.length;
    toolsRemovedOverTime += version.tools_removed.length;
  });

  const firstVersionDate = versions[versions.length - 1]?.created_at || null;
  const lastVersionDate = versions[0]?.created_at || null;

  return {
    versions,
    metrics: {
      totalVersions: versions.length,
      totalTools,
      toolsAddedOverTime,
      toolsRemovedOverTime,
      firstVersionDate,
      lastVersionDate,
    },
  };
}


