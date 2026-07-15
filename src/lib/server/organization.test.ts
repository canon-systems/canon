import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  ensureCanonOrganizationForClerkOrg,
  isWorkspaceAdmin,
  roleFromClerk,
  type ClerkOrganizationDetails,
} from './organization';

type QueryCall =
  | { method: 'from'; table: string }
  | { method: 'upsert'; table: string; values: unknown; options: unknown }
  | { method: 'select'; table: string; columns: string }
  | { method: 'single'; table: string };

function createSupabaseSpy() {
  const calls: QueryCall[] = [];

  function queryFor(table: string) {
    const query = {
      upsert(values: unknown, options: unknown) {
        calls.push({ method: 'upsert', table, values, options });
        return query;
      },
      select(columns: string) {
        calls.push({ method: 'select', table, columns });
        return query;
      },
      single() {
        calls.push({ method: 'single', table });
        return Promise.resolve({
          data: {
            id: 'org_db_123',
            clerk_org_id: 'org_clerk_123',
            name: 'Acme',
            slug: 'acme',
            owner_id: 'user_owner_123',
          },
          error: null,
        });
      },
      then<TResult1 = { error: null }, TResult2 = never>(
        onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) {
        return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
      },
    };

    return query;
  }

  const supabase = {
    from(table: string) {
      calls.push({ method: 'from', table });
      return queryFor(table);
    },
  } as unknown as SupabaseClient;

  return { supabase, calls };
}

function clerkOrg(overrides: Partial<ClerkOrganizationDetails> = {}): ClerkOrganizationDetails {
  return {
    clerkOrgId: 'org_clerk_123',
    name: 'Acme',
    slug: 'acme',
    ownerId: 'user_owner_123',
    role: 'owner',
    ...overrides,
  };
}

describe('organization bootstrap', () => {
  it('maps Clerk organization roles to Canon workspace roles', () => {
    expect(roleFromClerk('org:owner')).toBe('owner');
    expect(roleFromClerk('owner')).toBe('owner');
    expect(roleFromClerk('org:admin')).toBe('admin');
    expect(roleFromClerk('admin')).toBe('admin');
    expect(roleFromClerk('org:member')).toBe('member');

    expect(isWorkspaceAdmin(roleFromClerk('org:owner'))).toBe(true);
    expect(isWorkspaceAdmin(roleFromClerk('org:admin'))).toBe(true);
    expect(isWorkspaceAdmin(roleFromClerk('org:member'))).toBe(false);
  });

  it('upserts the Canon organization by Clerk org id without seeding tenant-specific setup data', async () => {
    const { supabase, calls } = createSupabaseSpy();

    await expect(ensureCanonOrganizationForClerkOrg(supabase, clerkOrg())).resolves.toEqual({
      id: 'org_db_123',
      clerk_org_id: 'org_clerk_123',
      name: 'Acme',
      slug: 'acme',
      owner_id: 'user_owner_123',
      role: 'owner',
    });

    const organizationUpsert = calls.find(
      (call): call is Extract<QueryCall, { method: 'upsert' }> => call.method === 'upsert' && call.table === 'organizations'
    );
    expect(organizationUpsert?.options).toEqual({ onConflict: 'clerk_org_id' });
    expect(organizationUpsert?.values).toEqual({
      clerk_org_id: 'org_clerk_123',
      name: 'Acme',
      slug: 'acme',
      owner_id: 'user_owner_123',
    });

    expect(calls.some((call) => call.method === 'upsert' && call.table === 'role_profiles')).toBe(false);
  });
});
