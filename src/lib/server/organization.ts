import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { DEFAULT_ROLES } from '@/lib/onboarding/roles';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export type OrganizationRole = 'owner' | 'admin' | 'member';

export type CurrentOrganization = {
  id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  role: OrganizationRole;
};

type OrganizationMembershipRow = {
  role: OrganizationRole;
  organizations: {
    id: string;
    name: string;
    slug: string;
    owner_id: string | null;
  } | null;
};

type WorkspaceCreateInput = {
  name?: string;
};

export class WorkspaceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'WorkspaceError';
    this.status = status;
  }
}

function metadataString(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function workspaceNameForUser(user: User, explicitWorkspaceName?: string) {
  const explicitName = explicitWorkspaceName?.trim();
  if (explicitName) return explicitName;

  const inferredName =
    metadataString(user, 'organization_name') ||
    metadataString(user, 'company_name') ||
    metadataString(user, 'full_name') ||
    metadataString(user, 'name');

  if (inferredName) return `${inferredName}'s Workspace`;

  const emailName = user.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (emailName) return `${emailName}'s Workspace`;

  return 'My Workspace';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function workspaceSlugForUser(user: User, explicitWorkspaceName?: string) {
  const base = slugify(
    explicitWorkspaceName ||
      metadataString(user, 'organization_name') ||
      metadataString(user, 'company_name') ||
      user.email?.split('@')[0] ||
      'workspace'
  );

  return `${base || 'workspace'}-${user.id.slice(0, 8)}`;
}

async function ensureDefaultRoleProfiles(supabase: SupabaseClient, organizationId: string) {
  const rows = DEFAULT_ROLES.map((role, index) => ({
    organization_id: organizationId,
    role,
    display_order: (index + 1) * 10,
    status: 'active',
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('role_profiles')
    .upsert(rows, { onConflict: 'organization_id,role', ignoreDuplicates: true });

  if (error) throw error;
}

async function ensureOwnerMembership(supabase: SupabaseClient, organizationId: string, userId: string) {
  const { error } = await supabase
    .from('organization_members')
    .upsert({
      organization_id: organizationId,
      user_id: userId,
      role: 'owner',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,user_id' });

  if (error) throw error;
}

async function organizationByOwner(supabase: SupabaseClient, user: User): Promise<CurrentOrganization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug, owner_id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  await ensureOwnerMembership(supabase, data.id, user.id);
  await ensureDefaultRoleProfiles(supabase, data.id);

  return { ...data, role: 'owner' };
}

async function organizationByMembership(supabase: SupabaseClient, user: User): Promise<CurrentOrganization | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('role, organizations(id, name, slug, owner_id)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const membership = data as OrganizationMembershipRow | null;
  const organization = membership?.organizations;
  if (!organization || Array.isArray(organization)) return null;

  await ensureDefaultRoleProfiles(supabase, organization.id);

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    owner_id: organization.owner_id,
    role: membership.role,
  };
}

export async function getOrganizationForUser(
  supabase: SupabaseClient,
  user: User
): Promise<CurrentOrganization | null> {
  const byMembership = await organizationByMembership(supabase, user);
  if (byMembership) return byMembership;

  return organizationByOwner(supabase, user);
}

export async function createWorkspaceForUser(
  supabase: SupabaseClient,
  user: User,
  input: WorkspaceCreateInput = {}
): Promise<CurrentOrganization> {
  const existing = await getOrganizationForUser(supabase, user);
  if (existing) return existing;

  const service = createServiceRoleClient();
  const workspaceName = workspaceNameForUser(user, input.name);
  const { data: created, error: createError } = await service
    .from('organizations')
    .insert({
      name: workspaceName,
      slug: workspaceSlugForUser(user, workspaceName),
      owner_id: user.id,
    })
    .select('id, name, slug, owner_id')
    .single();

  if (createError) {
    if (createError.code === '23505') {
      const existing = await organizationByOwner(service, user);
      if (existing) return existing;
    }

    throw createError;
  }

  if (!created) throw new WorkspaceError('Failed to create workspace', 500);

  await ensureOwnerMembership(service, created.id, user.id);
  await ensureDefaultRoleProfiles(service, created.id);

  return { ...created, role: 'owner' };
}

export function isWorkspaceAdmin(role: OrganizationRole) {
  return role === 'owner' || role === 'admin';
}

export async function getWorkspaceContext(user: User) {
  const supabase = await createClient();
  const organization = await getOrganizationForUser(supabase, user);
  if (!organization) {
    throw new WorkspaceError('Workspace setup required', 428);
  }
  return { supabase, organization };
}

export async function requireWorkspace(user: User) {
  return getWorkspaceContext(user);
}

export async function requireWorkspaceAdmin(user: User) {
  const context = await getWorkspaceContext(user);

  if (!isWorkspaceAdmin(context.organization.role)) {
    throw new WorkspaceError('Workspace admin access required', 403);
  }

  return context;
}

export function workspaceErrorResponse(error: unknown, fallback = 'Workspace request failed') {
  if (error instanceof WorkspaceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const detail = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: fallback, detail }, { status: 500 });
}
