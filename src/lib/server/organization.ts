import { auth, clerkClient } from '@clerk/nextjs/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { CanonUser } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export type OrganizationRole = 'owner' | 'admin' | 'member';

export type CurrentOrganization = {
  id: string;
  clerk_org_id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  role: OrganizationRole;
};

export type ClerkOrganizationDetails = {
  clerkOrgId: string;
  name: string;
  slug: string;
  ownerId: string | null;
  role: OrganizationRole;
};

type SupabaseErrorLike = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

class WorkspaceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'WorkspaceError';
    this.status = status;
  }
}

export function roleFromClerk(role: string | null | undefined): OrganizationRole {
  if (role === 'org:owner' || role === 'owner') return 'owner';
  if (role === 'org:admin' || role === 'admin') return 'admin';
  return 'member';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function supabaseErrorMessage(context: string, error: SupabaseErrorLike) {
  const parts = [
    context,
    error.code ? `[${error.code}]` : null,
    error.message,
    error.details ? `Details: ${error.details}` : null,
    error.hint ? `Hint: ${error.hint}` : null,
  ].filter(Boolean);

  return parts.join(' ');
}

function throwSupabaseError(context: string, error: SupabaseErrorLike | null): never {
  if (!error) throw new WorkspaceError(context, 500);
  throw new WorkspaceError(supabaseErrorMessage(context, error), 500);
}

async function activeClerkOrganization(): Promise<ClerkOrganizationDetails> {
  const authState = await auth();
  if (!authState.userId) throw new WorkspaceError('Unauthorized', 401);
  if (!authState.orgId) throw new WorkspaceError('Organization setup required', 428);

  const client = await clerkClient();
  const organization = await client.organizations.getOrganization({
    organizationId: authState.orgId,
  });

  return {
    clerkOrgId: authState.orgId,
    name: organization.name || 'Canon Workspace',
    slug: organization.slug || `${slugify(organization.name || 'workspace')}-${authState.orgId.slice(-8)}`,
    ownerId: organization.createdBy ?? authState.userId,
    role: roleFromClerk(authState.orgRole),
  };
}

export async function ensureCanonOrganizationForClerkOrg(
  supabase: SupabaseClient,
  clerkOrg: ClerkOrganizationDetails
): Promise<CurrentOrganization> {
  const { data: organization, error } = await supabase
    .from('organizations')
    .upsert(
      {
        clerk_org_id: clerkOrg.clerkOrgId,
        name: clerkOrg.name,
        slug: clerkOrg.slug,
        owner_id: clerkOrg.ownerId,
      },
      { onConflict: 'clerk_org_id' }
    )
    .select('id, clerk_org_id, name, slug, owner_id')
    .single();

  if (error || !organization) {
    throwSupabaseError('Failed to prepare organization.', error);
  }

  return {
    ...organization,
    role: clerkOrg.role,
  };
}

async function ensureCanonOrganization(): Promise<CurrentOrganization> {
  const clerkOrg = await activeClerkOrganization();
  const service = createServiceRoleClient();
  return ensureCanonOrganizationForClerkOrg(service, clerkOrg);
}

export async function getOrganizationForUser(
  supabase: SupabaseClient,
  user: CanonUser
): Promise<CurrentOrganization | null> {
  void supabase;
  void user;

  try {
    return await ensureCanonOrganization();
  } catch (error) {
    if (error instanceof WorkspaceError && error.status === 428) return null;
    throw error;
  }
}

export function isWorkspaceAdmin(role: OrganizationRole) {
  return role === 'owner' || role === 'admin';
}

export async function requireWorkspace(user?: CanonUser) {
  void user;

  const supabase = createServiceRoleClient();
  const organization = await ensureCanonOrganization();
  return { supabase, organization };
}

export async function requireWorkspaceAdmin(user?: CanonUser) {
  const context = await requireWorkspace(user);

  if (!isWorkspaceAdmin(context.organization.role)) {
    throw new WorkspaceError('Workspace admin access required', 403);
  }

  return context;
}
