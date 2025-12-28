import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getUserOctokit } from '@/lib/server/github/getUserOctokit';
import { getCachedBranch, getCachedFileShas } from '@/lib/server/github/cachedOctokit';
import { getRateLimitStatus } from '@/lib/server/github/rateLimiter';

type SourceMeta = {
  repoUrl?: string;
  repo?: string;
  path?: string;
  commit?: string;
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
    const repoFilter = searchParams.get('repo');
    const search = searchParams.get('search');
    const page = Number(searchParams.get('page') || '1');
    const pageSize = Number(searchParams.get('pageSize') || '20');

    // Get documents from workspace_repos that belong to the user
    const { data: userRepos } = await supabase
      .from('workspace_repos')
      .select('id')
      .eq('user_id', user.id);

    const repoIds = userRepos?.map(r => r.id) || [];

    const { data, error } = await supabase
      .from('documents')
      .select('id, title, content, repo_id, created_at, updated_at')
      .in('repo_id', repoIds.length > 0 ? repoIds : ['00000000-0000-0000-0000-000000000000']) // Empty array workaround
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Get repo details for filtering
    const { data: reposData } = await supabase
      .from('workspace_repos')
      .select('id, repo_url, name, default_branch')
      .in('id', repoIds);

    const repoMap = new Map(reposData?.map(r => [r.id, r]) || []);

    const documents = data || [];
    const filtered = documents.filter((doc: any) => {
      const repo = repoMap.get(doc.repo_id);
      const repoUrl = repo?.repo_url || '';

      if (status) {
        // For now, all documents are 'pending_review' - can be enhanced later
        if (status !== 'pending_review') return false;
      }

      if (repoFilter) {
        if (!repoUrl.toLowerCase().includes(repoFilter.toLowerCase())) return false;
      }

      if (search) {
        const term = search.toLowerCase();
        const titleMatch = (doc.title || '').toLowerCase().includes(term);
        const repoMatch = repoUrl.toLowerCase().includes(term);
        if (!titleMatch && !repoMatch) return false;
      }

      return true;
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    // Return list immediately with stored values
    const items = paginated.map((doc: any) => {
      const repo = repoMap.get(doc.repo_id);

      return {
        id: doc.id,
        title: doc.title || 'Untitled',
        status: 'pending_review', // Default status for new documents system
        repo: repo?.repo_url || '',
        branch: repo?.default_branch || 'main',
        path: '/',
        commit: '',
        createdAt: doc.created_at,
        updatedAt: doc.updated_at || doc.created_at,
        lastPushedProvider: null,
        lastPushedAt: null,
        lastPushedUrl: null,
        processingStatus: 'completed',
        isOutdated: false,
      };
    });

    // TODO: Implement outdated checking for documents system
    // This would check document_files against repo_file_summaries to detect changes

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
