import type { SupabaseClient } from '@supabase/supabase-js';

type BackfillStatusPatch = {
  status?: string;
  progress_pct?: number;
  step_label?: string;
  error?: string | null;
  updated_at?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function patchSourceBackfillStatus(params: {
  supabase: SupabaseClient;
  sourceId: string;
  patch: BackfillStatusPatch;
}): Promise<void> {
  const { supabase, sourceId, patch } = params;
  const { data: source, error: readError } = await supabase
    .from('workspace_sources')
    .select('status_payload')
    .eq('id', sourceId)
    .maybeSingle();
  if (readError) {
    throw new Error(`Failed to read backfill status for ${sourceId}: ${readError.message}`);
  }

  const statusPayload = asRecord(source?.status_payload);
  const existingBackfill = asRecord(statusPayload.backfill);
  const mergedBackfill = {
    ...existingBackfill,
    ...patch,
    updated_at: patch.updated_at ?? new Date().toISOString(),
  };

  const { error: writeError } = await supabase
    .from('workspace_sources')
    .update({
      status_payload: {
        ...statusPayload,
        backfill: mergedBackfill,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceId);
  if (writeError) {
    throw new Error(`Failed to update backfill status for ${sourceId}: ${writeError.message}`);
  }
}
