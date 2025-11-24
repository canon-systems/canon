import { NextRequest, NextResponse } from 'next/server';
import { apiGet } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

/**
 * GET: List documents with filtering and pagination
 * Proxies to FastAPI backend /api/docs
 */
export async function GET(request: NextRequest) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const repo = searchParams.get('repo');
    const search = searchParams.get('search');
    const page = searchParams.get('page') || '1';
    const pageSize = searchParams.get('pageSize') || '20';

    const queryParams = new URLSearchParams({ page, pageSize });
    if (status) queryParams.append('status', status);
    if (repo) queryParams.append('repo', repo);
    if (search) queryParams.append('search', search);

    const result = await apiGet<{
      items: Array<{
        id: string;
        title: string;
        status: string;
        repo: string;
        path: string;
        commit: string;
        createdAt: string;
        updatedAt: string;
        lastPushedProvider?: string;
        lastPushedAt?: string;
        processingStatus: string;
        isOutdated: boolean;
      }>;
      pagination: {
        page: number;
        pageSize: number;
        total: number;
      };
    }>(
      `/api/docs?${queryParams.toString()}`,
      true,
      session?.access_token || null
    );

    return NextResponse.json(result, { status: 200 });
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

