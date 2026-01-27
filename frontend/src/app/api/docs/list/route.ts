import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
// Removed unused imports

// Removed unused type: SubmissionRow

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

    // Get sources that belong to the user
    const { data: userSources } = await supabase
      .from('workspace_sources')
      .select('id, repo_url, external_url, name, default_branch')
      .eq('user_id', user.id);

    const sourceIds = userSources?.map((r) => r.id) || [];

    if (sourceIds.length === 0) {
      return NextResponse.json(
        {
          items: [],
          pagination: { page, pageSize, total: 0 },
          pendingTotal: 0,
        },
        { status: 200 }
      );
    }

    const { data, error } = await supabase
      .from('documents')
      .select('id, title, content, source_id, created_at, updated_at')
      .in('source_id', sourceIds)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const repoMap = new Map(
      (userSources || []).map((r) => [
        r.id,
        {
          repo_url: r.repo_url || r.external_url,
          name: r.name,
          default_branch: r.default_branch,
        },
      ])
    );

    const documents = data || [];
    const filtered = documents.filter((doc: {
      id: string;
      source_id: string;
      title?: string;
      created_at?: string;
      updated_at?: string;
    }) => {
      const sourceId = doc.source_id;
      const repo = repoMap.get(sourceId);
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

    const paginatedIds = paginated.map((doc: { id: string }) => doc.id);
    const pendingMap = new Map<string, { id: string; created_at?: string | null }>();

    if (paginatedIds.length > 0) {
      const { data: pendingRequests } = await supabase
        .from('document_versions')
        .select('id, document_id, created_at')
        .in('document_id', paginatedIds)
        .eq('status', 'pending');

      for (const request of pendingRequests || []) {
        const existing = pendingMap.get(request.document_id);
        if (!existing || (request.created_at && existing.created_at && request.created_at > existing.created_at)) {
          pendingMap.set(request.document_id, {
            id: request.id,
            created_at: request.created_at,
          });
        }
      }
    }

    let pendingTotal = 0;
    const filteredIds = filtered.map((doc: { id: string }) => doc.id);
    if (filteredIds.length > 0) {
      const { count } = await supabase
        .from('document_versions')
        .select('id', { count: 'exact', head: true })
        .in('document_id', filteredIds)
        .eq('status', 'pending');
      pendingTotal = count || 0;
    }

    // Return list immediately with stored values
    const items = paginated.map((doc: {
      id: string;
      source_id: string;
      title?: string;
      created_at?: string;
      updated_at?: string;
    }) => {
      const sourceId = doc.source_id;
      const repo = repoMap.get(sourceId);
      const pending = pendingMap.get(doc.id);

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
        needsReview: Boolean(pending),
        reviewId: pending?.id || null,
        reviewCreatedAt: pending?.created_at || null,
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
        pendingTotal,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error('List docs error:', err);
    return NextResponse.json(
      {
        error: 'Failed to list documents',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
