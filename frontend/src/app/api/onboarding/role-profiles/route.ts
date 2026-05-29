import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/server/logging';
import type { HireRole } from '@/types/onboarding';

export const dynamic = 'force-dynamic';

const validRoles: HireRole[] = ['AI Solutions Architect', 'Solutions Engineer', 'Implementation Engineer'];

const log = createLogger('api.onboarding.role_profiles', {
  label: 'Role Profiles API',
  eventLabels: {
    role_profiles_loaded: 'Role Profiles Loaded',
    role_profile_saved: 'Role Profile Saved',
  },
});

function isRole(value: unknown): value is HireRole {
  return typeof value === 'string' && validRoles.includes(value as HireRole);
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
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

export async function GET(request: NextRequest) {
  try {
    const { user, org, supabase } = await organizationForUser();
    if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const roleParam = request.nextUrl.searchParams.get('role');
    if (roleParam && !isRole(roleParam)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

    if (!org) return NextResponse.json({ profiles: [] });

    let query = supabase
      .from('role_profiles')
      .select('*')
      .eq('organization_id', org.id)
      .order('role', { ascending: true });

    if (roleParam) query = query.eq('role', roleParam);

    const { data: profiles, error } = await query;
    if (error) throw error;

    log.debug('role_profiles_loaded', {
      userId: user.id,
      organizationId: org.id,
      role: roleParam ?? 'all',
      profileCount: profiles?.length ?? 0,
    });

    return NextResponse.json({ profiles: profiles ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api/onboarding/role-profiles] GET failed', error);
    return NextResponse.json({ error: 'Failed to load role profiles', detail: message }, { status: 500 });
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

    if (!isRole(body.role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

    const jobDescription = stringField(body.job_description);
    if (jobDescription.length > 12000) {
      return NextResponse.json({ error: 'Job description must be 12,000 characters or fewer' }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const { data: profile, error } = await supabase
      .from('role_profiles')
      .upsert({
        organization_id: org.id,
        role: body.role,
        job_description: jobDescription,
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
