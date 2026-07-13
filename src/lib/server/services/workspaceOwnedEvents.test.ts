import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { deleteSourceDependents } from './sourceCleanup';
import { trackIntegrationStateChanged } from './usageTracking';

type QueryCall =
  | { method: 'from'; table: string }
  | { method: 'select'; table: string; columns: string }
  | { method: 'delete'; table: string }
  | { method: 'insert'; table: string; values: unknown }
  | { method: 'eq'; table: string; column: string; value: unknown }
  | { method: 'in'; table: string; column: string; values: unknown[] }
  | { method: 'contains'; table: string; column: string; value: unknown };

type Result = {
  data?: unknown;
  error?: unknown;
};

function createSupabaseSpy(results: Record<string, Result> = {}) {
  const calls: QueryCall[] = [];

  function queryFor(table: string) {
    let operation = 'select';

    const query = {
      select(columns: string) {
        operation = 'select';
        calls.push({ method: 'select', table, columns });
        return query;
      },
      delete() {
        operation = 'delete';
        calls.push({ method: 'delete', table });
        return query;
      },
      insert(values: unknown) {
        operation = 'insert';
        calls.push({ method: 'insert', table, values });
        return Promise.resolve({ error: null });
      },
      eq(column: string, value: unknown) {
        calls.push({ method: 'eq', table, column, value });
        return query;
      },
      in(column: string, values: unknown[]) {
        calls.push({ method: 'in', table, column, values });
        return query;
      },
      contains(column: string, value: unknown) {
        calls.push({ method: 'contains', table, column, value });
        return query;
      },
      then<TResult1 = Result, TResult2 = never>(
        onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) {
        const result = results[`${table}:${operation}`] ?? { data: null, error: null };
        return Promise.resolve(result).then(onfulfilled, onrejected);
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

describe('workspace-owned event helpers', () => {
  it('uses organization id when cleaning source dependents from legacy event tables', async () => {
    const { supabase, calls } = createSupabaseSpy({
      'signal_runs:select': { data: [{ id: 'run_1' }], error: null },
      'signals:select': { data: [{ id: 'signal_1' }], error: null },
    });

    await deleteSourceDependents({
      supabase,
      organizationId: 'org_123',
      sourceId: 'source_123',
    });

    const organizationFilters = calls.filter(
      (call): call is Extract<QueryCall, { method: 'eq' }> => call.method === 'eq' && call.column === 'organization_id'
    );
    const userIdFilters = calls.filter(
      (call): call is Extract<QueryCall, { method: 'eq' }> => call.method === 'eq' && call.column === 'user_id'
    );

    expect(organizationFilters.length).toBeGreaterThan(0);
    expect(organizationFilters.every((call) => call.value === 'org_123')).toBe(true);
    expect(userIdFilters).toEqual([]);
  });

  it('writes integration usage events with organization id', async () => {
    const { supabase, calls } = createSupabaseSpy();

    await trackIntegrationStateChanged(supabase, 'org_123', 'connected', 'slack', 'conn_123');

    const insertCall = calls.find((call): call is Extract<QueryCall, { method: 'insert' }> => call.method === 'insert');

    expect(insertCall).toEqual({
      method: 'insert',
      table: 'usage_events',
      values: {
        organization_id: 'org_123',
        source_id: null,
        event_type: 'integration_connected',
        metadata: {
          provider: 'slack',
          connection_id: 'conn_123',
        },
        created_at: expect.any(String),
      },
    });
  });
});
