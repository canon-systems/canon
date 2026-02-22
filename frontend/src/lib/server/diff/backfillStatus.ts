import type { SupabaseClient } from '@supabase/supabase-js';

type BackfillStatusPatch = {
  status?: string;
  progress_pct?: number;
  step_label?: string;
  error?: string | null;
  updated_at?: string;
};

type WebhookStatusPatch = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readSourceStatusPayload(params: {
  supabase: SupabaseClient;
  sourceId: string;
}): Promise<Record<string, unknown>> {
  const { supabase, sourceId } = params;
  const { data: source, error: readError } = await supabase
    .from('workspace_sources')
    .select('status_payload')
    .eq('id', sourceId)
    .maybeSingle();
  if (readError) {
    throw new Error(`Failed to read status payload for ${sourceId}: ${readError.message}`);
  }
  return asRecord(source?.status_payload);
}

export async function patchSourceBackfillStatus(params: {
  supabase: SupabaseClient;
  sourceId: string;
  patch: BackfillStatusPatch;
}): Promise<void> {
  const { supabase, sourceId, patch } = params;
  const statusPayload = await readSourceStatusPayload({ supabase, sourceId });
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

export async function patchSourceWebhookStatus(params: {
  supabase: SupabaseClient;
  sourceId: string;
  patch: WebhookStatusPatch;
}): Promise<void> {
  const { supabase, sourceId, patch } = params;
  const statusPayload = await readSourceStatusPayload({ supabase, sourceId });
  const existingWebhook = asRecord(statusPayload.webhook);
  const mergedWebhook = {
    ...existingWebhook,
    ...patch,
    updated_at:
      typeof patch.updated_at === 'string' && patch.updated_at.trim().length > 0
        ? patch.updated_at
        : new Date().toISOString(),
  };

  const { error: writeError } = await supabase
    .from('workspace_sources')
    .update({
      status_payload: {
        ...statusPayload,
        webhook: mergedWebhook,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceId);
  if (writeError) {
    throw new Error(`Failed to update webhook status for ${sourceId}: ${writeError.message}`);
  }
}
