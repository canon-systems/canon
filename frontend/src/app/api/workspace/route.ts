import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { requireWorkspace, requireWorkspaceAdmin } from '@/lib/server/organization';

export const dynamic = 'force-dynamic';

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { organization } = await requireWorkspace(user);
    return NextResponse.json({ workspace: organization });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/workspace] GET failed', error);
    return NextResponse.json({ error: 'Failed to load workspace', detail }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { supabase, organization } = await requireWorkspaceAdmin(user);
    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    const name = stringField(body.name);

    if (name.length < 2 || name.length > 120) {
      return NextResponse.json({ error: 'Workspace name must be 2-120 characters' }, { status: 400 });
    }

    const { data: workspace, error } = await supabase
      .from('organizations')
      .update({ name })
      .eq('id', organization.id)
      .select('id, name, slug, owner_id')
      .single();

    if (error || !workspace) throw error ?? new Error('Workspace update failed');

    return NextResponse.json({ workspace: { ...workspace, role: organization.role } });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/workspace] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to update workspace', detail }, { status: 500 });
  }
}
