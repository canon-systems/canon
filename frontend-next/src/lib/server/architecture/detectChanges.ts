import type { DetectionResult } from './detectTools';

/**
 * Compare two code snapshots to detect changes
 */
export function compareCodeSnapshots(
  oldSnapshot: {
    commitSha?: string;
    fileShas?: Record<string, string | null>;
  } | null,
  newSnapshot: {
    commitSha?: string;
    fileShas?: Record<string, string | null>;
  } | null
): {
  hasChanges: boolean;
  commitChanged: boolean;
  filesChanged: Array<{ path: string; oldHash: string | null; newHash: string | null }>;
  filesAdded: string[];
  filesRemoved: string[];
} {
  if (!oldSnapshot && !newSnapshot) {
    return {
      hasChanges: false,
      commitChanged: false,
      filesChanged: [],
      filesAdded: [],
      filesRemoved: [],
    };
  }

  if (!oldSnapshot) {
    // New snapshot, all files are "added"
    const newFiles = Object.keys(newSnapshot?.fileShas || {});
    return {
      hasChanges: true,
      commitChanged: true,
      filesChanged: [],
      filesAdded: newFiles,
      filesRemoved: [],
    };
  }

  if (!newSnapshot) {
    // Old snapshot removed, all files are "removed"
    const oldFiles = Object.keys(oldSnapshot.fileShas || {});
    return {
      hasChanges: true,
      commitChanged: true,
      filesChanged: [],
      filesAdded: [],
      filesRemoved: oldFiles,
    };
  }

  const oldCommitSha = oldSnapshot.commitSha;
  const newCommitSha = newSnapshot.commitSha;
  const commitChanged = oldCommitSha !== newCommitSha;

  const oldFileShas = oldSnapshot.fileShas || {};
  const newFileShas = newSnapshot.fileShas || {};

  const oldPaths = new Set(Object.keys(oldFileShas));
  const newPaths = new Set(Object.keys(newFileShas));

  const filesAdded = Array.from(newPaths).filter((path) => !oldPaths.has(path));
  const filesRemoved = Array.from(oldPaths).filter((path) => !newPaths.has(path));

  const filesChanged: Array<{ path: string; oldHash: string | null; newHash: string | null }> = [];

  // Check for changed files (same path, different hash)
  for (const path of oldPaths) {
    if (newPaths.has(path)) {
      const oldHash = oldFileShas[path];
      const newHash = newFileShas[path];
      if (oldHash !== newHash) {
        filesChanged.push({ path, oldHash, newHash });
      }
    }
  }

  const hasChanges =
    commitChanged || filesChanged.length > 0 || filesAdded.length > 0 || filesRemoved.length > 0;

  return {
    hasChanges,
    commitChanged,
    filesChanged,
    filesAdded,
    filesRemoved,
  };
}

/**
 * Compare two DetectionResult objects to identify changes
 */
export function compareDetectionResults(
  oldResult: DetectionResult,
  newResult: DetectionResult
): {
  toolsAdded: string[];
  toolsRemoved: string[];
  connectionsAdded: Array<{ from: string; to: string; label: string }>;
  connectionsRemoved: Array<{ from: string; to: string; label: string }>;
  hasChanges: boolean;
} {
  const oldToolNames = new Set(oldResult.tools.map((t) => t.name));
  const newToolNames = new Set(newResult.tools.map((t) => t.name));

  const toolsAdded = newResult.tools
    .filter((t) => !oldToolNames.has(t.name))
    .map((t) => t.name);
  const toolsRemoved = oldResult.tools
    .filter((t) => !newToolNames.has(t.name))
    .map((t) => t.name);

  // Compare connections
  const oldConnections = new Set(
    oldResult.connections.map((c) => `${c.from}->${c.to}:${c.label}`)
  );
  const newConnections = new Set(
    newResult.connections.map((c) => `${c.from}->${c.to}:${c.label}`)
  );

  const connectionsAdded = newResult.connections.filter(
    (c) => !oldConnections.has(`${c.from}->${c.to}:${c.label}`)
  );
  const connectionsRemoved = oldResult.connections.filter(
    (c) => !newConnections.has(`${c.from}->${c.to}:${c.label}`)
  );

  const hasChanges =
    toolsAdded.length > 0 ||
    toolsRemoved.length > 0 ||
    connectionsAdded.length > 0 ||
    connectionsRemoved.length > 0;

  return {
    toolsAdded,
    toolsRemoved,
    connectionsAdded,
    connectionsRemoved,
    hasChanges,
  };
}

/**
 * Generate human-readable change summary
 */
export function generateChangeSummary(comparison: {
  toolsAdded: string[];
  toolsRemoved: string[];
  connectionsAdded: Array<{ from: string; to: string; label: string }>;
  connectionsRemoved: Array<{ from: string; to: string; label: string }>;
}): string {
  const parts: string[] = [];

  if (comparison.toolsAdded.length > 0) {
    parts.push(`Added ${comparison.toolsAdded.length} tool(s): ${comparison.toolsAdded.join(', ')}`);
  }

  if (comparison.toolsRemoved.length > 0) {
    parts.push(
      `Removed ${comparison.toolsRemoved.length} tool(s): ${comparison.toolsRemoved.join(', ')}`
    );
  }

  if (comparison.connectionsAdded.length > 0) {
    parts.push(
      `Added ${comparison.connectionsAdded.length} connection(s): ${comparison.connectionsAdded
        .map((c) => `${c.from} → ${c.to}`)
        .join(', ')}`
    );
  }

  if (comparison.connectionsRemoved.length > 0) {
    parts.push(
      `Removed ${comparison.connectionsRemoved.length} connection(s): ${comparison.connectionsRemoved
        .map((c) => `${c.from} → ${c.to}`)
        .join(', ')}`
    );
  }

  if (parts.length === 0) {
    return 'No changes detected';
  }

  return parts.join('. ');
}

/**
 * Determine if diagram should be regenerated based on changes
 */
export function shouldRegenerateDiagram(
  codeSnapshotComparison: {
    hasChanges: boolean;
    commitChanged: boolean;
    filesChanged: Array<{ path: string; oldHash: string | null; newHash: string | null }>;
  },
  detectionComparison: {
    hasChanges: boolean;
  }
): boolean {
  // Regenerate if:
  // 1. Commit changed (likely significant changes)
  // 2. Detection result changed (tools/connections changed)
  // 3. Important files changed (package.json, config files, etc.)
  if (detectionComparison.hasChanges) {
    return true;
  }

  if (codeSnapshotComparison.commitChanged) {
    return true;
  }

  // Check if important files changed
  const importantPatterns = [
    /package\.json$/i,
    /package-lock\.json$/i,
    /yarn\.lock$/i,
    /requirements\.txt$/i,
    /Pipfile$/i,
    /docker-compose\.yml$/i,
    /Dockerfile$/i,
    /vercel\.json$/i,
  ];

  const importantFilesChanged = codeSnapshotComparison.filesChanged.some((file) =>
    importantPatterns.some((pattern) => pattern.test(file.path))
  );

  return importantFilesChanged;
}

