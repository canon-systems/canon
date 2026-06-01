import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { inngest } from '@/inngest/client';
import { rampDayFromStartDate } from '@/lib/onboarding/rampDay';
import { normalizeRoleName } from '@/lib/onboarding/roles';
import { requireWorkspace } from '@/lib/server/organization';

export const dynamic = 'force-dynamic';


export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { supabase, organization } = await requireWorkspace(user);

    const { data: hires, error } = await supabase
      .from('new_hires')
      .select(`
        *,
        ramp_deliveries(count),
        access_requests(count)
      `)
      .eq('organization_id', organization.id)
      .order('start_date', { ascending: false });

    if (error) throw error;
    const hiresWithRampDay = (hires ?? []).map((hire) => ({
      ...hire,
      ramp_day: rampDayFromStartDate(hire.start_date),
    }));

    return NextResponse.json({ hires: hiresWithRampDay });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/new-hires] GET failed', error);
    return NextResponse.json({ error: 'Failed to load new hires', detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as {
      first_name?: string;
      last_name?: string;
      email?: string;
      role?: string;
      start_date?: string;
      slack_user_id?: string;
    };

    const { first_name, last_name, email, start_date, slack_user_id } = body;
    const role = normalizeRoleName(body.role ?? '');
    if (!first_name || !last_name || !email || !role || !start_date || !slack_user_id) {
      return NextResponse.json({ error: 'first_name, last_name, email, role, start_date, and slack_user_id are required' }, { status: 400 });
    }

    const { supabase, organization } = await requireWorkspace(user);

    const { data: roleProfile } = await supabase
      .from('role_profiles')
      .select('id')
      .eq('organization_id', organization.id)
      .eq('role', role)
      .eq('status', 'active')
      .maybeSingle();

    if (!roleProfile) {
      return NextResponse.json({ error: 'Role is not active' }, { status: 400 });
    }

    const { data: hire, error: hireError } = await supabase
      .from('new_hires')
      .insert({
        organization_id: organization.id,
        created_by: user.id,
        first_name,
        last_name,
        email,
        role,
        start_date,
        slack_user_id,
        ramp_day: 0,
        status: 'active',
      })
      .select()
      .single();

    if (hireError || !hire) throw hireError ?? new Error('Failed to create hire');

    // Load org-configured tools for this role (null role = applies to all roles).
    const { data: orgTools } = await supabase
      .from('org_tools')
      .select('*')
      .eq('organization_id', organization.id)
      .or(`role.eq.${role},role.is.null`);

    const accessRequestInserts = (orgTools ?? []).map((t) => ({
      new_hire_id: hire.id,
      tool_name: t.tool_name,
      requested_from_name: t.owner_name,
      requested_from_email: t.owner_email,
      requested_from_slack_id: t.owner_slack_id,
      status: 'pending',
    }));

    const { data: accessRequests } = await supabase
      .from('access_requests')
      .insert(accessRequestInserts)
      .select();

    // Fire events for any access requests that have a Slack ID.
    for (const ar of accessRequests ?? []) {
      if (ar.requested_from_slack_id) {
        await inngest.send({
          name: 'onboarding/access.request.created',
          data: { accessRequestId: ar.id },
        });
      }
    }

    return NextResponse.json({ hire, access_requests: accessRequests ?? [] }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/new-hires] POST failed', error);
    return NextResponse.json({ error: 'Failed to create new hire', detail: message }, { status: 500 });
  }
}
