import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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

    if (!org) return NextResponse.json({ tools: [] });

    const { data, error } = await supabase
      .from('org_tools')
      .select('*')
      .eq('organization_id', org.id)
      .order('tool_name', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ tools: data ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/org-tools] GET failed', error);
    return NextResponse.json({ error: 'Failed to load tools', detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as {
      tool_name?: string;
      role?: string | null;
      owner_name?: string;
      owner_email?: string;
      owner_slack_id?: string;
    };

    const { tool_name, role, owner_name, owner_email, owner_slack_id } = body;
    if (!tool_name?.trim()) {
      return NextResponse.json({ error: 'tool_name is required' }, { status: 400 });
    }

    const validRoles = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { data: tool, error } = await supabase
      .from('org_tools')
      .insert({
        organization_id: org.id,
        tool_name: tool_name.trim(),
        role: role || null,
        owner_name: owner_name?.trim() || null,
        owner_email: owner_email?.trim() || null,
        owner_slack_id: owner_slack_id?.trim() || null,
      })
      .select()
      .single();

    if (error || !tool) throw error ?? new Error('Insert failed');
    return NextResponse.json({ tool }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/org-tools] POST failed', error);
    return NextResponse.json({ error: 'Failed to create tool', detail: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as {
      id?: string;
      tool_name?: string;
      role?: string | null;
      owner_name?: string | null;
      owner_email?: string | null;
      owner_slack_id?: string | null;
    };

    const { id, tool_name, role, owner_name, owner_email, owner_slack_id } = body;
    if (!id || !tool_name?.trim()) {
      return NextResponse.json({ error: 'id and tool_name are required' }, { status: 400 });
    }

    const validRoles = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { data: tool, error } = await supabase
      .from('org_tools')
      .update({
        tool_name: tool_name.trim(),
        role: role || null,
        owner_name: owner_name?.trim() || null,
        owner_email: owner_email?.trim() || null,
        owner_slack_id: owner_slack_id?.trim() || null,
      })
      .eq('id', id)
      .eq('organization_id', org.id)
      .select()
      .single();

    if (error || !tool) return NextResponse.json({ error: 'Tool not found or update failed' }, { status: 404 });
    return NextResponse.json({ tool });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/org-tools] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to update tool', detail: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { error } = await supabase
      .from('org_tools')
      .delete()
      .eq('id', id)
      .eq('organization_id', org.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/org-tools] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to delete tool', detail: message }, { status: 500 });
  }
}
