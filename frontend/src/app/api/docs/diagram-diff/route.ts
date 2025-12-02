import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

type SubmissionRow = {
  source_meta?: {
    repoUrl?: string;
  };
  created_by?: string;
};

type DiagramRow = {
  id: string;
  repo_url?: string;
  user_id?: string;
  detection_result?: {
    tools?: any[];
    connections?: any[];
  };
  diagram_markdown?: string;
};

type VersionRow = {
  detection_result?: {
    tools?: any[];
    connections?: any[];
  };
};

/**
 * GET: Get diagram diff
 * Proxies to FastAPI backend /api/diagram-diff?docId=...
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const docId = searchParams.get('docId');

    if (!docId) {
      return NextResponse.json({ error: 'docId is required' }, { status: 400 });
    }

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, repo_id')
      .eq('id', docId)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Verify user has access
    const { data: repo, error: repoError } = await supabase
      .from('workspace_repos')
      .select('repo_url, workspace_id')
      .eq('id', document.repo_id)
      .eq('workspace_id', user.id)
      .single();

    if (repoError || !repo) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const repoUrl = repo.repo_url;
    if (!repoUrl) {
      return NextResponse.json({
        doc_id: docId,
        has_diagram: false,
        added_nodes: [],
        removed_nodes: [],
        added_edges: [],
        removed_edges: [],
      });
    }

    const diagramResponse = await supabase
      .from('architecture_diagrams')
      .select('*')
      .eq('user_id', user.id)
      .eq('repo_url', repoUrl)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!diagramResponse || !diagramResponse.data) {
      return NextResponse.json({
        doc_id: docId,
        has_diagram: false,
        added_nodes: [],
        removed_nodes: [],
        added_edges: [],
        removed_edges: [],
      });
    }

    const diagram = diagramResponse.data as DiagramRow;
    const versionsResponse = await supabase
      .from('architecture_diagram_versions')
      .select('*')
      .eq('diagram_id', diagram.id)
      .order('created_at', { ascending: false })
      .limit(2);

    const versions = (versionsResponse?.data || []) as VersionRow[];
    const previousVersion = versions.length > 1 ? versions[1] : null;

    const currentTools = diagram.detection_result?.tools || [];
    const currentConnections = diagram.detection_result?.connections || [];

    const previousTools = previousVersion?.detection_result?.tools || [];
    const previousConnections = previousVersion?.detection_result?.connections || [];

    const previousToolNames = new Set(previousTools.map((tool: any) => tool.name));
    const currentToolNames = new Set(currentTools.map((tool: any) => tool.name));

    const addedNodes = currentTools.filter((tool: any) => !previousToolNames.has(tool.name));
    const removedNodes = previousTools.filter((tool: any) => !currentToolNames.has(tool.name));

    const serializeConnectionKey = (conn: any) => `${conn.from}->${conn.to}:${conn.label || ''}`;

    const previousConnKeys = new Set(previousConnections.map(serializeConnectionKey));
    const currentConnKeys = new Set(currentConnections.map(serializeConnectionKey));

    const addedEdges = currentConnections.filter((conn: any) => !previousConnKeys.has(serializeConnectionKey(conn)));
    const removedEdges = previousConnections.filter(
      (conn: any) => !currentConnKeys.has(serializeConnectionKey(conn))
    );

    return NextResponse.json({
      doc_id: docId,
      has_diagram: true,
      added_nodes: addedNodes,
      removed_nodes: removedNodes,
      added_edges: addedEdges,
      removed_edges: removedEdges,
      current_diagram_markdown: diagram.diagram_markdown,
    });
  } catch (err: any) {
    console.error('Get diagram diff error:', err);
    return NextResponse.json(
      {
        error: 'Failed to get diagram diff',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

