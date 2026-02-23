import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkspaceSignalSettings } from '@/lib/server/signals/types';
import { DEFAULT_SIGNAL_TIME_ZONE, normalizeTimeZone, parseTimeZoneParam } from '@/lib/server/signals/window';

const DEFAULTS: Omit<WorkspaceSignalSettings, 'user_id'> = {
  baseline_window_days: 7,
  time_zone: DEFAULT_SIGNAL_TIME_ZONE,
  slack_channel: null,
  email_digest_enabled: false,
  email_digest_to: null,
  delivery_preference: 'slack_only',
};

function isMissingTimeZoneColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  return message.includes('time_zone') && message.includes('does not exist');
}

async function upsertSettingsRow(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('workspace_signal_settings').upsert(payload, { onConflict: 'user_id' });
  if (!error) return;
  if (!('time_zone' in payload) || !isMissingTimeZoneColumnError(error)) {
    throw new Error(error.message || 'Failed to upsert workspace signal settings');
  }

  const legacyPayload = { ...payload };
  delete legacyPayload.time_zone;
  const { error: legacyError } = await supabase
    .from('workspace_signal_settings')
    .upsert(legacyPayload, { onConflict: 'user_id' });
  if (legacyError) {
    throw new Error(legacyError.message || 'Failed to upsert workspace signal settings');
  }
}

function clampWindowDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULTS.baseline_window_days;
  const n = Math.floor(value);
  return Math.max(1, Math.min(30, n));
}

function normalizeSettings(userId: string, row?: Record<string, unknown> | null): WorkspaceSignalSettings {
  return {
    user_id: userId,
    baseline_window_days:
      typeof row?.baseline_window_days === 'number'
        ? clampWindowDays(row.baseline_window_days)
        : DEFAULTS.baseline_window_days,
    time_zone:
      typeof row?.time_zone === 'string' && parseTimeZoneParam(row.time_zone)
        ? normalizeTimeZone(row.time_zone, DEFAULTS.time_zone)
        : DEFAULTS.time_zone,
    slack_channel: typeof row?.slack_channel === 'string' && row.slack_channel.trim().length > 0 ? row.slack_channel.trim() : null,
    email_digest_enabled: row?.email_digest_enabled === true,
    email_digest_to:
      typeof row?.email_digest_to === 'string' && row.email_digest_to.trim().length > 0
        ? row.email_digest_to.trim()
        : null,
    delivery_preference:
      row?.delivery_preference === 'slack_only' ||
      row?.delivery_preference === 'email_only' ||
      row?.delivery_preference === 'slack_then_email'
        ? row.delivery_preference
        : DEFAULTS.delivery_preference,
  };
}

export async function getWorkspaceSignalSettings(params: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<WorkspaceSignalSettings> {
  const { supabase, userId } = params;
  const { data } = (await supabase
    .from('workspace_signal_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()) as { data: Record<string, unknown> | null };

  if (data) return normalizeSettings(userId, data);

  const payload = {
    user_id: userId,
    ...DEFAULTS,
    updated_at: new Date().toISOString(),
  };

  await upsertSettingsRow(supabase, payload as unknown as Record<string, unknown>);
  return normalizeSettings(userId, payload as unknown as Record<string, unknown>);
}

export async function updateWorkspaceSignalSettings(params: {
  supabase: SupabaseClient;
  userId: string;
  patch: Partial<Omit<WorkspaceSignalSettings, 'user_id'>>;
}): Promise<WorkspaceSignalSettings> {
  const { supabase, userId, patch } = params;
  const current = await getWorkspaceSignalSettings({ supabase, userId });

  const next: WorkspaceSignalSettings = {
    ...current,
    ...patch,
    baseline_window_days:
      typeof patch.baseline_window_days === 'number'
        ? clampWindowDays(patch.baseline_window_days)
        : current.baseline_window_days,
    time_zone:
      typeof patch.time_zone === 'string'
        ? normalizeTimeZone(patch.time_zone, current.time_zone)
        : current.time_zone,
    delivery_preference:
      patch.delivery_preference === 'slack_only' ||
      patch.delivery_preference === 'email_only' ||
      patch.delivery_preference === 'slack_then_email'
        ? patch.delivery_preference
        : current.delivery_preference,
    user_id: userId,
  };

  await upsertSettingsRow(supabase, {
    ...next,
    updated_at: new Date().toISOString(),
  } as Record<string, unknown>);

  return next;
}

export async function resolveSignalSourceIds(params: {
  supabase: SupabaseClient;
  userId: string;
  sourceIds?: string[];
}): Promise<string[]> {
  const { supabase, userId, sourceIds } = params;
  const explicit = Array.isArray(sourceIds) ? sourceIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0) : [];
  if (explicit.length > 0) return explicit;

  const { data: sourceRows } = await supabase
    .from('workspace_sources')
    .select('id, provider')
    .eq('user_id', userId);

  return (sourceRows || [])
    .map((row) => row.id as string)
    .filter((id, idx, arr) => arr.indexOf(id) === idx);
}
