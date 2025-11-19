import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getArchitectureDiagram } from '@/lib/server/architecture/persistence';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { compareCodeSnapshots, shouldRegenerateDiagram } from '@/lib/server/architecture/detectChanges';

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

    // Only check GitHub repos for now
    if (diagram.repo_provider !== 'github') {
      return NextResponse.json({
        outdated: false,
        reason: 'Only GitHub repos are supported for change detection',
      });
    }

    // Parse repo URL
    const match = diagram.repo_url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\.git|$|\/)/);
    if (!match) {
      return NextResponse.json({ error: 'Invalid GitHub URL' }, { status: 400 });
    }

    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');

    const octokit = await getUserOctokit(supabase, user.id);

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
      return NextResponse.json(
        { error: 'Failed to get current commit SHA', detail: String(e) },
        { status: 500 }
      );
    }

    // Get current file SHAs
    const currentFileShas: Record<string, string | null> = {};
    const oldFileShas = diagram.code_snapshot?.fileShas || {};

    // Get tree SHA for recursive file listing
    try {
      const { data: treeData } = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: currentCommitSha,
        recursive: '1',
      });

      const treeMap = new Map<string, string>();
      if (treeData.tree) {
        for (const item of treeData.tree) {
          if (item.type === 'blob' && item.path && item.sha) {
            treeMap.set(item.path, item.sha);
          }
        }
      }

      // Compare stored hashes with current hashes
      for (const filePath of Object.keys(oldFileShas)) {
        currentFileShas[filePath] = treeMap.get(filePath) || null;
      }
    } catch (e) {
      console.warn('Failed to get file tree, using stored file list:', e);
      // Fallback: try to get SHAs for known files
      for (const filePath of Object.keys(oldFileShas)) {
        try {
          const { data: fileData } = await octokit.repos.getContent({
            owner,
            repo,
            path: filePath,
            ref: currentCommitSha,
          });
          if (
            fileData &&
            !Array.isArray(fileData) &&
            fileData.type === 'file' &&
            'sha' in fileData
          ) {
            currentFileShas[filePath] = fileData.sha;
          } else {
            currentFileShas[filePath] = null;
          }
        } catch {
          currentFileShas[filePath] = null;
        }
      }
    }

    const newSnapshot = {
      commitSha: currentCommitSha,
      fileShas: currentFileShas,
    };

    const oldSnapshot = diagram.code_snapshot || null;

    const codeComparison = compareCodeSnapshots(oldSnapshot, newSnapshot);
    const detectionComparison = { hasChanges: false }; // We don't regenerate detection here, just check code

    const needsRegeneration = shouldRegenerateDiagram(codeComparison, detectionComparison);

    // Update last_checked_at
    await supabase
      .from('architecture_diagrams')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', diagramId);

    return NextResponse.json({
      outdated: needsRegeneration,
      commitChanged: codeComparison.commitChanged,
      filesChanged: codeComparison.filesChanged.length,
      filesAdded: codeComparison.filesAdded.length,
      filesRemoved: codeComparison.filesRemoved.length,
      currentCommitSha,
      oldCommitSha: oldSnapshot?.commitSha || null,
    });
  } catch (err: any) {
    console.error('Error checking diagram updates:', err);
    return NextResponse.json(
      {
        error: 'Failed to check updates',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}


