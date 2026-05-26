import type { SupabaseClient } from '@supabase/supabase-js';

type AppSupabaseClient = SupabaseClient;

type DeleteErrorLike = {
  code?: string;
  message?: string;
};

export function isMissingSchemaError(error: DeleteErrorLike | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === '42703' || error.code === '42704' || error.code === 'PGRST205') return true;
  const message = (error.message || '').toLowerCase();
  if (message.includes('relation') && message.includes('does not exist')) return true;
  if (message.includes('column') && message.includes('does not exist')) return true;
  if (message.includes('could not find the table') && message.includes('schema cache')) return true;
  return false;
}

async function deleteBySourceId(params: {
  supabase: AppSupabaseClient;
  table: string;
  sourceId: string;
}) {
  const { supabase, table, sourceId } = params;
  const { error } = await supabase.from(table).delete().eq('source_id', sourceId);
  if (error && !isMissingSchemaError(error)) {
    throw error;
  }
}

export async function deleteSourceDependents(params: {
  supabase: AppSupabaseClient;
  userId: string;
  sourceId: string;
}) {
  const { supabase, userId, sourceId } = params;

  const { data: signalRuns, error: signalRunFetchError } = (await supabase
    .from('signal_runs')
    .select('id')
    .eq('user_id', userId)
    .contains('source_ids', [sourceId])) as { data: Array<{ id: string }> | null; error: DeleteErrorLike | null };
  if (signalRunFetchError && !isMissingSchemaError(signalRunFetchError)) {
    throw signalRunFetchError;
  }

  const signalRunIds = (signalRuns || []).map((row) => row.id).filter((id) => id.length > 0);
  if (signalRunIds.length > 0) {
    const { data: signals, error: signalFetchError } = (await supabase
      .from('signals')
      .select('id')
      .eq('user_id', userId)
      .in('signal_run_id', signalRunIds)) as { data: Array<{ id: string }> | null; error: DeleteErrorLike | null };
    if (signalFetchError && !isMissingSchemaError(signalFetchError)) {
      throw signalFetchError;
    }

    const signalIds = (signals || []).map((row) => row.id).filter((id) => id.length > 0);
    if (signalIds.length > 0) {
      const { error: evidenceDeleteError } = await supabase
        .from('signal_evidence')
        .delete()
        .eq('user_id', userId)
        .in('signal_id', signalIds);
      if (evidenceDeleteError && !isMissingSchemaError(evidenceDeleteError)) {
        throw evidenceDeleteError;
      }

      const { error: signalDeleteError } = await supabase
        .from('signals')
        .delete()
        .eq('user_id', userId)
        .in('id', signalIds);
      if (signalDeleteError && !isMissingSchemaError(signalDeleteError)) {
        throw signalDeleteError;
      }
    }

    const { error: signalRunDeleteError } = await supabase
      .from('signal_runs')
      .delete()
      .eq('user_id', userId)
      .in('id', signalRunIds);
    if (signalRunDeleteError && !isMissingSchemaError(signalRunDeleteError)) {
      throw signalRunDeleteError;
    }
  }

  await Promise.all([
    deleteBySourceId({ supabase, table: 'diff_event_raw', sourceId }),
    deleteBySourceId({ supabase, table: 'diff_event_canonical', sourceId }),
    deleteBySourceId({ supabase, table: 'diff_daily_metrics', sourceId }),
  ]);

  const { error: usageDeleteError } = await supabase
    .from('usage_events')
    .delete()
    .eq('user_id', userId)
    .eq('source_id', sourceId);
  if (usageDeleteError && !isMissingSchemaError(usageDeleteError)) {
    throw usageDeleteError;
  }
}
