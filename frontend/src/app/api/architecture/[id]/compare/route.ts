import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getArchitectureDiagram } from '@/lib/server/architecture/persistence';
import { getDiagramVersion, compareVersions } from '@/lib/server/architecture/versions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { versionId1, versionId2 } = body;

    if (!versionId1 || !versionId2) {
      return NextResponse.json({ error: 'Missing versionId1 or versionId2' }, { status: 400 });
    }

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

    const version1 = await getDiagramVersion(supabase, versionId1);
    const version2 = await getDiagramVersion(supabase, versionId2);

    if (!version1 || !version2) {
      return NextResponse.json({ error: 'One or both versions not found' }, { status: 404 });
    }

    // Ensure versions belong to this diagram
    if (version1.diagram_id !== id || version2.diagram_id !== id) {
      return NextResponse.json({ error: 'Versions do not belong to this diagram' }, { status: 400 });
    }

    const comparison = compareVersions(version1, version2);

    return NextResponse.json({
      comparison,
      version1: {
        id: version1.id,
        version_number: version1.version_number,
        created_at: version1.created_at,
      },
      version2: {
        id: version2.id,
        version_number: version2.version_number,
        created_at: version2.created_at,
      },
    });
  } catch (err: any) {
    console.error('Error comparing versions:', err);
    return NextResponse.json(
      {
        error: 'Failed to compare versions',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}


