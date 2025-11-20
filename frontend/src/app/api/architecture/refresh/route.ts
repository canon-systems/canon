import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import {
  getArchitectureDiagram,
  updateArchitectureDiagram,
  trackDiagramFiles,
} from '@/lib/server/architecture/persistence';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { detectTools } from '@/lib/server/architecture/detectTools';
import { generateMarkdownDoc } from '@/lib/server/architecture/generateDiagram';
import { createDiagramVersion, getDiagramVersions } from '@/lib/server/architecture/versions';
import { compareCodeSnapshots } from '@/lib/server/architecture/detectChanges';

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
    const body = await request.json();
    const { diagramId } = body;

    if (!diagramId) {
      return NextResponse.json({ error: 'Missing diagramId' }, { status: 400 });
    }

    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const diagram = await getArchitectureDiagram(supabase, diagramId);

    if (!diagram) {
      return NextResponse.json({ error: 'Diagram not found' }, { status: 404 });
    }

    if (diagram.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only refresh GitHub repos for now
    if (diagram.repo_provider !== 'github') {
      return NextResponse.json({
        error: 'Only GitHub repos are supported for refresh',
      });
    }

    const octokit = await getUserOctokit(supabase, user.id);

    // Fetch current files
    const files = await fetchFilesFromGitHub(
      octokit,
      diagram.repo_url,
      diagram.branch,
      diagram.subdir
    );

    if (files.length === 0) {
      return NextResponse.json({ error: 'No relevant files found' }, { status: 400 });
    }

    // Run tool detection
    const detectionResult = detectTools(files);

    // Generate diagram
    const diagramMarkdown = generateMarkdownDoc(detectionResult);

    // Get current code snapshot
    const match = diagram.repo_url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\.git|$|\/)/);
    if (!match) {
      return NextResponse.json({ error: 'Invalid GitHub URL' }, { status: 400 });
    }

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');

    // Get commit SHA
    const { data: branchData } = await octokit.repos.getBranch({
      owner,
      repo,
      branch: diagram.branch,
    });
    const currentCommitSha = branchData.commit.sha;

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

    const newSnapshot = {
      commitSha: currentCommitSha,
      fileShas,
      createdAt: new Date().toISOString(),
    };

    // Update diagram
    const updatedDiagram = await updateArchitectureDiagram(supabase, diagramId, {
      detection_result: detectionResult,
      diagram_markdown: diagramMarkdown,
      code_snapshot: newSnapshot,
      last_commit_sha: currentCommitSha,
    });

    if (!updatedDiagram) {
      return NextResponse.json({ error: 'Failed to update diagram' }, { status: 500 });
    }

    // Track files
    await trackDiagramFiles(supabase, diagramId, diagram.repo_url, diagram.branch, newSnapshot, user.id);

    // Get previous version for comparison
    const versions = await getDiagramVersions(supabase, diagramId);
    const previousVersion = versions.length > 0 ? versions[0] : null;

    // Create new version
    const newVersion = await createDiagramVersion(
      supabase,
      diagramId,
      detectionResult,
      diagramMarkdown,
      newSnapshot,
      currentCommitSha,
      previousVersion || undefined
    );

    return NextResponse.json({
      success: true,
      diagram: updatedDiagram,
      version: newVersion,
      detectionResult,
      diagramMarkdown,
    });
  } catch (err: any) {
    console.error('Error refreshing diagram:', err);
    return NextResponse.json(
      {
        error: 'Failed to refresh diagram',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}


