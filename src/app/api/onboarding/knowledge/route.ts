import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { inngest } from '@/inngest/client';
import { hasNangoApiKey, listNangoConnectionsForOrganization, providerForNangoIntegration } from '@/lib/server/integrations/nango';
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

type KnowledgeSourceRow = {
  id: string;
  name: string;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
  provider: string;
  status: string;
};

async function hasActiveGranolaConnection(params: {
  supabase: Awaited<ReturnType<typeof requireWorkspace>>['supabase'];
  organizationId: string;
}) {
  const { data: connection } = await params.supabase
    .from('oauth_connections')
    .select('connection_id')
    .eq('organization_id', params.organizationId)
    .eq('provider', 'granola')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connection?.connection_id) return true;
  if (!hasNangoApiKey()) return false;

  const nangoConnections = await listNangoConnectionsForOrganization({
    organizationId: params.organizationId,
  });

  return nangoConnections.some((nangoConnection) => {
    const provider = providerForNangoIntegration(nangoConnection.provider_config_key);
    const hasAuthError = (nangoConnection.errors ?? []).some((error) => error.type === 'auth');
    return provider === 'granola' && !hasAuthError;
  });
}

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

    const requestedProvider = typeof body.provider === 'string' ? body.provider : 'slack';
    const provider = requestedProvider.trim().toLowerCase();
    if (!['slack', 'granola'].includes(provider)) {
      return NextResponse.json({ error: 'Unsupported knowledge provider' }, { status: 400 });
    }

    const { slack_channel_id, slack_channel_name, name } = body;
    if (provider === 'slack' && !slack_channel_id) {
      return NextResponse.json({ error: 'slack_channel_id is required' }, { status: 400 });
    }

    const { supabase, organization } = await requireWorkspace(user);

    if (provider === 'granola') {
      const granolaConnected = await hasActiveGranolaConnection({
        supabase,
        organizationId: organization.id,
      });

      if (!granolaConnected) {
        return NextResponse.json({ error: 'Connect Granola before adding transcripts' }, { status: 409 });
      }

      const { data: existingSources, error: lookupError } = await supabase
        .from('knowledge_sources')
        .select('id, name, slack_channel_id, slack_channel_name, provider, status')
        .eq('organization_id', organization.id)
        .eq('provider', 'granola')
        .order('created_at', { ascending: true })
        .limit(1);

      if (lookupError) throw lookupError;

      let source = (existingSources?.[0] ?? null) as KnowledgeSourceRow | null;
      let sourceCreated = false;

      if (source) {
        const shouldRenameLegacyGranolaSource = source.name === 'Granola meeting notes';
        const { data: updatedSource, error: updateError } = await supabase
          .from('knowledge_sources')
          .update({
            status: 'pending',
            error_message: null,
            ...(shouldRenameLegacyGranolaSource ? { name: 'Granola transcripts' } : {}),
          })
          .eq('id', source.id)
          .eq('organization_id', organization.id)
          .select('id, name, slack_channel_id, slack_channel_name, provider, status')
          .single();

        if (updateError) throw updateError;
        source = updatedSource as KnowledgeSourceRow;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('knowledge_sources')
          .insert({
            organization_id: organization.id,
            provider: 'granola',
            name: name || 'Granola transcripts',
            status: 'pending',
          })
          .select('id, name, slack_channel_id, slack_channel_name, provider, status')
          .single();

        if (insertError || !inserted) {
          log.error('source_create_failed', {
            userId: user.id,
            organizationId: organization.id,
            provider,
            error: insertError?.message || 'insert_failed',
          });
          throw insertError ?? new Error('Insert failed');
        }

        source = inserted as KnowledgeSourceRow;
        sourceCreated = true;
      }

      log.info('source_created', {
        userId: user.id,
        organizationId: organization.id,
        sourceId: source.id,
        provider: source.provider,
        channel: source.name,
        channelId: null,
        status: source.status,
        reusedExisting: !sourceCreated,
      });

      await inngest.send({
        name: 'onboarding/knowledge.sync.requested',
        data: { sourceId: source.id, organizationId: organization.id },
      });

      log.info('sync_queued', {
        sourceId: source.id,
        channel: source.name,
        channelId: null,
        provider: source.provider,
        organizationId: organization.id,
        reason: 'source_created',
      });

      return NextResponse.json({ source }, { status: sourceCreated ? 201 : 200 });
    }

    const { data: source, error } = await supabase
      .from('knowledge_sources')
      .insert({
        organization_id: organization.id,
        provider,
        name: name || slack_channel_name || slack_channel_id || provider,
        slack_channel_id,
        slack_channel_name: slack_channel_name || null,
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
