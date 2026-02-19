import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkspaceSignalSettings } from '@/lib/server/signals/types';

const DEFAULTS: Omit<WorkspaceSignalSettings, 'user_id'> = {
  baseline_window_days: 7,
  slack_channel: null,
  email_digest_enabled: false,
  email_digest_to: null,
  delivery_preference: 'slack_only',
  source_ids: [],
};

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
    source_ids: Array.isArray(row?.source_ids) ? row!.source_ids.filter((id): id is string => typeof id === 'string') : [],
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

  await supabase.from('workspace_signal_settings').upsert(payload, { onConflict: 'user_id' });
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
    delivery_preference:
      patch.delivery_preference === 'slack_only' ||
      patch.delivery_preference === 'email_only' ||
      patch.delivery_preference === 'slack_then_email'
        ? patch.delivery_preference
        : current.delivery_preference,
    source_ids: Array.isArray(patch.source_ids) ? patch.source_ids : current.source_ids,
    user_id: userId,
  };

  await supabase
    .from('workspace_signal_settings')
    .upsert(
      {
        ...next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

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

  const settings = await getWorkspaceSignalSettings({ supabase, userId });
  if (settings.source_ids.length > 0) return settings.source_ids;

  const { data: sourceRows } = await supabase
    .from('workspace_sources')
    .select('id, provider')
    .eq('user_id', userId)
    .in('provider', ['github', 'jira']);

  return (sourceRows || [])
    .map((row) => row.id as string)
    .filter((id, idx, arr) => arr.indexOf(id) === idx);
}
