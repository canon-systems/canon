import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as { accessRequestId?: string };
    const { accessRequestId } = body;
    if (!accessRequestId) return NextResponse.json({ error: 'accessRequestId is required' }, { status: 400 });

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    // Verify the access request belongs to this org
    const { data: ar } = await supabase
      .from('access_requests')
      .select('id, requested_from_slack_id, new_hires!inner(organization_id)')
      .eq('id', accessRequestId)
      .eq('new_hires.organization_id', org.id)
      .single();

    if (!ar) return NextResponse.json({ error: 'Access request not found' }, { status: 404 });

    if (!ar.requested_from_slack_id) {
      return NextResponse.json({ error: 'No Slack ID for the tool owner — add one in Settings → Tools first.' }, { status: 422 });
    }

    await inngest.send({
      name: 'onboarding/access.request.created',
      data: { accessRequestId },
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/access-requests/send] POST failed', error);
    return NextResponse.json({ error: 'Failed to send request', detail: message }, { status: 500 });
  }
}
