import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

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
      .from<SubmissionRow>('submissions')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const filtered =
      data?.filter((doc: any) => {
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

    const items = paginated.map((doc: any) => {
      const sourceMeta = doc.source_meta || {};
      const approvalStatus = sourceMeta?.approval_status || 'pending_review';
      const pushMeta = sourceMeta?.push_metadata || {};

      return {
        id: doc.id,
        title: doc.title || 'Untitled',
        status: approvalStatus,
        repo: sourceMeta?.repoUrl || '',
        path: sourceMeta?.path || '/',
        commit: sourceMeta?.commit || '',
        createdAt: doc.created_at,
        updatedAt: doc.updated_at || doc.last_checked_at || doc.created_at,
        lastPushedProvider: pushMeta?.provider,
        lastPushedAt: pushMeta?.pushed_at,
        processingStatus: doc.status,
        isOutdated: doc.is_outdated || false,
      };
    });

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

