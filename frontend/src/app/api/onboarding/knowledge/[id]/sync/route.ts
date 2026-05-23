import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';
import { createLogger } from '@/lib/server/logging';

export const dynamic = 'force-dynamic';

const log = createLogger('api.onboarding.knowledge.sync', {
  label: 'Knowledge Sync API',
  eventLabels: {
    sync_queued: 'Sync Queued',
    sync_queue_failed: 'Sync Queue Failed',
    sync_stop_requested: 'Sync Stop Requested',
  },
});

const STOPPABLE_STATUSES = new Set(['pending', 'syncing']);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const supabase = await createClient();

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { data: source } = await supabase
      .from('knowledge_sources')
      .select('id, name, slack_channel_id, slack_channel_name')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single();

    if (!source) return NextResponse.json({ error: 'Knowledge source not found' }, { status: 404 });

    const { error: statusError } = await supabase
      .from('knowledge_sources')
      .update({ status: 'pending', error_message: null })
      .eq('id', id);

    if (statusError) {
      log.error('sync_queue_failed', {
        sourceId: source.id,
        channel: source.slack_channel_name || source.name,
        channelId: source.slack_channel_id,
        organizationId: org.id,
        userId: user.id,
        operation: 'mark_pending',
        error: statusError.message,
      });
      throw statusError;
    }

    try {
      await inngest.send({
        name: 'onboarding/knowledge.sync.requested',
        data: { sourceId: id, organizationId: org.id },
      });
    } catch (queueError) {
      log.error('sync_queue_failed', {
        sourceId: source.id,
        channel: source.slack_channel_name || source.name,
        channelId: source.slack_channel_id,
        organizationId: org.id,
        userId: user.id,
        operation: 'inngest_send',
        error: queueError instanceof Error ? queueError.message : String(queueError),
      });
      throw queueError;
    }

    log.info('sync_queued', {
      sourceId: source.id,
      channel: source.slack_channel_name || source.name,
      channelId: source.slack_channel_id,
      organizationId: org.id,
      userId: user.id,
      reason: 'manual_sync',
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/knowledge/:id/sync] POST failed', error);
    return NextResponse.json({ error: 'Failed to trigger sync', detail: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const supabase = await createClient();

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { data: source } = await supabase
      .from('knowledge_sources')
      .select('id, name, slack_channel_id, slack_channel_name, status, chunk_count')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single();

    if (!source) return NextResponse.json({ error: 'Knowledge source not found' }, { status: 404 });

    if (!STOPPABLE_STATUSES.has(source.status)) {
      return NextResponse.json({ ok: true, stopped: false });
    }

    await supabase
      .from('knowledge_sources')
      .update({ status: 'stopped', error_message: null })
      .eq('id', source.id)
      .eq('organization_id', org.id);

    log.info('sync_stop_requested', {
      sourceId: source.id,
      channel: source.slack_channel_name || source.name,
      channelId: source.slack_channel_id,
      organizationId: org.id,
      userId: user.id,
      previousStatus: source.status,
      nextStatus: 'stopped',
    });

    return NextResponse.json({ ok: true, stopped: true, status: 'stopped' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/knowledge/:id/sync] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to stop sync', detail: message }, { status: 500 });
  }
}
