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
  };
  createNew?: boolean;
  forceNew?: boolean; // Explicitly force creating a new page even if one exists
};

/**
 * POST: Push documentation to Confluence
 * Automatically updates existing page if the doc was previously pushed to Confluence
 * Falls back to creating a new page if the existing page was deleted
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const body = (await request.json()) as PushRequestBody;
    const { docId, title, markdown, workspaceInfo, forceNew = false } = body;
    let { createNew = true } = body;

    if (!title || !markdown) {
      return NextResponse.json({ error: 'title and markdown are required' }, { status: 400 });
    }

    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('provider', 'confluence')
      .eq('status', 'active')
      .single();

    if (!connection || !connection.connection_id) {
      return NextResponse.json({ error: 'Confluence connection not found' }, { status: 404 });
    }

    const provider = getWorkspaceProvider('confluence');
    if (!provider) {
      return NextResponse.json({ error: 'Confluence provider unavailable' }, { status: 500 });
    }

    // Check if this doc was previously pushed to Confluence
    // If so, try to update the existing page instead of creating a new one
    let existingResourceId: string | null = null;
    let existingUrl: string | null = null;
    let existingMetadata: Record<string, unknown> | undefined;
    let attemptedUpdate = false;

    if (docId && !forceNew) {
      const { data: existingDocument } = await supabase
        .from('documents')
        .select('kb_id, kb_provider')
        .eq('id', docId)
        .single();

      // Check if this doc was previously pushed to Confluence
      if (existingDocument?.kb_provider === 'confluence' && existingDocument?.kb_id) {
        existingResourceId = existingDocument.kb_id;
        createNew = false; // Try to update instead of create
        attemptedUpdate = true;
        console.log(`[Confluence Push] Attempting to update existing page ${existingResourceId} for doc ${docId}`);
      }
    }

    const content: WorkspaceContent = {
      title,
      markdown,
    };

    let pushResult = null;

    // Try to update existing page first if we have a resource ID
    if (!createNew && existingResourceId) {
      const updateWorkspace: WorkspaceInfo = {
        provider: 'confluence',
        resourceId: existingResourceId,
        metadata: existingMetadata || (workspaceInfo?.metadata ?? undefined),
      };

      pushResult = await provider.pushContent(
        updateWorkspace,
        content,
        connection.connection_id,
        false // createNew = false (update)
      );

      // If update failed (page might have been deleted), fall back to creating new
      if (!pushResult) {
        console.log(`[Confluence Push] Update failed for page ${existingResourceId}, falling back to create new`);
        createNew = true;
        existingResourceId = null;
      }
    }

    // Create new page if needed
    if (createNew || !pushResult) {
      const createWorkspace: WorkspaceInfo = {
        provider: 'confluence',
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
      return NextResponse.json({ error: 'Failed to push to Confluence' }, { status: 500 });
    }

    // Update document with push metadata
    if (docId) {
      await supabase
        .from('documents')
        .update({
          kb_provider: 'confluence',
          kb_id: pushResult.resourceId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', docId);
    }

    await trackPushToKb(supabase, user.id, 'confluence', docId || null, pushResult.resourceId);

    return NextResponse.json(
      {
        success: true,
        resource_id: pushResult.resourceId,
        url: pushResult.metadata?.url,
        workspace_info: pushResult,
        updated: attemptedUpdate && !createNew, // True only if we successfully updated existing page
        recreated: attemptedUpdate && createNew, // True if we fell back to creating new after update failed
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Push to Confluence error:', err);
    return NextResponse.json(
      {
        error: 'Failed to push to Confluence',
        detail: err.message || String(err),
      },
      { status: 500 }
    );
  }
}
