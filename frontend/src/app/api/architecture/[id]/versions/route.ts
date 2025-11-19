import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getArchitectureDiagram } from '@/lib/server/architecture/persistence';
import { getDiagramVersions, getDiagramVersion, getVersionHistory } from '@/lib/server/architecture/versions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const versionId = searchParams.get('versionId');
    const includeHistory = searchParams.get('includeHistory') === 'true';

    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const diagram = await getArchitectureDiagram(supabase, id);

    if (!diagram) {
      return NextResponse.json({ error: 'Diagram not found' }, { status: 404 });
    }

    if (diagram.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get specific version
    if (versionId) {
      const version = await getDiagramVersion(supabase, versionId);
      if (!version) {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      }
      return NextResponse.json({ version });
    }

    // Get all versions
    if (includeHistory) {
      const history = await getVersionHistory(supabase, id);
      return NextResponse.json(history);
    }

    const versions = await getDiagramVersions(supabase, id);
    return NextResponse.json({ versions });
  } catch (err: any) {
    console.error('Error fetching diagram versions:', err);
    return NextResponse.json(
      {
        error: 'Failed to fetch versions',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}


