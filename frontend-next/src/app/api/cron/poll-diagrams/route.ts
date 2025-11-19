import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getDiagramsNeedingCheck,
  updateLastCheckedAt,
  getArchitectureDiagram,
  updateArchitectureDiagram,
  trackDiagramFiles,
} from '@/lib/server/architecture/persistence';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { detectTools } from '@/lib/server/architecture/detectTools';
import { generateMarkdownDoc } from '@/lib/server/architecture/generateDiagram';
import { createDiagramVersion, getDiagramVersions } from '@/lib/server/architecture/versions';
import { compareCodeSnapshots, shouldRegenerateDiagram } from '@/lib/server/architecture/detectChanges';
import { syncDiagramExport } from '@/lib/server/architecture/exports';

/**
 * Fetch file content from GitHub
 */
async function fetchFileContent(
  octokit: Awaited<ReturnType<typeof getUserOctokit>>,
  owner: string,
  repo: string,
  branch: string,
  path: string
): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    if (!Array.isArray(data) && data.type === 'file' && 'content' in data && typeof data.content === 'string') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * List all files in a GitHub repo (recursively)
 */
async function listAllFiles(
  octokit: Awaited<ReturnType<typeof getUserOctokit>>,
  owner: string,
  repo: string,
  branch: string,
  rootPath: string
): Promise<Array<{ path: string; size: number }>> {
  const stack: string[] = [rootPath || ''];
  const files: Array<{ path: string; size: number }> = [];

  while (stack.length) {
    const current = stack.pop()!;
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: current || '',
        ref: branch,
      });

      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.type === 'file') {
            files.push({ path: item.path, size: Number(item.size || 0) });
          } else if (item.type === 'dir') {
            stack.push(item.path);
          }
        }
      } else if (data && data.type === 'file') {
        files.push({ path: data.path, size: Number(data.size || 0) });
      }
    } catch {
      // Skip errors and continue
    }
  }

  return files;
}

/**
 * Fetch files from GitHub repo
 */
