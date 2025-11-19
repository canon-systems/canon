import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getArchitectureDiagram } from '@/lib/server/architecture/persistence';
import { removeDiagramExport, updateExportAutoSync, syncDiagramExport } from '@/lib/server/architecture/exports';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ exportId: string }> }
) {
  try {
    const { exportId } = await params;
    const { searchParams } = new URL(request.url);
    const diagramId = searchParams.get('diagramId');

    if (!diagramId) {
      return NextResponse.json({ error: 'Missing diagramId parameter' }, { status: 400 });
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

    const exportIndex = parseInt(exportId, 10);
    if (isNaN(exportIndex) || exportIndex < 0 || exportIndex >= (diagram.exports || []).length) {
      return NextResponse.json({ error: 'Invalid export index' }, { status: 400 });
    }

    const success = await removeDiagramExport(supabase, diagram, exportIndex);

    if (!success) {
      return NextResponse.json({ error: 'Failed to remove export' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting export:', err);
    return NextResponse.json(
      {
        error: 'Failed to delete export',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ exportId: string }> }
) {
  try {
    const { exportId } = await params;
    const body = await request.json();
    const { diagramId, autoSync, sync } = body;

    if (!diagramId) {
      return NextResponse.json({ error: 'Missing diagramId' }, { status: 400 });
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

    const exportIndex = parseInt(exportId, 10);
    if (isNaN(exportIndex) || exportIndex < 0 || exportIndex >= (diagram.exports || []).length) {
      return NextResponse.json({ error: 'Invalid export index' }, { status: 400 });
    }

    // Handle sync request
    if (sync === true) {
      // Get connection ID from exports
      const exports = diagram.exports || [];
      const diagramExport = exports[exportIndex];
      if (!diagramExport) {
        return NextResponse.json({ error: 'Export not found' }, { status: 404 });
      }

      // Get connection ID from oauth_connections
      const { data: connection } = await supabase
        .from('oauth_connections')
        .select('connection_id')
        .eq('user_id', user.id)
        .eq('provider', diagramExport.provider)
        .single();

      if (!connection) {
        return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
      }

      const syncResult = await syncDiagramExport(
        supabase,
        diagram,
        exportIndex,
        connection.connection_id
      );

      if (!syncResult.success) {
        return NextResponse.json({ error: syncResult.error || 'Sync failed' }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Handle autoSync update
    if (typeof autoSync === 'boolean') {
      const success = await updateExportAutoSync(supabase, diagram, exportIndex, autoSync);

      if (!success) {
        return NextResponse.json({ error: 'Failed to update autoSync' }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  } catch (err: any) {
    console.error('Error updating export:', err);
    return NextResponse.json(
      {
        error: 'Failed to update export',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

