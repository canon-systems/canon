import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { normalizeRoleName } from '@/lib/onboarding/roles';
import { requireWorkspace, requireWorkspaceAdmin } from '@/lib/server/organization';

export const dynamic = 'force-dynamic';

function normalizeToolName(toolName: string) {
  return toolName.trim().toLowerCase();
}

function scopeConflict(
  existingTools: Array<{ id: string; tool_name: string; role: string | null }>,
  nextToolName: string,
  nextRole: string | null,
  ignoreId?: string
) {
  const normalizedNextName = normalizeToolName(nextToolName);
  return existingTools.some((tool) => {
    if (tool.id === ignoreId) return false;
    if (normalizeToolName(tool.tool_name) !== normalizedNextName) return false;
    if (nextRole === null) return true;
    return tool.role === null || tool.role === nextRole;
  });
}

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { supabase, organization } = await requireWorkspace(user);

    const { data, error } = await supabase
      .from('org_tools')
      .select('*')
      .eq('organization_id', organization.id)
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

    const { tool_name, owner_name, owner_email, owner_slack_id } = body;
    const role = body.role ? normalizeRoleName(body.role) : null;
    if (!tool_name?.trim()) {
      return NextResponse.json({ error: 'tool_name is required' }, { status: 400 });
    }

    if (!owner_name?.trim() || !owner_slack_id?.trim()) {
      return NextResponse.json({ error: 'Slack owner is required' }, { status: 400 });
    }

    const { supabase, organization } = await requireWorkspaceAdmin(user);

    if (role) {
      const { data: roleProfile } = await supabase
        .from('role_profiles')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('role', role)
        .eq('status', 'active')
        .maybeSingle();
      if (!roleProfile) return NextResponse.json({ error: 'Role is not active' }, { status: 400 });
    }

    const { data: existingTools, error: existingError } = await supabase
      .from('org_tools')
      .select('id, tool_name, role')
      .eq('organization_id', organization.id);

    if (existingError) throw existingError;

    if (scopeConflict(existingTools ?? [], tool_name, role || null)) {
      return NextResponse.json({ error: 'Tool already exists for this role scope' }, { status: 409 });
    }

    const { data: tool, error } = await supabase
      .from('org_tools')
      .insert({
        organization_id: organization.id,
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

    const { id, tool_name, owner_name, owner_email, owner_slack_id } = body;
    const role = body.role ? normalizeRoleName(body.role) : null;
    if (!id || !tool_name?.trim()) {
      return NextResponse.json({ error: 'id and tool_name are required' }, { status: 400 });
    }

    if (!owner_name?.trim() || !owner_slack_id?.trim()) {
      return NextResponse.json({ error: 'Slack owner is required' }, { status: 400 });
    }

    const { supabase, organization } = await requireWorkspaceAdmin(user);

    if (role) {
      const { data: roleProfile } = await supabase
        .from('role_profiles')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('role', role)
        .eq('status', 'active')
        .maybeSingle();
      if (!roleProfile) return NextResponse.json({ error: 'Role is not active' }, { status: 400 });
    }

    const { data: existingTools, error: existingError } = await supabase
      .from('org_tools')
      .select('id, tool_name, role')
      .eq('organization_id', organization.id);

    if (existingError) throw existingError;

    if (scopeConflict(existingTools ?? [], tool_name, role || null, id)) {
      return NextResponse.json({ error: 'Tool already exists for this role scope' }, { status: 409 });
    }

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
      .eq('organization_id', organization.id)
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

    const { supabase, organization } = await requireWorkspaceAdmin(user);

    const { error } = await supabase
      .from('org_tools')
      .delete()
      .eq('id', id)
      .eq('organization_id', organization.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/org-tools] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to delete tool', detail: message }, { status: 500 });
  }
}
