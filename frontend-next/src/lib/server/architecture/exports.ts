import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArchitectureDiagram, DiagramExport } from './types';
import { getWorkspaceProvider } from '../workspaces/workspaceFactory';
import type { WorkspaceInfo, WorkspaceContent } from '../workspaces/types';
import { marked } from 'marked';

/**
 * Export diagram to workspace provider
 */
export async function exportDiagramToWorkspace(
  supabase: SupabaseClient,
  diagram: ArchitectureDiagram,
  workspaceProvider: string,
  workspaceInfo: WorkspaceInfo,
  connectionId: string,
  autoSync: boolean = false
): Promise<{ success: boolean; resourceId?: string; error?: string }> {
  try {
    const provider = getWorkspaceProvider(workspaceProvider);
    if (!provider) {
      return { success: false, error: `Unsupported workspace provider: ${workspaceProvider}` };
    }

    // Generate export content
    const content = getDiagramExportContent(diagram);

    // Push to workspace
    const result = await provider.pushContent(workspaceInfo, content, connectionId, true);

    if (!result) {
      return { success: false, error: 'Failed to push content to workspace' };
    }

    // Update diagram exports
    const exports = (diagram.exports || []) as DiagramExport[];
    const newExport: DiagramExport = {
      provider: workspaceProvider,
      resourceId: result.resourceId,
      lastSyncedAt: new Date().toISOString(),
      autoSync,
      workspaceInfo: result.metadata,
    };

    exports.push(newExport);

    await supabase
      .from('architecture_diagrams')
      .update({ exports })
      .eq('id', diagram.id);

    return { success: true, resourceId: result.resourceId };
  } catch (err: any) {
    console.error('Error exporting diagram:', err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Sync diagram export (update existing export)
 */
export async function syncDiagramExport(
  supabase: SupabaseClient,
  diagram: ArchitectureDiagram,
  exportIndex: number,
  connectionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const exports = (diagram.exports || []) as DiagramExport[];
    const diagramExport = exports[exportIndex];

    if (!diagramExport) {
      return { success: false, error: 'Export not found' };
    }

    const provider = getWorkspaceProvider(diagramExport.provider);
    if (!provider) {
      return { success: false, error: `Unsupported workspace provider: ${diagramExport.provider}` };
    }

    // Generate export content
    const content = getDiagramExportContent(diagram);

    // Update in workspace
    const workspaceInfo: WorkspaceInfo = {
      provider: diagramExport.provider,
      resourceId: diagramExport.resourceId,
      metadata: diagramExport.workspaceInfo,
    };

    const success = await provider.updateContent(workspaceInfo, content, connectionId);

    if (success) {
      // Update lastSyncedAt
      diagramExport.lastSyncedAt = new Date().toISOString();
      exports[exportIndex] = diagramExport;

      await supabase
        .from('architecture_diagrams')
        .update({ exports })
        .eq('id', diagram.id);
    }

    return { success };
  } catch (err: any) {
    console.error('Error syncing diagram export:', err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Generate export-friendly content from diagram
 */
export function getDiagramExportContent(diagram: ArchitectureDiagram): WorkspaceContent {
  // Use diagram markdown if available, otherwise generate from detection result
  const markdown = diagram.diagram_markdown || generateMarkdownFromDiagram(diagram);

  // Convert markdown to HTML for providers that need it
  const html = marked.parse(markdown) as string;

  return {
    title: diagram.title,
    markdown,
    html,
    metadata: {
      diagramId: diagram.id,
      repoUrl: diagram.repo_url,
      branch: diagram.branch,
      lastUpdated: diagram.last_updated_at,
    },
  };
}

/**
 * Generate markdown from diagram (fallback if diagram_markdown is missing)
 */
function generateMarkdownFromDiagram(diagram: ArchitectureDiagram): string {
  const detectionResult = diagram.detection_result as any;
  const tools = detectionResult.tools || [];
  const connections = detectionResult.connections || [];

  let markdown = `# ${diagram.title}\n\n`;
  if (diagram.description) {
    markdown += `${diagram.description}\n\n`;
  }

  markdown += `*Last updated: ${new Date(diagram.last_updated_at).toLocaleString()}*\n\n`;

  markdown += '## Architecture Overview\n\n';
  markdown += `Repository: ${diagram.repo_url}\n`;
  markdown += `Branch: ${diagram.branch}\n`;
  if (diagram.subdir) {
    markdown += `Subdirectory: ${diagram.subdir}\n`;
  }
  markdown += '\n';

  markdown += '## Detected Tools\n\n';
  if (tools.length > 0) {
    tools.forEach((tool: any) => {
      markdown += `- **${tool.icon || '📦'} ${tool.name}** - ${tool.description || 'No description'}\n`;
    });
  } else {
    markdown += 'No tools detected.\n';
  }

  markdown += '\n## Service Connections\n\n';
  if (connections.length > 0) {
    connections.forEach((conn: any) => {
      markdown += `- **${conn.from}** → **${conn.to}**: ${conn.label || 'Connected'}\n`;
    });
  } else {
    markdown += 'No connections detected.\n';
  }

  return markdown;
}

/**
 * Remove export from diagram
 */
export async function removeDiagramExport(
  supabase: SupabaseClient,
  diagram: ArchitectureDiagram,
  exportIndex: number
): Promise<boolean> {
  try {
    const exports = (diagram.exports || []) as DiagramExport[];
    exports.splice(exportIndex, 1);

    await supabase
      .from('architecture_diagrams')
      .update({ exports })
      .eq('id', diagram.id);

    return true;
  } catch (err) {
    console.error('Error removing export:', err);
    return false;
  }
}

/**
 * Update export autoSync preference
 */
export async function updateExportAutoSync(
  supabase: SupabaseClient,
  diagram: ArchitectureDiagram,
  exportIndex: number,
  autoSync: boolean
): Promise<boolean> {
  try {
    const exports = (diagram.exports || []) as DiagramExport[];
    if (exports[exportIndex]) {
      exports[exportIndex].autoSync = autoSync;
      await supabase
        .from('architecture_diagrams')
        .update({ exports })
        .eq('id', diagram.id);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error updating export autoSync:', err);
    return false;
  }
}

