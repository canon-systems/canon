import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { inngest } from '@/inngest/client';
import { createLogger, errorMessage } from '@/lib/server/logging';
import { requireWorkspace } from '@/lib/server/organization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const log = createLogger('api.integrations.granola.sync', {
  label: 'Granola Sync API',
  eventLabels: {
    sync_requested: 'Sync Requested',
    source_created: 'Source Created',
    sync_queued: 'Sync Queued',
    sync_failed: 'Sync Failed',
  },
});

type KnowledgeSourceRow = {
  id: string;
  name: string;
  status: string;
};

export async function POST() {
  try {
    const { user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { supabase, organization } = await requireWorkspace(user);

    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('provider', 'granola')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!connection?.connection_id) {
      return NextResponse.json({ error: 'Connect Granola before syncing transcripts' }, { status: 409 });
    }

    log.info('sync_requested', {
      userId: user.id,
      organizationId: organization.id,
      connectionId: connection.connection_id,
    });

    const { data: existingSources, error: sourceLookupError } = await supabase
      .from('knowledge_sources')
      .select('id, name, status')
      .eq('organization_id', organization.id)
      .eq('provider', 'granola')
      .order('created_at', { ascending: true })
      .limit(1);

    if (sourceLookupError) throw sourceLookupError;

    let source = (existingSources?.[0] ?? null) as KnowledgeSourceRow | null;

    if (!source) {
      const { data: inserted, error: insertError } = await supabase
        .from('knowledge_sources')
        .insert({
          organization_id: organization.id,
          provider: 'granola',
          name: 'Granola transcripts',
          status: 'pending',
        })
        .select('id, name, status')
        .single();

      if (insertError) throw insertError;
      source = inserted as KnowledgeSourceRow;
      log.info('source_created', {
        userId: user.id,
        organizationId: organization.id,
        sourceId: source.id,
      });
    } else {
      const shouldRenameLegacyGranolaSource = source.name === 'Granola meeting notes';
      const { error: updateError } = await supabase
        .from('knowledge_sources')
        .update({
          status: 'pending',
          error_message: null,
          ...(shouldRenameLegacyGranolaSource ? { name: 'Granola transcripts' } : {}),
        })
        .eq('id', source.id)
        .eq('organization_id', organization.id);

      if (updateError) throw updateError;
    }

    await inngest.send({
      name: 'onboarding/knowledge.sync.requested',
      data: { sourceId: source.id, organizationId: organization.id },
    });

    log.info('sync_queued', {
      userId: user.id,
      organizationId: organization.id,
      sourceId: source.id,
    });

    return NextResponse.json({ ok: true, sourceId: source.id, status: 'queued' });
  } catch (error) {
    const detail = errorMessage(error);
    log.error('sync_failed', { error: detail });
    return NextResponse.json({ error: 'Failed to queue Granola sync', detail }, { status: 500 });
  }
}
