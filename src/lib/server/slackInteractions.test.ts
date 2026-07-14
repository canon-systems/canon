import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { getAccessRequestContext } from './slackInteractions';

type QueryCall =
  | { method: 'from'; table: string }
  | { method: 'select'; table: string; columns: string }
  | { method: 'eq'; table: string; column: string; value: unknown }
  | { method: 'single'; table: string }
  | { method: 'maybeSingle'; table: string };

type Result = {
  data?: Record<string, unknown> | null;
  error?: unknown;
};

function createSupabaseSpy(results: Record<string, Result>) {
  const calls: QueryCall[] = [];

  function queryFor(table: string) {
    const query = {
      select(columns: string) {
        calls.push({ method: 'select', table, columns });
        return query;
      },
      eq(column: string, value: unknown) {
        calls.push({ method: 'eq', table, column, value });
        return query;
      },
      single() {
        calls.push({ method: 'single', table });
        return Promise.resolve(results[`${table}:single`] ?? { data: null, error: null });
      },
      maybeSingle() {
        calls.push({ method: 'maybeSingle', table });
        return Promise.resolve(results[`${table}:maybeSingle`] ?? { data: null, error: null });
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

describe('Slack interaction access request context', () => {
  it('returns organization context when Slack team matches the active workspace connection', async () => {
    const { supabase, calls } = createSupabaseSpy({
      'access_requests:single': {
        data: {
          id: 'request_123',
          tool_name: 'GitHub',
          new_hire_id: 'hire_123',
          new_hires: { organization_id: 'org_123' },
        },
        error: null,
      },
      'oauth_connections:maybeSingle': {
        data: { metadata: { team_id: 'T123' } },
        error: null,
      },
    });

    await expect(getAccessRequestContext({
      supabase,
      accessRequestId: 'request_123',
      slackTeamId: 'T123',
    })).resolves.toEqual({
      id: 'request_123',
      tool_name: 'GitHub',
      new_hire_id: 'hire_123',
      organization_id: 'org_123',
    });

    expect(calls).toContainEqual({ method: 'eq', table: 'oauth_connections', column: 'organization_id', value: 'org_123' });
    expect(calls).toContainEqual({ method: 'eq', table: 'oauth_connections', column: 'provider', value: 'slack' });
    expect(calls).toContainEqual({ method: 'eq', table: 'oauth_connections', column: 'status', value: 'active' });
  });

  it('rejects Slack interaction context when the team does not match the active connection', async () => {
    const { supabase } = createSupabaseSpy({
      'access_requests:single': {
        data: {
          id: 'request_123',
          tool_name: 'GitHub',
          new_hire_id: 'hire_123',
          new_hires: { organization_id: 'org_123' },
        },
        error: null,
      },
      'oauth_connections:maybeSingle': {
        data: { metadata: { team_id: 'T_OTHER' } },
        error: null,
      },
    });

    await expect(getAccessRequestContext({
      supabase,
      accessRequestId: 'request_123',
      slackTeamId: 'T123',
    })).resolves.toBeNull();
  });

  it('does not require Slack team metadata when Slack omits team id', async () => {
    const { supabase, calls } = createSupabaseSpy({
      'access_requests:single': {
        data: {
          id: 'request_123',
          tool_name: 'GitHub',
          new_hire_id: 'hire_123',
          new_hires: [{ organization_id: 'org_123' }],
        },
        error: null,
      },
    });

    await expect(getAccessRequestContext({
      supabase,
      accessRequestId: 'request_123',
    })).resolves.toMatchObject({
      organization_id: 'org_123',
      new_hire_id: 'hire_123',
    });

    expect(calls.some((call) => call.method === 'from' && call.table === 'oauth_connections')).toBe(false);
  });
});
