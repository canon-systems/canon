import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { HireRole, HireStatus } from '@/types/onboarding';

export const dynamic = 'force-dynamic';

const VALID_ROLES: HireRole[] = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];
const VALID_STATUSES: HireStatus[] = ['active', 'paused', 'completed'];

function isDateInputValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

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

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
      patch.name = name;
    }

    if (typeof body.email === 'string') {
      const email = body.email.trim();
      if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
      patch.email = email;
    }

    if (typeof body.role === 'string') {
      if (!VALID_ROLES.includes(body.role as HireRole)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      patch.role = body.role;
    }

    if (typeof body.start_date === 'string') {
      if (!isDateInputValue(body.start_date)) {
        return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
      }
      patch.start_date = body.start_date;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'slack_user_id')) {
      patch.slack_user_id = typeof body.slack_user_id === 'string' && body.slack_user_id.trim()
        ? body.slack_user_id.trim()
        : null;
    }

    if (typeof body.status === 'string') {
      if (!VALID_STATUSES.includes(body.status as HireStatus)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      patch.status = body.status;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'ramp_day')) {
      if (typeof body.ramp_day !== 'number' || !Number.isInteger(body.ramp_day) || body.ramp_day < 0) {
        return NextResponse.json({ error: 'Invalid ramp day' }, { status: 400 });
      }
      patch.ramp_day = body.ramp_day;
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

export async function DELETE(
  _request: NextRequest,
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

    const { error } = await supabase
      .from('new_hires')
      .delete()
      .eq('id', id)
      .eq('organization_id', org.id);

    if (error) return NextResponse.json({ error: 'New hire not found or delete failed' }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/new-hires/:id] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to delete new hire', detail: message }, { status: 500 });
  }
}
