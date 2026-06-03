import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import {
  getOrganizationForUser,
  requireWorkspaceAdmin,
  workspaceErrorResponse,
  type OrganizationRole,
} from '@/lib/server/organization';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { notifyWorkspaceOwnerOfJoinRequest } from '@/lib/server/workspaceNotifications';
import { userFullName } from '@/lib/userDisplay';

export const dynamic = 'force-dynamic';

type JoinRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

type JoinRequestRow = {
  id: string;
  organization_id: string;
  requester_id: string;
  requester_email: string;
  message: string | null;
  status: JoinRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  organizations?: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

const reviewStatuses = ['approved', 'denied'] as const;

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeWorkspaceLookup(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9._ -]+/g, '')
    .replace(/\s+/g, ' ');
}

async function hasExistingMembership(userId: string) {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from('organization_members')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function requesterNameById(userId: string) {
  const service = createServiceRoleClient();
  const { data } = await service.auth.admin.getUserById(userId);
  return data.user ? userFullName(data.user) : null;
}

async function withRequesterNames(rows: JoinRequestRow[]) {
  return Promise.all(rows.map(async (row) => ({
    ...row,
    requester_name: await requesterNameById(row.requester_id),
  })));
}

export async function GET() {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createClient();
    const organization = await getOrganizationForUser(supabase, user);
    const service = createServiceRoleClient();

    if (organization?.role === 'owner' || organization?.role === 'admin') {
      const { data, error } = await service
        .from('organization_join_requests')
        .select('id, organization_id, requester_id, requester_email, message, status, reviewed_by, reviewed_at, created_at')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return NextResponse.json({ requests: await withRequesterNames((data ?? []) as JoinRequestRow[]) });
    }

    const { data, error } = await service
      .from('organization_join_requests')
      .select('id, organization_id, requester_id, requester_email, message, status, reviewed_by, reviewed_at, created_at, organizations(id, name, slug)')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ requests: await withRequesterNames((data ?? []) as unknown as JoinRequestRow[]) });
  } catch (error: unknown) {
    console.error('[api/workspace/join-requests] GET failed', error);
    return workspaceErrorResponse(error, 'Failed to load join requests');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = await createClient();
    const existingWorkspace = await getOrganizationForUser(supabase, user);
    if (existingWorkspace) {
      return NextResponse.json({ error: 'You already belong to a workspace' }, { status: 409 });
    }

    const body = (await request.json().catch(() => ({}))) as { workspace?: unknown; message?: unknown };
    const workspaceLookup = normalizeWorkspaceLookup(stringField(body.workspace));
    const message = stringField(body.message).slice(0, 500);

    if (workspaceLookup.length < 2) {
      return NextResponse.json({ error: 'Enter a workspace name or slug' }, { status: 400 });
    }

    const service = createServiceRoleClient();
    const { data: slugMatch, error: slugError } = await service
      .from('organizations')
      .select('id, name, slug, owner_id')
      .eq('slug', workspaceLookup)
      .maybeSingle();

    if (slugError) throw slugError;

    const { data: nameMatches, error: nameError } = slugMatch
      ? { data: [], error: null }
      : await service
        .from('organizations')
        .select('id, name, slug, owner_id')
        .ilike('name', workspaceLookup)
        .limit(2);

    if (nameError) throw nameError;

    const candidates = slugMatch ? [slugMatch] : nameMatches ?? [];
    if (candidates.length === 0) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    if (candidates.length > 1) {
      return NextResponse.json({ error: 'Multiple workspaces matched. Use the workspace slug.' }, { status: 409 });
    }

    const organization = candidates[0];
    const requesterEmail = user.email?.trim().toLowerCase();
    if (!requesterEmail) {
      return NextResponse.json({ error: 'Your account needs an email before requesting access' }, { status: 400 });
    }

    const { data: activeInvite } = await service
      .from('organization_invitations')
      .select('id')
      .eq('organization_id', organization.id)
      .eq('email', requesterEmail)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (activeInvite) {
      return NextResponse.json({ error: 'An invitation already exists for this email. Ask a workspace admin to resend the invite link.' }, { status: 409 });
    }

    const { data: joinRequest, error } = await service
      .from('organization_join_requests')
      .insert({
        organization_id: organization.id,
        requester_id: user.id,
        requester_email: requesterEmail,
        message: message || null,
      })
      .select('id, organization_id, requester_id, requester_email, message, status, reviewed_by, reviewed_at, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'You already have a pending request for this workspace' }, { status: 409 });
      }
      throw error;
    }

    await notifyWorkspaceOwnerOfJoinRequest({
      supabase: service,
      organization,
      requesterEmail,
      message: message || null,
      appOrigin: request.nextUrl.origin,
    });

    return NextResponse.json({
      request: {
        ...joinRequest,
        requester_name: userFullName(user),
      },
    }, { status: 201 });
  } catch (error: unknown) {
    console.error('[api/workspace/join-requests] POST failed', error);
    return workspaceErrorResponse(error, 'Failed to request workspace access');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { organization } = await requireWorkspaceAdmin(user);
    const body = (await request.json().catch(() => ({}))) as { request_id?: unknown; status?: unknown; role?: unknown };
    const requestId = stringField(body.request_id);
    const status = stringField(body.status) as typeof reviewStatuses[number];
    const role = stringField(body.role) as Exclude<OrganizationRole, 'owner'>;

    if (!requestId || !reviewStatuses.includes(status)) {
      return NextResponse.json({ error: 'request_id and status are required' }, { status: 400 });
    }
    if (status === 'approved' && !['admin', 'member'].includes(role)) {
      return NextResponse.json({ error: 'A member role is required when approving' }, { status: 400 });
    }

    const service = createServiceRoleClient();
    const { data: joinRequest, error: requestError } = await service
      .from('organization_join_requests')
      .select('id, organization_id, requester_id, requester_email, message, status, reviewed_by, reviewed_at, created_at')
      .eq('id', requestId)
      .eq('organization_id', organization.id)
      .single();

    if (requestError || !joinRequest) throw requestError ?? new Error('Join request not found');
    const requestRow = joinRequest as JoinRequestRow;
    if (requestRow.status !== 'pending') {
      return NextResponse.json({ error: 'This join request has already been reviewed' }, { status: 409 });
    }

    if (status === 'approved') {
      if (await hasExistingMembership(requestRow.requester_id)) {
        return NextResponse.json({ error: 'This user already belongs to a workspace' }, { status: 409 });
      }

      const { error: memberError } = await service
        .from('organization_members')
        .insert({
          organization_id: organization.id,
          user_id: requestRow.requester_id,
          role,
        });

      if (memberError) throw memberError;
    }

    const reviewedAt = new Date().toISOString();
    const { data: updatedRequest, error: updateError } = await service
      .from('organization_join_requests')
      .update({
        status,
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
        updated_at: reviewedAt,
      })
      .eq('id', requestRow.id)
      .select('id, organization_id, requester_id, requester_email, message, status, reviewed_by, reviewed_at, created_at')
      .single();

    if (updateError || !updatedRequest) throw updateError ?? new Error('Join request update failed');

    return NextResponse.json({
      request: {
        ...updatedRequest,
        requester_name: await requesterNameById(requestRow.requester_id),
      },
    });
  } catch (error: unknown) {
    console.error('[api/workspace/join-requests] PATCH failed', error);
    return workspaceErrorResponse(error, 'Failed to review join request');
  }
}
