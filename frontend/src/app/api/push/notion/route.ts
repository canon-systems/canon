import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { getWorkspaceProvider } from '@/lib/server/workspaces/workspaceFactory';
import { WorkspaceInfo, WorkspaceContent } from '@/lib/server/workspaces/base';
import { trackPushToKb } from '@/lib/server/services/usageTracking';

type PushRequestBody = {
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
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const body = (await request.json()) as PushRequestBody;
    const { title, markdown, workspaceInfo } = body;
    let existingResourceId: string | null = workspaceInfo?.resourceId ?? null;
    let createNew = body.createNew ?? !existingResourceId;

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

    const content: WorkspaceContent = {
      title,
      markdown,
      html: workspaceInfo?.html || undefined,
    };

    let pushResult = null;

    // Try to update existing page first if we have a resource ID
    if (!createNew && existingResourceId) {
      const updateWorkspace: WorkspaceInfo = {
        provider: 'notion',
        resourceId: existingResourceId,
        metadata: workspaceInfo?.metadata ?? undefined,
      };

      pushResult = await provider.pushContent(
        updateWorkspace,
        content,
        connection.connection_id,
        false // createNew = false (update)
      );

      // If update failed (page might have been deleted), fall back to creating new
      if (!pushResult) {
        console.log(`[Notion Push] Update failed for page ${existingResourceId}, falling back to create new`);
        createNew = true;
        existingResourceId = null;
      }
    }

    // Create new page if needed
    if (createNew || !pushResult) {
      const createWorkspace: WorkspaceInfo = {
        provider: 'notion',
        resourceId: workspaceInfo?.resourceId || '',
        metadata: workspaceInfo?.metadata ?? undefined,
      };

      pushResult = await provider.pushContent(
        createWorkspace,
        content,
        connection.connection_id,
        true // createNew = true
      );
    }

    if (!pushResult) {
      return NextResponse.json({ error: 'Failed to push to Notion' }, { status: 500 });
    }

    await trackPushToKb(supabase, user.id, 'notion', null, pushResult.resourceId);

    // Construct Notion URL if not provided in metadata
    let notionUrl = pushResult.metadata?.url;
    if (!notionUrl && pushResult.resourceId) {
      const pageIdWithoutDashes = pushResult.resourceId.replace(/-/g, '');
      notionUrl = `https://notion.so/${pageIdWithoutDashes}`;
    }

    return NextResponse.json(
      {
        success: true,
        resource_id: pushResult.resourceId,
        url: notionUrl,
        workspace_info: pushResult,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error('Push to Notion error:', err);
    return NextResponse.json(
      {
        error: 'Failed to push to Notion',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
