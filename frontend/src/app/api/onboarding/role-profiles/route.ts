import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/server/logging';
import { DEFAULT_ROLES, normalizeRoleName } from '@/lib/onboarding/roles';
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

async function organizationForUser() {
  const { user } = await getSession();
  if (!user) return { user: null, org: null, supabase: null };

  const supabase = await createClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('owner_id', user.id)
    .single();

  return { user, org, supabase };
}

function fallbackProfiles(organizationId: string): RoleProfile[] {
  const timestamp = new Date().toISOString();
  return DEFAULT_ROLES.map((role, index) => ({
    id: `default-${index}`,
    organization_id: organizationId,
    role,
    job_description: '',
    status: 'active',
    display_order: (index + 1) * 10,
    created_at: timestamp,
    updated_at: timestamp,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const { user, org, supabase } = await organizationForUser();
    if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const roleParam = roleName(request.nextUrl.searchParams.get('role'));
    if (roleParam && !validRoleName(roleParam)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    const includeArchived = request.nextUrl.searchParams.get('include_archived') === 'true';

    if (!org) return NextResponse.json({ profiles: [] });

    let query = supabase
      .from('role_profiles')
      .select('*')
      .eq('organization_id', org.id)
      .order('display_order', { ascending: true })
      .order('role', { ascending: true });

    if (!includeArchived) query = query.eq('status', 'active');

    if (roleParam) query = query.eq('role', roleParam);

    const { data: profiles, error } = await query;
    if (error) throw error;
    const rows = profiles?.length ? profiles : includeArchived || roleParam ? [] : fallbackProfiles(org.id);

    log.debug('role_profiles_loaded', {
      userId: user.id,
      organizationId: org.id,
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
    const { user, org, supabase } = await organizationForUser();
    if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as {
      role?: unknown;
      job_description?: unknown;
    };

    const role = roleName(body.role);
    if (!validRoleName(role)) return NextResponse.json({ error: 'Role name must be 2-120 characters' }, { status: 400 });

    const jobDescription = stringField(body.job_description);
    if (jobDescription.length > 12000) {
      return NextResponse.json({ error: 'Job description must be 12,000 characters or fewer' }, { status: 400 });
    }

    const { count } = await supabase
      .from('role_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id);

    const timestamp = new Date().toISOString();
    const { data: profile, error } = await supabase
      .from('role_profiles')
      .upsert({
        organization_id: org.id,
        role,
        job_description: jobDescription,
        status: 'active',
        display_order: ((count ?? 0) + 1) * 10,
        updated_at: timestamp,
      }, { onConflict: 'organization_id,role' })
      .select('*')
      .single();

    if (error || !profile) throw error ?? new Error('Role profile insert failed');

    log.info('role_profile_added', {
      userId: user.id,
      organizationId: org.id,
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
    const { user, org, supabase } = await organizationForUser();
    if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as {
      role?: unknown;
      job_description?: unknown;
    };

    const role = roleName(body.role);
    if (!validRoleName(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

    const jobDescription = stringField(body.job_description);
    if (jobDescription.length > 12000) {
      return NextResponse.json({ error: 'Job description must be 12,000 characters or fewer' }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const { data: profile, error } = await supabase
      .from('role_profiles')
      .upsert({
        organization_id: org.id,
        role,
        job_description: jobDescription,
        status: 'active',
        updated_at: timestamp,
      }, { onConflict: 'organization_id,role' })
      .select('*')
      .single();

    if (error || !profile) throw error ?? new Error('Role profile upsert failed');

    log.info('role_profile_saved', {
      userId: user.id,
      organizationId: org.id,
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
    const { user, org, supabase } = await organizationForUser();
    if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const role = roleName(request.nextUrl.searchParams.get('role'));
    if (!validRoleName(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

    const timestamp = new Date().toISOString();
    const { data: profile, error } = await supabase
      .from('role_profiles')
      .update({ status: 'archived', updated_at: timestamp })
      .eq('organization_id', org.id)
      .eq('role', role)
      .select('*')
      .single();

    if (error || !profile) return NextResponse.json({ error: 'Role not found' }, { status: 404 });

    await Promise.all([
      supabase
        .from('ramp_milestones')
        .update({ status: 'archived', updated_at: timestamp })
        .eq('organization_id', org.id)
        .eq('role', role)
        .eq('status', 'active'),
      supabase
        .from('milestone_proposals')
        .update({ status: 'rejected', rejected_at: timestamp, updated_at: timestamp })
        .eq('organization_id', org.id)
        .eq('role', role)
        .eq('status', 'draft'),
    ]);

    log.info('role_profile_archived', {
      userId: user.id,
      organizationId: org.id,
      role,
    });

    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/role-profiles] DELETE failed', error);
    return NextResponse.json({ error: 'Failed to remove role', detail: message }, { status: 500 });
  }
}
