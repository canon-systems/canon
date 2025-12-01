import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ArchitectureDiagram,
  ArchitectureDiagramFile,
  CreateDiagramInput,
  UpdateDiagramInput,
} from './types';
import { getUserOctokit } from '../github/getUserOctokit';

/**
 * Save a new architecture diagram
 */
export async function saveArchitectureDiagram(
  supabase: SupabaseClient,
  input: CreateDiagramInput
): Promise<ArchitectureDiagram | null> {
  const { error, data } = await supabase
    .from('architecture_diagrams')
    .insert({
      user_id: input.user_id,
      repo_provider: input.repo_provider,
      repo_url: input.repo_url,
      branch: input.branch,
      subdir: input.subdir || null,
      detection_result: input.detection_result,
      diagram_markdown: input.diagram_markdown,
      code_snapshot: input.code_snapshot,
      last_commit_sha: input.last_commit_sha || null,
      title: input.title,
      description: input.description || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving architecture diagram:', error);
    return null;
  }

  return data as ArchitectureDiagram;
}

/**
 * Get an architecture diagram by ID
 */
export async function getArchitectureDiagram(
  supabase: SupabaseClient,
  diagramId: string
): Promise<ArchitectureDiagram | null> {
  const { error, data } = await supabase
    .from('architecture_diagrams')
    .select('*')
    .eq('id', diagramId)
    .single();

  if (error) {
    console.error('Error fetching architecture diagram:', error);
    return null;
  }

  return data as ArchitectureDiagram;
}

/**
 * Get architecture diagrams by repo/branch/subdir (for checking if exists)
 */
export async function getArchitectureDiagramsByRepo(
  supabase: SupabaseClient,
  userId: string,
  repoUrl: string,
  branch: string,
  subdir?: string | null
): Promise<ArchitectureDiagram[]> {
  let query = supabase
    .from('architecture_diagrams')
    .select('*')
    .eq('user_id', userId)
    .eq('repo_url', repoUrl)
    .eq('branch', branch);

  if (subdir) {
    query = query.eq('subdir', subdir);
  } else {
    query = query.is('subdir', null);
  }

  const { error, data } = await query;

  if (error) {
    console.error('Error fetching architecture diagrams by repo:', error);
    return [];
  }

  return (data || []) as ArchitectureDiagram[];
}

/**
 * List all architecture diagrams for a user
 */
export async function listUserDiagrams(
  supabase: SupabaseClient,
  userId: string
): Promise<ArchitectureDiagram[]> {
  const { error, data } = await supabase
    .from('architecture_diagrams')
    .select('*')
    .eq('user_id', userId)
    .order('last_updated_at', { ascending: false });

  if (error) {
    console.error('Error listing user diagrams:', error);
    return [];
  }

  return (data || []) as ArchitectureDiagram[];
}

/**
 * Update an architecture diagram
 */
export async function updateArchitectureDiagram(
  supabase: SupabaseClient,
  diagramId: string,
  input: UpdateDiagramInput
): Promise<ArchitectureDiagram | null> {
  const updateData: any = {
    last_updated_at: new Date().toISOString(),
  };

  if (input.detection_result !== undefined) {
    updateData.detection_result = input.detection_result;
  }
  if (input.diagram_markdown !== undefined) {
    updateData.diagram_markdown = input.diagram_markdown;
  }
  if (input.code_snapshot !== undefined) {
    updateData.code_snapshot = input.code_snapshot;
  }
  if (input.last_commit_sha !== undefined) {
    updateData.last_commit_sha = input.last_commit_sha;
  }
  if (input.title !== undefined) {
    updateData.title = input.title;
  }
  if (input.description !== undefined) {
    updateData.description = input.description;
  }
  if (input.auto_update_enabled !== undefined) {
    updateData.auto_update_enabled = input.auto_update_enabled;
  }
  if (input.check_interval_hours !== undefined) {
    updateData.check_interval_hours = input.check_interval_hours;
  }

  const { error, data } = await supabase
    .from('architecture_diagrams')
    .update(updateData)
    .eq('id', diagramId)
    .select()
    .single();

  if (error) {
    console.error('Error updating architecture diagram:', error);
    return null;
  }

  return data as ArchitectureDiagram;
}

/**
 * Delete an architecture diagram
 */
export async function deleteArchitectureDiagram(
  supabase: SupabaseClient,
  diagramId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('architecture_diagrams')
    .delete()
    .eq('id', diagramId);

  if (error) {
    console.error('Error deleting architecture diagram:', error);
    return false;
  }

  return true;
}

/**
 * Track files for an architecture diagram (similar to trackSubmissionFiles)
 */
export async function trackDiagramFiles(
  supabase: SupabaseClient,
  diagramId: string,
  repoUrl: string,
  branch: string,
  codeSnapshot: {
    commitSha?: string;
    fileShas?: Record<string, string | null>;
  },
  userId?: string | null
): Promise<void> {
  // Parse repo URL
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\.git|$|\/)/);
  if (!match) {
    console.warn(`trackDiagramFiles: Could not parse repo URL: ${repoUrl}`);
    return;
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '');
  const commitSha = codeSnapshot.commitSha || branch;
  const fileShas = codeSnapshot.fileShas || {};

  if (Object.keys(fileShas).length === 0) {
    console.warn(`trackDiagramFiles: No file SHAs provided for diagram ${diagramId}`);
    return;
  }

  const octokit = await getUserOctokit(supabase, userId || null);

  // Delete existing files for this diagram
  await supabase
    .from('architecture_diagram_files')
    .delete()
    .eq('diagram_id', diagramId);

  // Fetch file metadata and insert
  const rowsToInsert: ArchitectureDiagramFile[] = [];

  for (const [filePath, fileHash] of Object.entries(fileShas)) {
    if (!fileHash) continue;

    let sizeBytes: number | null = null;

    // Try to get file size from GitHub
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: commitSha,
      });

      if (fileData && !Array.isArray(fileData) && fileData.type === 'file' && 'size' in fileData) {
        sizeBytes = fileData.size || null;
      }
    } catch {
      // Fallback: try blob API
      try {
        const { data: blobData } = await octokit.git.getBlob({
          owner,
          repo,
          file_sha: fileHash,
        });
        if (blobData && 'size' in blobData) {
          sizeBytes = blobData.size || null;
        }
      } catch {
        // Skip if both fail
      }
    }

    const fileType = guessFileTypeFromPath(filePath);

    rowsToInsert.push({
      diagram_id: diagramId,
      file_path: filePath,
      file_hash: fileHash,
      size_bytes: sizeBytes,
      file_type: fileType,
    });
  }

  if (rowsToInsert.length > 0) {
    const { error } = await supabase
      .from('architecture_diagram_files')
      .insert(rowsToInsert);

    if (error) {
      console.error('Error inserting diagram files:', error);
    }
  }
}

