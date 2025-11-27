import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getWorkspaceProvider } from '@/lib/server/workspaces/workspaceFactory';
import { WorkspaceInfo, WorkspaceContent } from '@/lib/server/workspaces/base';
import { trackPushToKb } from '@/lib/server/services/usageTracking';

type PushRequestBody = {
  docId?: string | null;
  title: string;
  markdown: string;
  workspaceInfo?: {
    resourceId?: string | null;
    metadata?: Record<string, unknown> | null;
    html?: string | null;
  };
  createNew?: boolean;
};

/**
 * POST: Push documentation to Notion
 * Proxies to FastAPI backend /api/push/notion
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const body = (await request.json()) as PushRequestBody;
    const { docId, title, markdown, workspaceInfo, createNew = true } = body;

    if (!title || !markdown) {
      return NextResponse.json({ error: 'title and markdown are required' }, { status: 400 });
    }

    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('provider', 'notion')
      .eq('status', 'active')
      .single();

    if (!connection || !connection.connection_id) {
      return NextResponse.json({ error: 'Notion connection not found' }, { status: 404 });
    }

    const provider = getWorkspaceProvider('notion');
    if (!provider) {
      return NextResponse.json({ error: 'Notion provider unavailable' }, { status: 500 });
    }

    const workspace: WorkspaceInfo = {
      provider: 'notion',
      resourceId: workspaceInfo?.resourceId || '',
      metadata: workspaceInfo?.metadata || null,
    };

    const content: WorkspaceContent = {
      title,
      markdown,
      html: workspaceInfo?.html || undefined,
    };

    const pushResult = await provider.pushContent(
      workspace,
      content,
      connection.connection_id,
      createNew !== false
    );

    if (!pushResult) {
      return NextResponse.json({ error: 'Failed to push to Notion' }, { status: 500 });
    }

    if (docId) {
      const { data: existingSubmission } = await supabase
        .from('submissions')
        .select('source_meta')
        .eq('id', docId)
        .single();

      const existingMeta = existingSubmission?.source_meta || {};
      existingMeta.push_metadata = {
        provider: 'notion',
        pushed_at: new Date().toISOString(),
        url: pushResult.metadata?.url || null,
        resource_id: pushResult.resourceId,
      };

      await supabase
        .from('submissions')
        .update({
          source_meta: existingMeta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', docId);
    }

    await trackPushToKb(supabase, user.id, 'notion', docId || null, pushResult.resourceId);

    return NextResponse.json(
      {
        success: true,
        resource_id: pushResult.resourceId,
        url: pushResult.metadata?.url,
        workspace_info: pushResult,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Push to Notion error:', err);
    return NextResponse.json(
      {
        error: 'Failed to push to Notion',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}

