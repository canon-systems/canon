import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/server/logging';

export const dynamic = 'force-dynamic';

const STOPPABLE_STATUSES = new Set(['pending', 'syncing']);

const log = createLogger('api.onboarding.knowledge.source', {
  label: 'Knowledge Source API',
  eventLabels: {
    source_renamed: 'Source Renamed',
    source_stopped_before_delete: 'Source Stopped Before Delete',
    source_deleted: 'Source Deleted',
  },
});

async function getOrganizationId(userId: string) {
  const supabase = await createClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('owner_id', userId)
    .single();

  return { supabase, organizationId: org?.id as string | undefined };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = (await request.json()) as { name?: string };
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const { supabase, organizationId } = await getOrganizationId(user.id);
    if (!organizationId) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { data: source, error } = await supabase
      .from('knowledge_sources')
      .update({ name })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error || !source) {
      return NextResponse.json({ error: 'Knowledge source not found or update failed' }, { status: 404 });
    }

    log.info('source_renamed', {
      userId: user.id,
      organizationId,
      sourceId: source.id,
      name: source.name,
      channel: source.slack_channel_name || source.name,
      channelId: source.slack_channel_id,
    });

    return NextResponse.json({ source });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/knowledge/:id] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to update knowledge source', detail: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { supabase, organizationId } = await getOrganizationId(user.id);
    if (!organizationId) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { data: source } = await supabase
      .from('knowledge_sources')
      .select('id, name, slack_channel_id, slack_channel_name, status')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (!source) {
      return NextResponse.json({ error: 'Knowledge source not found' }, { status: 404 });
    }

    if (STOPPABLE_STATUSES.has(source.status)) {
      await supabase
        .from('knowledge_sources')
        .update({ status: 'stopped', error_message: null })
        .eq('id', id)
        .eq('organization_id', organizationId);

      log.info('source_stopped_before_delete', {
        userId: user.id,
        organizationId,
        sourceId: source.id,
        channel: source.slack_channel_name || source.name,
        channelId: source.slack_channel_id,
        previousStatus: source.status,
      });
    }

    const { error } = await supabase
      .from('knowledge_sources')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      return NextResponse.json({ error: 'Knowledge source not found or delete failed' }, { status: 404 });
    }

    log.info('source_deleted', {
      userId: user.id,
      organizationId,
      sourceId: source.id,
      channel: source.slack_channel_name || source.name,
      channelId: source.slack_channel_id,
      previousStatus: source.status,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/knowledge/:id] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to delete knowledge source', detail: message }, { status: 500 });
  }
}
