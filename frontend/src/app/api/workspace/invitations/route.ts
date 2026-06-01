import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isWorkspaceAdmin, requireWorkspace, requireWorkspaceAdmin } from '@/lib/server/organization';

export const dynamic = 'force-dynamic';

const inviteRoles = ['admin', 'member'] as const;

function normalizedEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function inviteUrl(request: NextRequest, token: string) {
  return new URL(`/invite/accept?token=${encodeURIComponent(token)}`, request.nextUrl.origin).toString();
}

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { supabase, organization } = await requireWorkspace(user);
    if (!isWorkspaceAdmin(organization.role)) {
      return NextResponse.json({ invitations: [] });
    }
    const { data, error } = await supabase
      .from('organization_invitations')
      .select('id, organization_id, email, role, token, invited_by, accepted_by, accepted_at, revoked_at, expires_at, created_at')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ invitations: data ?? [] });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/workspace/invitations] GET failed', error);
    return NextResponse.json({ error: 'Failed to load workspace invitations', detail }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { organization } = await requireWorkspaceAdmin(user);
    const body = (await request.json().catch(() => ({}))) as { email?: unknown; role?: unknown };
    const email = normalizedEmail(body.email);
    const role = typeof body.role === 'string' && inviteRoles.includes(body.role as typeof inviteRoles[number])
      ? body.role
      : 'member';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    const service = createServiceRoleClient();
    const { data: existingInvite } = await service
      .from('organization_invitations')
      .select('id')
      .eq('organization_id', organization.id)
      .eq('email', email)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existingInvite) {
      return NextResponse.json({ error: 'An active invitation already exists for this email' }, { status: 409 });
    }

    const { data: invitation, error } = await service
      .from('organization_invitations')
      .insert({
        organization_id: organization.id,
        email,
        role,
        invited_by: user.id,
      })
      .select('id, organization_id, email, role, token, invited_by, accepted_by, accepted_at, revoked_at, expires_at, created_at')
      .single();

    if (error || !invitation) throw error ?? new Error('Invitation insert failed');

    return NextResponse.json({
      invitation,
      invite_url: inviteUrl(request, invitation.token),
    }, { status: 201 });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/workspace/invitations] POST failed', error);
    return NextResponse.json({ error: 'Failed to create workspace invitation', detail }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { organization } = await requireWorkspaceAdmin(user);
    const id = request.nextUrl.searchParams.get('id') ?? '';
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const service = createServiceRoleClient();
    const { error } = await service
      .from('organization_invitations')
      .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organization.id)
      .is('accepted_at', null);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/workspace/invitations] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to revoke workspace invitation', detail }, { status: 500 });
  }
}
