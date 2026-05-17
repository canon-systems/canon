import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';
import type { HireRole } from '@/types/onboarding';

export const dynamic = 'force-dynamic';

const DEFAULT_TOOLS_BY_ROLE: Record<HireRole, string[]> = {
  'AI Solutions Architect': ['Salesforce', 'Gong', 'Outreach', 'Zoom'],
  'Solutions Engineer': ['Salesforce', 'Gong', 'GitHub', 'Confluence', 'Zoom'],
  'Implementation Engineer': ['Salesforce', 'Jira', 'Confluence', 'GitHub', 'Zoom'],
};

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ hires: [] });

    const { data: hires, error } = await supabase
      .from('new_hires')
      .select(`
        *,
        ramp_deliveries(count),
        access_requests(count)
      `)
      .eq('organization_id', org.id)
      .order('start_date', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ hires: hires ?? [] });
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
      name?: string;
      email?: string;
      role?: string;
      start_date?: string;
      slack_user_id?: string;
    };

    const { name, email, role, start_date, slack_user_id } = body;
    if (!name || !email || !role || !start_date) {
      return NextResponse.json({ error: 'name, email, role, and start_date are required' }, { status: 400 });
    }

    const validRoles: HireRole[] = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];
    if (!validRoles.includes(role as HireRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organization not found. Please set up your organization first.' }, { status: 404 });
    }

    const { data: hire, error: hireError } = await supabase
      .from('new_hires')
      .insert({
        organization_id: org.id,
        created_by: user.id,
        name,
        email,
        role,
        start_date,
        slack_user_id: slack_user_id || null,
        ramp_day: 0,
        status: 'active',
      })
      .select()
      .single();

    if (hireError || !hire) throw hireError ?? new Error('Failed to create hire');

    const tools = DEFAULT_TOOLS_BY_ROLE[role as HireRole] ?? [];
    const accessRequestInserts = tools.map((tool) => ({
      new_hire_id: hire.id,
      tool_name: tool,
      requested_from_name: 'TBD',
      requested_from_email: 'tbd@company.com',
      requested_from_slack_id: null,
      status: 'pending',
    }));

    const { data: accessRequests } = await supabase
      .from('access_requests')
      .insert(accessRequestInserts)
      .select();

    // Fire events for any access requests that have a Slack ID (none for now, all TBD)
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
