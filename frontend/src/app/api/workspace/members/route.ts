import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireWorkspace, requireWorkspaceAdmin, type OrganizationRole } from '@/lib/server/organization';

export const dynamic = 'force-dynamic';

type MemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  created_at: string;
};

const mutableRoles: OrganizationRole[] = ['admin', 'member'];

async function userEmailById(userId: string) {
  const service = createServiceRoleClient();
  const { data } = await service.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { organization } = await requireWorkspace(user);
    const service = createServiceRoleClient();
    const { data, error } = await service
      .from('organization_members')
      .select('id, organization_id, user_id, role, created_at')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const members = await Promise.all(((data ?? []) as MemberRow[]).map(async (member) => ({
      ...member,
      email: await userEmailById(member.user_id),
      is_current_user: member.user_id === user.id,
    })));

    return NextResponse.json({ members, current_role: organization.role });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/workspace/members] GET failed', error);
    return NextResponse.json({ error: 'Failed to load workspace members', detail }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { organization } = await requireWorkspaceAdmin(user);
    const body = (await request.json().catch(() => ({}))) as { member_id?: unknown; role?: unknown };
    const memberId = typeof body.member_id === 'string' ? body.member_id : '';
    const role = typeof body.role === 'string' ? body.role as OrganizationRole : null;

    if (!memberId || !role || !mutableRoles.includes(role)) {
      return NextResponse.json({ error: 'member_id and role are required' }, { status: 400 });
    }

    const service = createServiceRoleClient();
    const { data: existing } = await service
      .from('organization_members')
      .select('id, role, user_id')
      .eq('id', memberId)
      .eq('organization_id', organization.id)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (existing.role === 'owner') return NextResponse.json({ error: 'Owner role cannot be changed' }, { status: 400 });

    const { data: member, error } = await service
      .from('organization_members')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', memberId)
      .eq('organization_id', organization.id)
      .select('id, organization_id, user_id, role, created_at')
      .single();

    if (error || !member) throw error ?? new Error('Member update failed');

    return NextResponse.json({
      member: {
        ...member,
        email: await userEmailById(member.user_id),
        is_current_user: member.user_id === user.id,
      },
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/workspace/members] PATCH failed', error);
    return NextResponse.json({ error: 'Failed to update workspace member', detail }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { organization } = await requireWorkspaceAdmin(user);
    const memberId = request.nextUrl.searchParams.get('member_id') ?? '';
    if (!memberId) return NextResponse.json({ error: 'member_id is required' }, { status: 400 });

    const service = createServiceRoleClient();
    const { data: existing } = await service
      .from('organization_members')
      .select('id, role, user_id')
      .eq('id', memberId)
      .eq('organization_id', organization.id)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (existing.role === 'owner') return NextResponse.json({ error: 'Owner cannot be removed' }, { status: 400 });
    if (existing.user_id === user.id) return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 });

    const { error } = await service
      .from('organization_members')
      .delete()
      .eq('id', memberId)
      .eq('organization_id', organization.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/workspace/members] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to remove workspace member', detail }, { status: 500 });
  }
}
