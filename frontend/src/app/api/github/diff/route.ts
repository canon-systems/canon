import { NextRequest, NextResponse } from 'next/server';
import { getRepoProvider } from '@/lib/server/repos/providerFactory';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { repoUrl, branch, filePath, oldCommitSha } = body as {
      repoUrl: string;
      branch: string;
      filePath: string;
      oldCommitSha?: string;
    };

    if (!repoUrl || !branch || !filePath) {
      return NextResponse.json(
        { error: 'repoUrl, branch, and filePath are required' },
        { status: 400 }
      );
    }

    // Get repository provider
    const provider = getRepoProvider(repoUrl);
    if (!provider) {
      return NextResponse.json(
        { error: `Unsupported repository provider for URL: ${repoUrl}` },
        { status: 400 }
      );
    }

    const repoInfo = provider.parseRepoUrl(repoUrl);
    if (!repoInfo) {
      return NextResponse.json(
        { error: `Failed to parse repository URL: ${repoUrl}` },
        { status: 400 }
      );
    }

    // For GitHub, use user's Octokit instance (or anonymous for public repos)
    if (repoInfo && repoUrl.includes('github.com')) {
      // Get user's GitHub connection (or anonymous if not connected)
      const { user } = await getSession();
      const supabase = await createClient();
      const octokit = await getUserOctokit(supabase, user?.id || null);

      // Get latest commit SHA for the branch
      const { data: branchData } = await octokit.repos.getBranch({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        branch
      });

      const latestCommitSha = branchData.commit.sha;

      // If old commit SHA is provided, get diff between old and new
      // Otherwise, get diff for the latest commit
      if (oldCommitSha && oldCommitSha !== latestCommitSha) {
        try {
          // Get file content at old commit
          const { data: oldFile } = await octokit.repos.getContent({
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            path: filePath,
            ref: oldCommitSha
          });

          // Get file content at new commit
          const { data: newFile } = await octokit.repos.getContent({
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            path: filePath,
            ref: latestCommitSha
          });

          // Get the actual diff using compare API
          const { data: compareData } = await octokit.repos.compareCommits({
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            base: oldCommitSha,
            head: latestCommitSha
          });

          // Find the file in the diff
          const fileDiff = compareData.files?.find((f) => f.filename === filePath);

          if (fileDiff && fileDiff.patch) {
            return NextResponse.json({
              diff: fileDiff.patch,
              filePath: fileDiff.filename,
              additions: fileDiff.additions,
              deletions: fileDiff.deletions,
              changes: fileDiff.changes,
              status: fileDiff.status
            });
          }

          // Fallback: return basic info
          return NextResponse.json({
            diff: `--- a/${filePath}\n+++ b/${filePath}\n@@ File changed @@\n`,
            filePath,
            status: 'modified'
          });
        } catch (error: any) {
          if (error.status === 404) {
            // File might have been added or deleted
            return NextResponse.json({
              diff: `--- /dev/null\n+++ b/${filePath}\n@@ New file @@\n`,
              filePath,
              status: 'added'
            });
          }
          throw error;
        }
      } else {
        // Get diff for the latest commit (show what changed in this commit)
        try {
          const { data: commits } = await octokit.repos.listCommits({
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            sha: branch,
            path: filePath,
            per_page: 1
          });

          if (commits.length > 0) {
            const commitSha = commits[0].sha;
            const { data: commitData } = await octokit.repos.getCommit({
              owner: repoInfo.owner,
              repo: repoInfo.repo,
              ref: commitSha
            });

            const fileChange = commitData.files?.find((f) => f.filename === filePath);
            if (fileChange && fileChange.patch) {
              return NextResponse.json({
                diff: fileChange.patch,
                filePath: fileChange.filename,
                additions: fileChange.additions,
                deletions: fileChange.deletions,
                changes: fileChange.changes,
                status: fileChange.status
              });
            }
          }
        } catch (error) {
          console.error('Error fetching commit diff:', error);
        }
      }
    }

    // Fallback for other providers or if GitHub API fails
    return NextResponse.json({
      diff: `--- a/${filePath}\n+++ b/${filePath}\n@@ Diff not available @@\n`,
      filePath,
      status: 'unknown'
    });
  } catch (err) {
    console.error('Error fetching Git diff:', err);
    return NextResponse.json(
      { error: 'Failed to fetch diff', detail: String(err) },
      { status: 500 }
    );
  }
}