/**
 * Helper: Infer file type from path
 */
function guessFileTypeFromPath(path: string): string {
  const lastDot = path.lastIndexOf('.');
  if (lastDot === -1) return 'unknown';
  const ext = path.slice(lastDot + 1).toLowerCase();
  return ext || 'unknown';
}

/**
 * Get diagrams that need to be checked for updates (polling)
 */
export async function getDiagramsNeedingCheck(
  supabase: SupabaseClient
): Promise<ArchitectureDiagram[]> {
  const now = new Date();
  const { error, data } = await supabase
    .from('architecture_diagrams')
    .select('*')
    .eq('auto_update_enabled', true);

  if (error) {
    console.error('Error fetching diagrams needing check:', error);
    return [];
  }

  // Filter by check_interval_hours
  const diagrams = (data || []) as ArchitectureDiagram[];
  return diagrams.filter((diagram) => {
    const lastChecked = new Date(diagram.last_checked_at);
    const hoursSinceCheck = (now.getTime() - lastChecked.getTime()) / (1000 * 60 * 60);
    return hoursSinceCheck >= diagram.check_interval_hours;
  });
}

/**
 * Update last_checked_at timestamp
 */
export async function updateLastCheckedAt(
  supabase: SupabaseClient,
  diagramId: string
): Promise<void> {
  await supabase
    .from('architecture_diagrams')
    .update({ last_checked_at: new Date().toISOString() })
    .eq('id', diagramId);
}

