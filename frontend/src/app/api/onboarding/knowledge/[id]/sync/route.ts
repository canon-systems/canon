import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';

export const dynamic = 'force-dynamic';

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
      .select('id')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single();

    if (!source) return NextResponse.json({ error: 'Knowledge source not found' }, { status: 404 });

    await supabase
      .from('knowledge_sources')
      .update({ status: 'pending', error_message: null })
      .eq('id', id);

    await inngest.send({
      name: 'onboarding/knowledge.sync.requested',
      data: { sourceId: id, organizationId: org.id },
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/knowledge/:id/sync] POST failed', error);
    return NextResponse.json({ error: 'Failed to trigger sync', detail: message }, { status: 500 });
  }
}
