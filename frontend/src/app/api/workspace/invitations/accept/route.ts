import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function tokenFromRequest(request: NextRequest, body?: Record<string, unknown>) {
  const fromBody = typeof body?.token === 'string' ? body.token.trim() : '';
  return fromBody || (request.nextUrl.searchParams.get('token') ?? '').trim();
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const token = tokenFromRequest(request, body);
    if (!token) return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });

    const service = createServiceRoleClient();
    const now = new Date().toISOString();
    const { data: invitation, error: inviteError } = await service
      .from('organization_invitations')
      .select('id, organization_id, email, role, accepted_at, revoked_at, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (inviteError) throw inviteError;
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    if (invitation.accepted_at) return NextResponse.json({ error: 'Invitation has already been accepted' }, { status: 409 });
    if (invitation.revoked_at) return NextResponse.json({ error: 'Invitation has been revoked' }, { status: 410 });
    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 });
    }
    if (!user.email || user.email.toLowerCase() !== String(invitation.email).toLowerCase()) {
      return NextResponse.json({ error: 'Sign in with the invited email to accept this invitation' }, { status: 403 });
    }

    const { data: member, error: memberError } = await service
      .from('organization_members')
      .upsert({
        organization_id: invitation.organization_id,
        user_id: user.id,
        role: invitation.role,
        updated_at: now,
      }, { onConflict: 'organization_id,user_id' })
      .select('id, organization_id, user_id, role, created_at')
      .single();

    if (memberError || !member) throw memberError ?? new Error('Membership insert failed');

    const { error: acceptError } = await service
      .from('organization_invitations')
      .update({ accepted_by: user.id, accepted_at: now, updated_at: now })
      .eq('id', invitation.id);

    if (acceptError) throw acceptError;

    return NextResponse.json({ member });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[api/workspace/invitations/accept] POST failed', error);
    return NextResponse.json({ error: 'Failed to accept workspace invitation', detail }, { status: 500 });
  }
}
