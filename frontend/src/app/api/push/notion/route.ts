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
  forceNew?: boolean; // Explicitly force creating a new page even if one exists
};

/**
 * POST: Push documentation to Notion
 * Automatically updates existing page if the doc was previously pushed to Notion
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

    // Check if this doc was previously pushed to Notion
    // If so, try to update the existing page instead of creating a new one
    let existingResourceId: string | null = null;
    let existingUrl: string | null = null;
    let attemptedUpdate = false;

    if (docId && !forceNew) {
      const { data: existingSubmission } = await supabase
        .from('submissions')
        .select('source_meta')
        .eq('id', docId)
        .single();

      const existingMeta = existingSubmission?.source_meta || {};
      const pushMeta = existingMeta.push_metadata;

      // Check if this doc was previously pushed to Notion
      if (pushMeta?.provider === 'notion' && pushMeta?.resource_id) {
        existingResourceId = pushMeta.resource_id;
        existingUrl = pushMeta.url || null;
        createNew = false; // Try to update instead of create
        attemptedUpdate = true;
        console.log(`[Notion Push] Attempting to update existing page ${existingResourceId} for doc ${docId}`);
      }
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

    // Update submission with push metadata
    if (docId) {
      const { data: currentSubmission } = await supabase
        .from('submissions')
        .select('source_meta')
        .eq('id', docId)
        .single();

      const existingMeta = currentSubmission?.source_meta || {};
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
        updated: attemptedUpdate && !createNew, // True only if we successfully updated existing page
        recreated: attemptedUpdate && createNew, // True if we fell back to creating new after update failed
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
