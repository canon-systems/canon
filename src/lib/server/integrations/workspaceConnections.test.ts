import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  getActiveWorkspaceConnection,
  upsertWorkspaceConnection,
} from './workspaceConnections';

type QueryCall =
  | { method: 'from'; table: string }
  | { method: 'select'; columns: string }
  | { method: 'eq'; column: string; value: unknown }
  | { method: 'order'; column: string; options: unknown }
  | { method: 'limit'; count: number }
  | { method: 'maybeSingle' }
  | { method: 'upsert'; values: unknown; options: unknown };

function createSupabaseSpy() {
  const calls: QueryCall[] = [];

  const query = {
    select(columns: string) {
      calls.push({ method: 'select', columns });
      return query;
    },
    eq(column: string, value: unknown) {
      calls.push({ method: 'eq', column, value });
      return query;
    },
    order(column: string, options: unknown) {
      calls.push({ method: 'order', column, options });
      return query;
    },
    limit(count: number) {
      calls.push({ method: 'limit', count });
      return query;
    },
    maybeSingle() {
      calls.push({ method: 'maybeSingle' });
      return Promise.resolve({ data: null, error: null });
    },
    upsert(values: unknown, options: unknown) {
      calls.push({ method: 'upsert', values, options });
      return Promise.resolve({ error: null });
    },
  };

  const supabase = {
    from(table: string) {
      calls.push({ method: 'from', table });
      return query;
    },
  } as unknown as SupabaseClient;

  return { supabase, calls };
}

describe('workspace connection helpers', () => {
  it('looks up active connections by organization, provider, and status', async () => {
    const { supabase, calls } = createSupabaseSpy();

    await getActiveWorkspaceConnection(supabase, {
      organizationId: 'org_123',
      provider: 'slack',
    });

    expect(calls).toContainEqual({ method: 'from', table: 'oauth_connections' });
    expect(calls).toContainEqual({ method: 'eq', column: 'organization_id', value: 'org_123' });
    expect(calls).toContainEqual({ method: 'eq', column: 'provider', value: 'slack' });
    expect(calls).toContainEqual({ method: 'eq', column: 'status', value: 'active' });
    expect(calls).not.toContainEqual({ method: 'eq', column: 'user_id', value: 'user_123' });
  });

  it('upserts connections on the organization/provider key and keeps user as audit metadata', async () => {
    const { supabase, calls } = createSupabaseSpy();

    await upsertWorkspaceConnection(supabase, {
      organizationId: 'org_123',
      connectedByUserId: 'user_123',
      provider: 'granola',
      connectionId: 'conn_123',
      metadata: { source: 'nango' },
    });

    const upsertCall = calls.find((call): call is Extract<QueryCall, { method: 'upsert' }> => call.method === 'upsert');

    expect(upsertCall?.options).toEqual({ onConflict: 'organization_id,provider' });
    expect(upsertCall?.values).toMatchObject({
      organization_id: 'org_123',
      user_id: 'user_123',
      provider: 'granola',
      connection_id: 'conn_123',
      status: 'active',
      metadata: {
        source: 'nango',
        organization_id: 'org_123',
        connected_by_user_id: 'user_123',
      },
    });
  });
});
