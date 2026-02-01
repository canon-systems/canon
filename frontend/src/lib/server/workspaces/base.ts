/**
 * Base interface for workspace providers
 * 
 * Workspace providers handle integration with team collaboration platforms
 * like Notion, Confluence, Google Docs, etc.
 */

import type { WorkspaceInfo, WorkspaceContent } from './types';

// Re-export types for convenience
export type { WorkspaceInfo, WorkspaceContent };

export interface WorkspaceProvider {
	/**
	 * Provider name (e.g., 'notion', 'confluence', 'googledocs')
	 */
	name: string;

	/**
	 * Pull content from workspace
	 * @param workspaceInfo Workspace connection info
	 * @param connectionId OAuth connection ID from database
	 * @returns Content from workspace or null if failed
	 */
	pullContent(workspaceInfo: WorkspaceInfo, connectionId: string): Promise<WorkspaceContent | null>;

	/**
	 * Push/update content to workspace
	 * @param workspaceInfo Workspace connection info
	 * @param content Content to push
	 * @param connectionId OAuth connection ID from database
	 * @param createNew If true, create new resource; if false, update existing
	 * @returns Updated workspace info with resource ID, or null if failed
	 */
	pushContent(
		workspaceInfo: WorkspaceInfo,
		content: WorkspaceContent,
		connectionId: string,
		createNew?: boolean
	): Promise<WorkspaceInfo | null>;

	/**
	 * Update existing content in workspace
	 * @param workspaceInfo Workspace connection info
	 * @param content Content to update
	 * @param connectionId OAuth connection ID from database
	 * @returns Success status
	 */
	updateContent(
		workspaceInfo: WorkspaceInfo,
		content: WorkspaceContent,
		connectionId: string
	): Promise<boolean>;

	/**
	 * Check if a resource (page/block) still exists in the workspace.
	 * Used before skipping an "unchanged" push so we recreate if the resource was deleted externally.
	 * @param workspaceInfo Workspace connection info with resourceId pointing at the resource
	 * @param connectionId OAuth connection ID from database
	 * @returns true if the resource exists and is accessible, false if not found or inaccessible
	 */
	resourceExists?(workspaceInfo: WorkspaceInfo, connectionId: string): Promise<boolean>;
}

