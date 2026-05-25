import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';
import { syncAccessReadinessEvidence } from '@/lib/server/milestoneEvidence';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const newHireId = request.nextUrl.searchParams.get('new_hire_id');
    const supabase = await createClient();

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ access_requests: [] });

    let query = supabase
      .from('access_requests')
      .select(`
        *,
        new_hires!inner(organization_id)
      `)
      .eq('new_hires.organization_id', org.id)
      .order('created_at', { ascending: true });

    if (newHireId) {
      query = query.eq('new_hire_id', newHireId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ access_requests: data ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/access-requests] GET failed', error);
    return NextResponse.json({ error: 'Failed to load access requests', detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as {
      new_hire_id?: string;
      tool_name?: string;
      requested_from_name?: string;
      requested_from_email?: string;
      requested_from_slack_id?: string;
    };

    const { new_hire_id, tool_name, requested_from_name, requested_from_email, requested_from_slack_id } = body;
    if (!new_hire_id || !tool_name || !requested_from_name || !requested_from_email) {
      return NextResponse.json({ error: 'new_hire_id, tool_name, requested_from_name, and requested_from_email are required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { data: hire } = await supabase
      .from('new_hires')
      .select('id')
      .eq('id', new_hire_id)
      .eq('organization_id', org.id)
      .single();

    if (!hire) return NextResponse.json({ error: 'New hire not found' }, { status: 404 });

    const { data: ar, error } = await supabase
      .from('access_requests')
      .insert({
        new_hire_id,
        tool_name,
        requested_from_name,
        requested_from_email,
        requested_from_slack_id: requested_from_slack_id || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !ar) throw error ?? new Error('Insert failed');

    if (ar.requested_from_slack_id) {
      await inngest.send({
        name: 'onboarding/access.request.created',
        data: { accessRequestId: ar.id },
      });
    }

    return NextResponse.json({ access_request: ar }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/access-requests] POST failed', error);
    return NextResponse.json({ error: 'Failed to create access request', detail: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as { id?: string; status?: string };
    const { id, status } = body;
    if (!id || !status) return NextResponse.json({ error: 'id and status are required' }, { status: 400 });

    const validStatuses = ['pending', 'sent', 'acknowledged', 'granted'];
    if (!validStatuses.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { data: updated, error } = await supabase
      .from('access_requests')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error || !updated) return NextResponse.json({ error: 'Access request not found or update failed' }, { status: 404 });

    if (status === 'granted') {
      await syncAccessReadinessEvidence({
        supabase,
        newHireId: updated.new_hire_id,
        createdBy: user.id,
      });
    }

    return NextResponse.json({ access_request: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/access-requests] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to update access request', detail: message }, { status: 500 });
  }
}
