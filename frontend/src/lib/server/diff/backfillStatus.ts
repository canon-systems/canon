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
  const { data: source } = await supabase
    .from('workspace_sources')
    .select('status_payload')
    .eq('id', sourceId)
    .maybeSingle();

  const statusPayload = asRecord(source?.status_payload);
  const existingBackfill = asRecord(statusPayload.backfill);
  const mergedBackfill = {
    ...existingBackfill,
    ...patch,
    updated_at: patch.updated_at ?? new Date().toISOString(),
  };

  await supabase
    .from('workspace_sources')
    .update({
      status_payload: {
        ...statusPayload,
        backfill: mergedBackfill,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceId);
}

