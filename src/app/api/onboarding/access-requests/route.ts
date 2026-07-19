import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { inngest } from '@/inngest/client';
import { INNGEST_EVENTS } from '@/inngest/constants';
import { syncAccessReadinessEvidence } from '@/lib/server/milestoneEvidence';
import { requireWorkspace } from '@/lib/server/organization';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const newHireId = request.nextUrl.searchParams.get('new_hire_id');
    const { supabase, organization } = await requireWorkspace(user);

    let query = supabase
      .from('access_requests')
      .select(`
        *,
        new_hires!inner(organization_id)
      `)
      .eq('new_hires.organization_id', organization.id)
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
    if (!new_hire_id || !tool_name) {
      return NextResponse.json({ error: 'new_hire_id and tool_name are required' }, { status: 400 });
    }

    const { supabase, organization } = await requireWorkspace(user);

    const { data: hire } = await supabase
      .from('new_hires')
      .select('id')
      .eq('id', new_hire_id)
      .eq('organization_id', organization.id)
      .single();

    if (!hire) return NextResponse.json({ error: 'New hire not found' }, { status: 404 });

    const { data: ar, error } = await supabase
      .from('access_requests')
      .insert({
        new_hire_id,
        tool_name,
        requested_from_name: requested_from_name || null,
        requested_from_email: requested_from_email || null,
        requested_from_slack_id: requested_from_slack_id || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !ar) throw error ?? new Error('Insert failed');

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

    const body = (await request.json()) as {
      id?: string;
      status?: string;
      tool_name?: string;
      requested_from_name?: string | null;
      requested_from_email?: string | null;
      requested_from_slack_id?: string | null;
    };
    const { id, status, tool_name, requested_from_name, requested_from_email, requested_from_slack_id } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const validStatuses = ['pending', 'sent', 'acknowledged', 'granted', 'confirmed'];
    if (status && !validStatuses.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

    const { supabase, organization } = await requireWorkspace(user);

    const updatePayload: Record<string, unknown> = {};
    if (status) {
      updatePayload.status = status;
      if (status === 'granted') updatePayload.granted_at = new Date().toISOString();
      if (status === 'confirmed') updatePayload.confirmed_at = new Date().toISOString();
    }
    if (tool_name !== undefined) updatePayload.tool_name = tool_name;
    if (requested_from_name !== undefined) updatePayload.requested_from_name = requested_from_name;
    if (requested_from_email !== undefined) updatePayload.requested_from_email = requested_from_email;
    if (requested_from_slack_id !== undefined) updatePayload.requested_from_slack_id = requested_from_slack_id;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { data: accessRequest } = await supabase
      .from('access_requests')
      .select('id, new_hire_id, new_hires!inner(organization_id)')
      .eq('id', id)
      .eq('new_hires.organization_id', organization.id)
      .single();

    if (!accessRequest) return NextResponse.json({ error: 'Access request not found' }, { status: 404 });
    if (!accessRequest.new_hire_id) {
      return NextResponse.json({ error: 'Access request is missing its new hire' }, { status: 409 });
    }

    const { data: updated, error } = await supabase
      .from('access_requests')
      .update(updatePayload)
      .eq('id', id)
      .eq('new_hire_id', accessRequest.new_hire_id)
      .select()
      .single();

    if (error || !updated) return NextResponse.json({ error: 'Access request not found or update failed' }, { status: 404 });

    if (status === 'granted' || status === 'confirmed') {
      if (!updated.new_hire_id) {
        return NextResponse.json({ error: 'Access request is missing its new hire' }, { status: 409 });
      }
      await syncAccessReadinessEvidence({
        supabase,
        newHireId: updated.new_hire_id,
        createdBy: user.id,
      });
    }

    if (status === 'granted') {
      // Ask the new hire to confirm they've logged in
      await inngest.send({
        name: INNGEST_EVENTS.ACCESS_GRANTED,
        data: { accessRequestId: updated.id },
      });
    }

    return NextResponse.json({ access_request: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/access-requests] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to update access request', detail: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { supabase, organization } = await requireWorkspace(user);

    // Verify the request belongs to this org before deleting
    const { data: ar } = await supabase
      .from('access_requests')
      .select('id, new_hire_id, new_hires!inner(organization_id)')
      .eq('id', id)
      .eq('new_hires.organization_id', organization.id)
      .single();

    if (!ar) return NextResponse.json({ error: 'Access request not found' }, { status: 404 });
    if (!ar.new_hire_id) {
      return NextResponse.json({ error: 'Access request is missing its new hire' }, { status: 409 });
    }

    const { error } = await supabase
      .from('access_requests')
      .delete()
      .eq('id', id)
      .eq('new_hire_id', ar.new_hire_id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/access-requests] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to delete access request', detail: message }, { status: 500 });
  }
}
