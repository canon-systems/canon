import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getArchitectureDiagram } from '@/lib/server/architecture/persistence';
import { exportDiagramToWorkspace } from '@/lib/server/architecture/exports';
import type { WorkspaceInfo } from '@/lib/server/workspaces/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { diagramId, workspaceProvider, workspaceInfo, connectionId, autoSync } = body;

    if (!diagramId || !workspaceProvider || !workspaceInfo || !connectionId) {
      return NextResponse.json(
        { error: 'Missing required fields: diagramId, workspaceProvider, workspaceInfo, connectionId' },
        { status: 400 }
      );
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

    const result = await exportDiagramToWorkspace(
      supabase,
      diagram,
      workspaceProvider,
      workspaceInfo as WorkspaceInfo,
      connectionId,
      autoSync === true
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Export failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      resourceId: result.resourceId,
    });
  } catch (err: any) {
    console.error('Error exporting diagram:', err);
    return NextResponse.json(
      {
        error: 'Failed to export diagram',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}


