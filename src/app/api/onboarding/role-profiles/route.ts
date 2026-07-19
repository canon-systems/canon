import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/auth';
import { createLogger } from '@/lib/server/logging';
import { normalizeRoleName } from '@/lib/onboarding/roles';
import { normalizeRampTargets } from '@/lib/onboarding/milestone-ramp';
import { requireWorkspace, requireWorkspaceAdmin } from '@/lib/server/organization';
import { demoRoleProfiles } from '@/lib/server/demo-workspace-data';
import { isDemoOrganization } from '@/lib/server/organization';
import type { RoleProfile } from '@/types/onboarding';

export const dynamic = 'force-dynamic';

const log = createLogger('api.onboarding.role_profiles', {
  label: 'Role Profiles API',
  eventLabels: {
    role_profiles_loaded: 'Role Profiles Loaded',
    role_profile_added: 'Role Profile Added',
    role_profile_saved: 'Role Profile Saved',
    role_profile_archived: 'Role Profile Archived',
  },
});

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function roleName(value: unknown) {
  return typeof value === 'string' ? normalizeRoleName(value) : '';
}

function validRoleName(value: string) {
  return value.length >= 2 && value.length <= 120;
}

function integerField(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type RoleProfileUpsertPayload = {
  organization_id: string;
  role: string;
  job_description: string;
  baseline_ramp_days: number;
  target_ramp_days: number;
  status: 'active';
  display_order?: number;
  updated_at: string;
};

function isMissingRampTargetColumn(error: SupabaseErrorLike | null | undefined) {
  if (!error || error.code !== 'PGRST204') return false;
  const message = error.message ?? '';
  return message.includes('baseline_ramp_days') || message.includes('target_ramp_days');
}

function roleProfileWithRampDefaults(
  profile: Partial<RoleProfile>,
  rampTargets: { baselineRampDays: number; targetRampDays: number }
): RoleProfile {
  return {
    ...profile,
    baseline_ramp_days: typeof profile.baseline_ramp_days === 'number'
      ? profile.baseline_ramp_days
      : rampTargets.baselineRampDays,
    target_ramp_days: typeof profile.target_ramp_days === 'number'
      ? profile.target_ramp_days
      : rampTargets.targetRampDays,
  } as RoleProfile;
}

async function upsertRoleProfile(
  supabase: SupabaseClient,
  payload: RoleProfileUpsertPayload
): Promise<RoleProfile> {
  const { data: profile, error } = await supabase
    .from('role_profiles')
    .upsert(payload, { onConflict: 'organization_id,role' })
    .select('*')
    .single();

  if (!isMissingRampTargetColumn(error)) {
    if (error || !profile) throw error ?? new Error('Role profile upsert failed');
    return roleProfileWithRampDefaults(profile, {
      baselineRampDays: payload.baseline_ramp_days,
      targetRampDays: payload.target_ramp_days,
    });
  }

  const legacyPayload = {
    organization_id: payload.organization_id,
    role: payload.role,
    job_description: payload.job_description,
    status: payload.status,
    updated_at: payload.updated_at,
    ...(typeof payload.display_order === 'number' ? { display_order: payload.display_order } : {}),
  };
  const { data: legacyProfile, error: legacyError } = await supabase
    .from('role_profiles')
    .upsert(legacyPayload, { onConflict: 'organization_id,role' })
    .select('*')
    .single();

  if (legacyError || !legacyProfile) throw legacyError ?? new Error('Role profile upsert failed');
  return roleProfileWithRampDefaults(legacyProfile, {
    baselineRampDays: payload.baseline_ramp_days,
    targetRampDays: payload.target_ramp_days,
  });
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { supabase, organization } = await requireWorkspace(user);

    const roleParam = roleName(request.nextUrl.searchParams.get('role'));
    if (roleParam && !validRoleName(roleParam)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    const includeArchived = request.nextUrl.searchParams.get('include_archived') === 'true';
    if (isDemoOrganization(organization)) {
      const profiles = demoRoleProfiles().filter((profile) => !roleParam || profile.role === roleParam);
      return NextResponse.json({ profiles });
    }

    let query = supabase
      .from('role_profiles')
      .select('*')
      .eq('organization_id', organization.id)
      .order('display_order', { ascending: true })
      .order('role', { ascending: true });

    if (!includeArchived) query = query.eq('status', 'active');

    if (roleParam) query = query.eq('role', roleParam);

    const { data: profiles, error } = await query;
    if (error) throw error;
    const rows = profiles ?? [];

    log.debug('role_profiles_loaded', {
      userId: user.id,
      organizationId: organization.id,
      role: roleParam ?? 'all',
      profileCount: rows.length,
    });

    return NextResponse.json({ profiles: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/role-profiles] GET failed', error);
    return NextResponse.json({ error: 'Failed to load role profiles', detail: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { supabase, organization } = await requireWorkspaceAdmin(user);

    const body = (await request.json().catch(() => ({}))) as {
      role?: unknown;
      job_description?: unknown;
      baseline_ramp_days?: unknown;
      target_ramp_days?: unknown;
    };

    const role = roleName(body.role);
    if (!validRoleName(role)) return NextResponse.json({ error: 'Role name must be 2-120 characters' }, { status: 400 });

    const jobDescription = stringField(body.job_description);
    if (jobDescription.length > 12000) {
      return NextResponse.json({ error: 'Job description must be 12,000 characters or fewer' }, { status: 400 });
    }
    const rampTargets = normalizeRampTargets({
      baselineRampDays: integerField(body.baseline_ramp_days),
      targetRampDays: integerField(body.target_ramp_days),
    });

    const { count } = await supabase
      .from('role_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization.id);

    const timestamp = new Date().toISOString();
    const profile = await upsertRoleProfile(supabase, {
      organization_id: organization.id,
      role,
      job_description: jobDescription,
      baseline_ramp_days: rampTargets.baselineRampDays,
      target_ramp_days: rampTargets.targetRampDays,
      status: 'active',
      display_order: ((count ?? 0) + 1) * 10,
      updated_at: timestamp,
    });

    log.info('role_profile_added', {
      userId: user.id,
      organizationId: organization.id,
      role: profile.role,
    });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/role-profiles] POST failed', error);
    return NextResponse.json({ error: 'Failed to add role', detail: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { supabase, organization } = await requireWorkspaceAdmin(user);

    const body = (await request.json().catch(() => ({}))) as {
      role?: unknown;
      job_description?: unknown;
      baseline_ramp_days?: unknown;
      target_ramp_days?: unknown;
    };

    const role = roleName(body.role);
    if (!validRoleName(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

    const jobDescription = stringField(body.job_description);
    if (jobDescription.length > 12000) {
      return NextResponse.json({ error: 'Job description must be 12,000 characters or fewer' }, { status: 400 });
    }
    const rampTargets = normalizeRampTargets({
      baselineRampDays: integerField(body.baseline_ramp_days),
      targetRampDays: integerField(body.target_ramp_days),
    });

    const timestamp = new Date().toISOString();
    const profile = await upsertRoleProfile(supabase, {
      organization_id: organization.id,
      role,
      job_description: jobDescription,
      baseline_ramp_days: rampTargets.baselineRampDays,
      target_ramp_days: rampTargets.targetRampDays,
      status: 'active',
      updated_at: timestamp,
    });

    log.info('role_profile_saved', {
      userId: user.id,
      organizationId: organization.id,
      role: profile.role,
      descriptionLength: profile.job_description.length,
    });

    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/role-profiles] PUT failed', error);
    return NextResponse.json({ error: 'Failed to save role profile', detail: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { supabase, organization } = await requireWorkspaceAdmin(user);

    const role = roleName(request.nextUrl.searchParams.get('role'));
    if (!validRoleName(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

    const timestamp = new Date().toISOString();
    const { data: profile, error } = await supabase
      .from('role_profiles')
      .update({ status: 'archived', updated_at: timestamp })
      .eq('organization_id', organization.id)
      .eq('role', role)
      .select('*')
      .single();

    if (error || !profile) return NextResponse.json({ error: 'Role not found' }, { status: 404 });

    await Promise.all([
      supabase
        .from('ramp_milestones')
        .update({ status: 'archived', updated_at: timestamp })
        .eq('organization_id', organization.id)
        .eq('role', role)
        .eq('status', 'active'),
      supabase
        .from('milestone_proposals')
        .update({ status: 'rejected', rejected_at: timestamp, updated_at: timestamp })
        .eq('organization_id', organization.id)
        .eq('role', role)
        .eq('status', 'draft'),
    ]);

    log.info('role_profile_archived', {
      userId: user.id,
      organizationId: organization.id,
      role,
    });

    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/role-profiles] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to remove role', detail: message }, { status: 500 });
  }
}
