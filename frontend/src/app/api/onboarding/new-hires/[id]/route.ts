import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
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

    const { data: hire, error: hireError } = await supabase
      .from('new_hires')
      .select('*')
      .eq('id', id)
      .eq('organization_id', org.id)
      .single();

    if (hireError || !hire) return NextResponse.json({ error: 'New hire not found' }, { status: 404 });

    const { data: deliveries } = await supabase
      .from('ramp_deliveries')
      .select('*, milestone:ramp_milestones(*)')
      .eq('new_hire_id', id)
      .order('created_at', { ascending: false });

    const { data: accessRequests } = await supabase
      .from('access_requests')
      .select('*')
      .eq('new_hire_id', id)
      .order('created_at', { ascending: true });

    // Find next upcoming milestone
    const { data: orgMilestones } = await supabase
      .from('ramp_milestones')
      .select('*')
      .eq('organization_id', org.id)
      .eq('role', hire.role)
      .gt('day_trigger', hire.ramp_day)
      .order('day_trigger', { ascending: true })
      .limit(1);

    const { data: globalMilestones } = await supabase
      .from('ramp_milestones')
      .select('*')
      .is('organization_id', null)
      .eq('role', hire.role)
      .gt('day_trigger', hire.ramp_day)
      .order('day_trigger', { ascending: true })
      .limit(1);

    const nextMilestone = orgMilestones?.[0] ?? globalMilestones?.[0] ?? null;

    return NextResponse.json({
      hire,
      deliveries: deliveries ?? [],
      access_requests: accessRequests ?? [],
      next_milestone: nextMilestone,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/new-hires/:id] GET failed', error);
    return NextResponse.json({ error: 'Failed to load new hire', detail: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const supabase = await createClient();

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const allowedFields = ['status', 'slack_user_id', 'ramp_day'];
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        patch[field] = body[field];
      }
    }

    const { data: updated, error } = await supabase
      .from('new_hires')
      .update(patch)
      .eq('id', id)
      .eq('organization_id', org.id)
      .select()
      .single();

    if (error || !updated) return NextResponse.json({ error: 'New hire not found or update failed' }, { status: 404 });

    return NextResponse.json({ hire: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/new-hires/:id] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to update new hire', detail: message }, { status: 500 });
  }
}
