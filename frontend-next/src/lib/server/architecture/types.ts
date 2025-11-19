import type { DetectionResult } from './detectTools';

/**
 * Architecture Diagram Database Types
 */

export interface ArchitectureDiagram {
  id: string;
  user_id: string;
  repo_provider: string | null;
  repo_url: string;
  branch: string;
  subdir: string | null;
  detection_result: DetectionResult;
  diagram_markdown: string | null;
  diagram_svg: string | null;
  title: string;
  description: string | null;
  last_updated_at: string;
  last_checked_at: string;
  created_at: string;
  code_snapshot: {
    commitSha?: string;
    fileShas?: Record<string, string | null>;
    createdAt?: string;
  } | null;
  last_commit_sha: string | null;
  exports: DiagramExport[];
  auto_update_enabled: boolean;
  check_interval_hours: number;
}

export interface DiagramExport {
  provider: string; // 'notion', 'confluence', 'googledocs'
  resourceId: string;
  lastSyncedAt: string;
  autoSync: boolean;
  workspaceInfo?: {
    spaceKey?: string;
    parentPageId?: string;
    [key: string]: any;
  };
}

export interface ArchitectureDiagramVersion {
  id: string;
  diagram_id: string;
  detection_result: DetectionResult;
  diagram_markdown: string | null;
  code_snapshot: {
    commitSha?: string;
    fileShas?: Record<string, string | null>;
    createdAt?: string;
  } | null;
  commit_sha: string | null;
  version_number: number;
  created_at: string;
  change_summary: string | null;
  tools_added: string[];
  tools_removed: string[];
  connections_added: Array<{ from: string; to: string; label: string }>;
  connections_removed: Array<{ from: string; to: string; label: string }>;
}

export interface ArchitectureDiagramFile {
  diagram_id: string;
  file_path: string;
  file_hash: string | null;
  size_bytes: number | null;
  file_type: string | null;
}

export interface CreateDiagramInput {
  user_id: string;
  repo_provider: string | null;
  repo_url: string;
  branch: string;
  subdir?: string | null;
  detection_result: DetectionResult;
  diagram_markdown: string | null;
  code_snapshot: {
    commitSha?: string;
    fileShas?: Record<string, string | null>;
    createdAt?: string;
  } | null;
  last_commit_sha?: string | null;
  title: string;
  description?: string | null;
}

export interface UpdateDiagramInput {
  detection_result?: DetectionResult;
  diagram_markdown?: string | null;
  code_snapshot?: {
    commitSha?: string;
    fileShas?: Record<string, string | null>;
    createdAt?: string;
  } | null;
  last_commit_sha?: string | null;
  title?: string;
  description?: string | null;
  auto_update_enabled?: boolean;
  check_interval_hours?: number;
}

