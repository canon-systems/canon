import { NextRequest, NextResponse } from 'next/server';
import { apiGet } from '@/lib/api/client';
import { getSession } from '@/lib/auth';

/**
 * GET: List available resources (pages, databases, etc.) for a provider
 * Proxies to FastAPI backend /api/push/{provider}/resources
 */
export async function GET(request: NextRequest) {
  try {
    const { user, session } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');

    if (!provider) {
      return NextResponse.json(
        { error: 'provider parameter is required' },
        { status: 400 }
      );
    }

    // Call backend API (requires authentication)
    const result = await apiGet<{
      success: boolean;
      resources: Array<{
        id: string;
        type: string;
        title: string;
        url?: string;
      }>;
    }>(
      `/api/push/${provider}/resources`,
      true, // Requires authentication
      session?.access_token || null
    );

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('List resources error:', err);
    return NextResponse.json(
      {
        error: 'Failed to list resources',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