async function fetchFilesFromGitHub(
  octokit: Awaited<ReturnType<typeof getUserOctokit>>,
  repoUrl: string,
  branch: string,
  subdir?: string | null
): Promise<Array<{ path: string; content: string }>> {
  const noProto = repoUrl.replace(/^https?:\/\//, '');
  const parts = noProto.split('/').filter(Boolean);
  const owner = parts[1];
  const repo = parts[2]?.replace(/\.git$/, '');

  if (!owner || !repo) {
    throw new Error('Invalid GitHub URL');
  }

  const rootPath = subdir ? subdir.replace(/^\/+|\/+$/g, '') : '';

  const allFiles = await listAllFiles(octokit, owner, repo, branch, rootPath);

  const importantPatterns = [
    /package\.json$/i,
    /package-lock\.json$/i,
    /yarn\.lock$/i,
    /pnpm-lock\.yaml$/i,
    /requirements\.txt$/i,
    /Pipfile$/i,
    /poetry\.lock$/i,
    /docker-compose\.yml$/i,
    /Dockerfile$/i,
    /vercel\.json$/i,
    /\.env$/i,
    /\.env\.example$/i,
    /\.(ts|js|tsx|jsx|py|java|go|rs|svelte)$/i,
  ];

  const relevantFiles = allFiles.filter((file) =>
    importantPatterns.some((pattern) => pattern.test(file.path))
  );

  const filesToFetch = relevantFiles.slice(0, 100);

  const filesWithContent: Array<{ path: string; content: string }> = [];
  for (const file of filesToFetch) {
    const content = await fetchFileContent(octokit, owner, repo, branch, file.path);
    if (content) {
      filesWithContent.push({ path: file.path, content });
    }
  }

  return filesWithContent;
}

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret (if configured)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const diagrams = await getDiagramsNeedingCheck(supabase);

    const results = {
      checked: 0,
      updated: 0,
      errors: 0,
      exportsSynced: 0,
    };

    for (const diagram of diagrams) {
      try {
        results.checked++;

        // Only process GitHub repos
        if (diagram.repo_provider !== 'github') {
          await updateLastCheckedAt(supabase, diagram.id);
          continue;
        }

        // Parse repo URL
        const match = diagram.repo_url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\.git|$|\/)/);
        if (!match) {
          await updateLastCheckedAt(supabase, diagram.id);
          continue;
        }

        const owner = match[1];
        const repo = match[2].replace(/\.git$/, '');

        // Get user's Octokit
        const octokit = await getUserOctokit(supabase, diagram.user_id);

        // Get current commit SHA
        let currentCommitSha: string | null = null;
        try {
          const { data: branchData } = await octokit.repos.getBranch({
            owner,
            repo,
            branch: diagram.branch,
          });
          currentCommitSha = branchData.commit.sha;
        } catch (e) {
          console.warn(`Failed to get commit SHA for diagram ${diagram.id}:`, e);
          await updateLastCheckedAt(supabase, diagram.id);
          continue;
        }

        // Compare snapshots
        const oldSnapshot = diagram.code_snapshot || null;
        const newSnapshot = {
          commitSha: currentCommitSha,
          fileShas: {}, // We'll populate this if needed
        };

        const codeComparison = compareCodeSnapshots(oldSnapshot, newSnapshot);
        const detectionComparison = { hasChanges: false };

        const needsRegeneration = shouldRegenerateDiagram(codeComparison, detectionComparison);

        // Update last_checked_at regardless
        await updateLastCheckedAt(supabase, diagram.id);

        if (!needsRegeneration) {
          continue;
        }

        // Regenerate diagram
        const files = await fetchFilesFromGitHub(
          octokit,
          diagram.repo_url,
          diagram.branch,
          diagram.subdir
        );

        if (files.length === 0) {
          continue;
        }

        const detectionResult = detectTools(files);
        const diagramMarkdown = generateMarkdownDoc(detectionResult);

        // Get file SHAs
        const fileShas: Record<string, string | null> = {};
        for (const file of files) {
          try {
            const { data: fileData } = await octokit.repos.getContent({
              owner,
              repo,
              path: file.path,
              ref: currentCommitSha,
            });
            if (
              fileData &&
              !Array.isArray(fileData) &&
              fileData.type === 'file' &&
              'sha' in fileData
            ) {
              fileShas[file.path] = fileData.sha;
            }
          } catch {
            fileShas[file.path] = null;
          }
        }

        const updatedSnapshot = {
          commitSha: currentCommitSha,
          fileShas,
          createdAt: new Date().toISOString(),
        };

        // Update diagram
        await updateArchitectureDiagram(supabase, diagram.id, {
          detection_result: detectionResult,
          diagram_markdown: diagramMarkdown,
          code_snapshot: updatedSnapshot,
          last_commit_sha: currentCommitSha,
        });

        // Track files
        await trackDiagramFiles(
          supabase,
          diagram.id,
          diagram.repo_url,
          diagram.branch,
          updatedSnapshot,
          diagram.user_id
        );

        // Create new version
        const versions = await getDiagramVersions(supabase, diagram.id);
        const previousVersion = versions.length > 0 ? versions[0] : null;

        await createDiagramVersion(
          supabase,
          diagram.id,
          detectionResult,
          diagramMarkdown,
          updatedSnapshot,
          currentCommitSha,
          previousVersion || undefined
        );

        results.updated++;

        // Sync exports if autoSync is enabled
        const exports = diagram.exports || [];
        for (let i = 0; i < exports.length; i++) {
          const diagramExport = exports[i];
          if (diagramExport.autoSync) {
            try {
              // Get connection ID
              const { data: connection } = await supabase
                .from('oauth_connections')
                .select('connection_id')
                .eq('user_id', diagram.user_id)
                .eq('provider', diagramExport.provider)
                .single();

              if (connection) {
                const updatedDiagram = await getArchitectureDiagram(supabase, diagram.id);
                if (updatedDiagram) {
                  await syncDiagramExport(
                    supabase,
                    updatedDiagram,
                    i,
                    connection.connection_id
                  );
                  results.exportsSynced++;
                }
              }
            } catch (exportError) {
              console.warn(`Failed to sync export ${i} for diagram ${diagram.id}:`, exportError);
            }
          }
        }
      } catch (err) {
        console.error(`Error processing diagram ${diagram.id}:`, err);
        results.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (err: any) {
    console.error('Error in poll-diagrams cron:', err);
    return NextResponse.json(
      {
        error: 'Failed to poll diagrams',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

