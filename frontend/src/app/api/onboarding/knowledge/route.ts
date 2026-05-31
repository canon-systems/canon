import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { inngest } from '@/inngest/client';
import { createLogger } from '@/lib/server/logging';
import { requireWorkspace } from '@/lib/server/organization';

export const dynamic = 'force-dynamic';

const log = createLogger('api.onboarding.knowledge', {
  label: 'Knowledge API',
  eventLabels: {
    sources_loaded: 'Sources Loaded',
    source_created: 'Source Created',
    sync_queued: 'Sync Queued',
    source_create_failed: 'Source Create Failed',
  },
});

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { supabase, organization } = await requireWorkspace(user);

    const { data: sources, error } = await supabase
      .from('knowledge_sources')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    log.info('sources_loaded', {
      userId: user.id,
      organizationId: organization.id,
      sourceCount: sources?.length ?? 0,
    });
    return NextResponse.json({ sources: sources ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/knowledge] GET failed', error);
    return NextResponse.json({ error: 'Failed to load knowledge sources', detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as {
      provider?: string;
      slack_channel_id?: string;
      slack_channel_name?: string;
      name?: string;
    };

    const provider = typeof body.provider === 'string' ? body.provider : 'slack';
    const { slack_channel_id, slack_channel_name, name } = body;
    if (provider === 'slack' && !slack_channel_id) {
      return NextResponse.json({ error: 'slack_channel_id is required' }, { status: 400 });
    }

    if (provider !== 'slack' && provider !== 'gong') {
      return NextResponse.json({ error: 'Unsupported knowledge provider' }, { status: 400 });
    }

    const { supabase, organization } = await requireWorkspace(user);

    if (provider === 'gong') {
      const { data: connection } = await supabase
        .from('oauth_connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', 'gong')
        .eq('status', 'active')
        .maybeSingle();

      if (!connection) {
        return NextResponse.json({ error: 'Connect Gong before adding it as a knowledge source' }, { status: 400 });
      }

      const { data: existingGongSource } = await supabase
        .from('knowledge_sources')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('provider', 'gong')
        .limit(1)
        .maybeSingle();

      if (existingGongSource) {
        return NextResponse.json({ error: 'Gong is already added as a knowledge source' }, { status: 409 });
      }
    }

    const { data: source, error } = await supabase
      .from('knowledge_sources')
      .insert({
        organization_id: organization.id,
        provider,
        name: name || slack_channel_name || slack_channel_id || 'Gong Calls',
        slack_channel_id: provider === 'slack' ? slack_channel_id : null,
        slack_channel_name: provider === 'slack' ? slack_channel_name || null : null,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !source) {
      log.error('source_create_failed', {
        userId: user.id,
        organizationId: organization.id,
        channel: slack_channel_name || name || slack_channel_id,
        channelId: slack_channel_id,
        error: error?.message || 'insert_failed',
      });
      throw error ?? new Error('Insert failed');
    }

    log.info('source_created', {
      userId: user.id,
      organizationId: organization.id,
      sourceId: source.id,
      provider: source.provider,
      channel: source.slack_channel_name || source.name,
      channelId: source.slack_channel_id,
      status: source.status,
    });

    await inngest.send({
      name: 'onboarding/knowledge.sync.requested',
      data: { sourceId: source.id, organizationId: organization.id },
    });

    log.info('sync_queued', {
      sourceId: source.id,
      channel: source.slack_channel_name || source.name,
      channelId: source.slack_channel_id,
      provider: source.provider,
      organizationId: organization.id,
      reason: 'source_created',
    });

    return NextResponse.json({ source }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/knowledge] POST failed', error);
    return NextResponse.json({ error: 'Failed to create knowledge source', detail: message }, { status: 500 });
  }
}
