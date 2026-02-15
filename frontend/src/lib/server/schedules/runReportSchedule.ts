import { runSignalEngine, sortSignalsByPriority } from '@/lib/server/signals/engine';
import { getWorkspaceSignalSettings, resolveSignalSourceIds } from '@/lib/server/signals/settings';
import {
  formatAlertMessage,
  formatWeeklyDigestMessage,
  isSevereAlertSignal,
  sendSlackMessage,
} from '@/lib/server/signals/delivery';
import { trackAutomationRun } from '@/lib/server/services/usageTracking';
import { resolveSignalPrimaryWindow } from './windowConfig';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ReportScheduleRow = {
  id: string;
  user_id: string;
  type: 'diff' | 'projection';
  name: string | null;
  enabled: boolean;
  cadence: string;
  source_ids: string[];
  communication: Record<string, unknown>;
  audiences: string[];
  units: string[];
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  run_at_time?: string | null;
  run_at_timezone?: string | null;
  run_at_weekday?: number | null;
  run_at_month_day?: number | null;
  rrule?: string | null;
  dtstart?: string | null;
  next_run_at?: string | null;
};

function resolveWindow(schedule: ReportScheduleRow, now: Date): {
  window: { start: string; end: string };
  windowDays: number;
} {
  const resolved = resolveSignalPrimaryWindow({
    communication: schedule.communication || {},
    cadence: schedule.cadence,
    now,
  });
  return {
    window: {
      start: resolved.start,
      end: resolved.end,
    },
    windowDays: resolved.windowDays,
  };
}

async function persistRunResult(params: {
  supabase: SupabaseClient;
  schedule: ReportScheduleRow;
  executedAt: string;
  status: 'succeeded' | 'failed';
  executionTimeMs: number;
  summary?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}): Promise<string | undefined> {
  const { supabase, schedule, executedAt, status, executionTimeMs, summary, errors } = params;

  const { data, error } = await supabase
    .from('report_schedule_runs')
    .insert({
      user_id: schedule.user_id,
      report_schedule_id: schedule.id,
      executed_at: executedAt,
      trigger_type: 'scheduled',
      status,
      execution_time_ms: executionTimeMs,
      result_summary: summary || {},
      errors: errors || [],
    })
    .select('id')
    .single();

  if (error) {
    console.error('[runReportSchedule] insert run error', error);
    return undefined;
  }

  return data?.id;
}

/**
 * Phase II schedule runner.
 * Every schedule now executes signal intelligence only.
 */
export async function runReportSchedule(
  schedule: ReportScheduleRow,
  supabase: SupabaseClient
): Promise<{ status: 'succeeded' | 'failed'; runId?: string; error?: string }> {
  const startedAt = Date.now();
  const now = new Date();
  const executedAt = now.toISOString();

  try {
    const settings = await getWorkspaceSignalSettings({
      supabase,
      userId: schedule.user_id,
    });

    const sourceIds = await resolveSignalSourceIds({
      supabase,
      userId: schedule.user_id,
      sourceIds: Array.isArray(schedule.source_ids) ? schedule.source_ids : [],
    });

    const { window, windowDays } = resolveWindow(schedule, now);

    const signalRun = await runSignalEngine({
      supabase,
      userId: schedule.user_id,
      sourceIds,
      window,
      triggerType: 'scheduled',
    });

    const rankedSignals = sortSignalsByPriority(signalRun.signals);
    const topSignals = rankedSignals.slice(0, 3);

    let weeklyDigest = { sent: false, reason: 'not_applicable' } as { sent: boolean; reason?: string };
    if (String(schedule.cadence).toLowerCase() === 'weekly') {
      weeklyDigest = await sendSlackMessage({
        supabase,
        userId: schedule.user_id,
        channel: settings.slack_channel,
        text: formatWeeklyDigestMessage({
          window,
          signals: topSignals,
        }),
      });
    }

    const severeSignal = rankedSignals.find((signal) => isSevereAlertSignal(signal));
    let alert = { sent: false, reason: 'none_triggered' } as { sent: boolean; reason?: string };
    if (severeSignal) {
      alert = await sendSlackMessage({
        supabase,
        userId: schedule.user_id,
        channel: settings.slack_channel,
        text: formatAlertMessage(severeSignal),
      });
    }

    const executionTimeMs = Date.now() - startedAt;
    const runId = await persistRunResult({
      supabase,
      schedule,
      executedAt,
      status: 'succeeded',
      executionTimeMs,
      summary: {
        type: 'signals',
        window,
        window_days: windowDays,
        signal_run_id: signalRun.runId,
        signals_count: rankedSignals.length,
        top_signal_ids: topSignals.map((signal) => signal.id),
        weekly_digest_sent: weeklyDigest.sent,
        weekly_digest_reason: weeklyDigest.reason ?? null,
        alert_sent: alert.sent,
        alert_reason: alert.reason ?? null,
      },
    });

    await supabase
      .from('report_schedules')
      .update({
        last_run_at: executedAt,
        last_run_status: 'succeeded',
        last_run_error: null,
        updated_at: executedAt,
      })
      .eq('id', schedule.id)
      .eq('user_id', schedule.user_id);

    const sourceId = sourceIds[0] ?? schedule.id;
    trackAutomationRun(supabase, schedule.user_id, {
      sourceId,
      triggerType: 'scheduled',
      status: 'succeeded',
      executionTimeMs,
      automationRuleId: schedule.id,
      documentsUpdated: topSignals.length,
    }).catch((e) => console.warn('[runReportSchedule] track automation run failed', e));

    return { status: 'succeeded', runId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[runReportSchedule] error', err);

    await supabase
      .from('report_schedules')
      .update({
        last_run_at: executedAt,
        last_run_status: 'failed',
        last_run_error: message,
        updated_at: executedAt,
      })
      .eq('id', schedule.id)
      .eq('user_id', schedule.user_id);

    await persistRunResult({
      supabase,
      schedule,
      executedAt,
      status: 'failed',
      executionTimeMs: Date.now() - startedAt,
      errors: [{ message }],
      summary: {
        type: 'signals',
      },
    });

    const failSourceId = (Array.isArray(schedule.source_ids) ? schedule.source_ids[0] : null) ?? schedule.id;
    trackAutomationRun(supabase, schedule.user_id, {
      sourceId: failSourceId,
      triggerType: 'scheduled',
      status: 'failed',
      executionTimeMs: Date.now() - startedAt,
      automationRuleId: schedule.id,
      errors: [message],
    }).catch((e) => console.warn('[runReportSchedule] track automation run failed', e));

    return { status: 'failed', error: message };
  }
}
