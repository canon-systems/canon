import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';

type SourceMeta = {
  repoUrl?: string;
  repo?: string;
  path?: string;
  commit?: string;
  approval_status?: string;
  push_metadata?: {
    provider?: string;
    pushed_at?: string;
    url?: string;
    resource_id?: string;
  };
};

type SubmissionRow = {
  id: string;
  title?: string;
  markdown?: string;
  status?: string;
  source_meta?: SourceMeta;
  summary?: string;
  error_message?: string;
  created_at?: string;
  updated_at?: string;
  last_checked_at?: string;
  is_outdated?: boolean;
  code_snapshot?: unknown;
};

/**
 * GET: List documents with filtering and pagination
 * Proxies to FastAPI backend /api/docs
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const repo = searchParams.get('repo');
    const search = searchParams.get('search');
    const page = Number(searchParams.get('page') || '1');
    const pageSize = Number(searchParams.get('pageSize') || '20');

    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const submissions = data as SubmissionRow[] | null;

    const filtered =
      submissions?.filter((doc: any) => {
        const sourceMeta = doc.source_meta || {};
        const approvalStatus = sourceMeta?.approval_status || 'pending_review';

        if (status && approvalStatus !== status) return false;

        if (repo) {
          const repoUrl = (sourceMeta?.repoUrl || '').toLowerCase();
          if (!repoUrl.includes(repo.toLowerCase())) return false;
        }

        if (search) {
          const term = search.toLowerCase();
          const titleMatch = (doc.title || '').toLowerCase().includes(term);
          const repoMatch = (sourceMeta?.repoUrl || '').toLowerCase().includes(term);
          const pathMatch = (sourceMeta?.path || '').toLowerCase().includes(term);
          if (!titleMatch && !repoMatch && !pathMatch) return false;
        }

        return true;
      }) || [];

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    // Return list immediately with stored values
    const items = paginated.map((doc: any) => {
      const sourceMeta = doc.source_meta || {};
      const approvalStatus = sourceMeta?.approval_status || 'pending_review';
      const pushMeta = sourceMeta?.push_metadata || {};
      
      return {
        id: doc.id,
        title: doc.title || 'Untitled',
        status: approvalStatus,
        repo: sourceMeta?.repoUrl || '',
        branch: sourceMeta?.branch || '',
        path: sourceMeta?.path || '/',
        commit: sourceMeta?.commit || (doc.code_snapshot as any)?.commitSha || '',
        createdAt: doc.created_at,
        updatedAt: doc.updated_at || doc.last_checked_at || doc.created_at,
        lastPushedProvider: pushMeta?.provider,
        lastPushedAt: pushMeta?.pushed_at,
        processingStatus: doc.status,
        isOutdated: doc.is_outdated || false,
      };
    });

    // Check outdated status asynchronously in the background (fire and forget)
    // Only check documents that haven't been checked in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const docsToCheck = paginated.filter((doc: any) => {
      const sourceMeta = doc.source_meta || {};
      const inputType = doc.input_type;
      const lastChecked = doc.last_checked_at;
      
      // Only check if:
      // 1. It's a repository-based document
      // 2. Has tracked files and file hashes
      // 3. Hasn't been checked recently (or never checked)
      return (
        (inputType === 'github_repo' || inputType === 'github_repo_directory') &&
        sourceMeta?.repoUrl &&
        doc.code_snapshot?.fileShas &&
        Object.keys(doc.code_snapshot.fileShas).length > 0 &&
        doc.selected_files &&
        doc.selected_files.length > 0 &&
        (!lastChecked || lastChecked < fiveMinutesAgo)
      );
    });

    // Run checks asynchronously without blocking the response
    if (docsToCheck.length > 0) {
      (async () => {
        try {
          const octokit = await getUserOctokit(supabase, user.id);
          
          // Process in batches of 5 to avoid rate limits
          const batchSize = 5;
          for (let i = 0; i < docsToCheck.length; i += batchSize) {
            const batch = docsToCheck.slice(i, i + batchSize);
            
            await Promise.allSettled(
              batch.map(async (doc: any) => {
                try {
                  const sourceMeta = doc.source_meta || {};
                  const repoUrl = sourceMeta.repoUrl;
                  const branch = sourceMeta.branch || 'main';
                  const trackedFiles = doc.selected_files || [];
                  const codeSnapshot = doc.code_snapshot || {};
                  const storedFileShas = codeSnapshot.fileShas || {};

                  // Parse repo URL
                  const url = new URL(repoUrl);
                  const parts = url.pathname.split('/').filter(Boolean);
                  if (parts.length < 2) return;
                  const owner = parts[0];
                  const repo = parts[1].replace(/\.git$/, '');

                  // Get current commit SHA
                  const { data: branchData } = await octokit.repos.getBranch({
                    owner,
                    repo,
                    branch,
                  });
                  const latestCommitSha = branchData.commit.sha;

                  // Check file hashes (stop at first change for efficiency)
                  let hasChanges = false;
                  for (const filePath of trackedFiles) {
                    const storedHash = storedFileShas[filePath];
                    if (!storedHash) continue;

                    try {
                      const { data: fileData } = await octokit.repos.getContent({
                        owner,
                        repo,
                        path: filePath,
                        ref: latestCommitSha,
                      });

                      if (fileData && !Array.isArray(fileData) && fileData.type === 'file' && 'sha' in fileData) {
                        const currentHash = fileData.sha;
                        if (currentHash !== storedHash) {
                          hasChanges = true;
                          break;
                        }
                      } else {
                        hasChanges = true;
                        break;
                      }
                    } catch (e) {
                      hasChanges = true;
                      break;
                    }
                  }

                  // Update is_outdated if it changed
                  if (hasChanges !== (doc.is_outdated || false)) {
                    await supabase
                      .from('submissions')
                      .update({
                        is_outdated: hasChanges,
                        last_checked_at: new Date().toISOString(),
                      })
                      .eq('id', doc.id);
                  } else {
                    // Still update last_checked_at even if status didn't change
                    await supabase
                      .from('submissions')
                      .update({
                        last_checked_at: new Date().toISOString(),
                      })
                      .eq('id', doc.id);
                  }
                } catch (e) {
                  console.error(`Error checking outdated status for ${doc.id}:`, e);
                }
              })
            );
          }
        } catch (e) {
          console.error('Error in background outdated check:', e);
        }
      })();
    }

    return NextResponse.json(
      {
        items,
        pagination: {
          page,
          pageSize,
          total,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('List docs error:', err);
    return NextResponse.json(
      {
        error: 'Failed to list documents',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

