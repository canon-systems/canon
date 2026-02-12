import { inngest } from "../client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runReportSchedule, type ReportScheduleRow } from "@/lib/server/schedules/runReportSchedule";
import { getNextRunAt, simpleToRrule } from "@/lib/server/schedules/rrule";

const SCHEDULE_COLS =
  "id, user_id, type, name, enabled, cadence, source_ids, communication, audiences, units, last_run_at, last_run_status, last_run_error, run_at_time, run_at_timezone, run_at_weekday, run_at_month_day, rrule, dtstart, next_run_at";

/**
 * Report schedule tick: event-driven, sleepUntil(next_run_at), run once, then schedule next tick.
 * Triggered by event "report/schedule.tick" with data { scheduleId, next_run_at }.
 * Also triggered when a schedule is created/updated (API sends first tick).
 */
export const reportScheduleTick = inngest.createFunction(
  {
    id: "report-schedule-tick",
    name: "Canon: Report Schedule Tick",
    retries: 1,
    concurrency: { limit: 5 },
  },
  { event: "report/schedule.tick" },
  async ({ event, step }) => {
    const { scheduleId, next_run_at: nextRunAtIso } = event.data as { scheduleId: string; next_run_at: string };
    if (!scheduleId || !nextRunAtIso) {
      console.error("[report-schedule-tick] Missing scheduleId or next_run_at");
      return { error: "Missing scheduleId or next_run_at" };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.error("[report-schedule-tick] Missing Supabase env");
      return { error: "Missing Supabase env" };
    }

    const runAt = new Date(nextRunAtIso);
    if (Number.isNaN(runAt.getTime())) {
      console.error("[report-schedule-tick] Invalid next_run_at", nextRunAtIso);
      return { error: "Invalid next_run_at" };
    }

    await step.sleepUntil("wait-until-run", runAt);

    const supabase = createServiceRoleClient();
    const { data: row, error: fetchError } = await supabase
      .from("report_schedules")
      .select(SCHEDULE_COLS)
      .eq("id", scheduleId)
      .maybeSingle();

    if (fetchError) {
      console.error("[report-schedule-tick] Failed to fetch schedule", scheduleId, fetchError);
      return { error: fetchError.message };
    }
    if (!row || !row.enabled) {
      return { skipped: true, reason: "schedule not found or disabled" };
    }

    const schedule = row as ReportScheduleRow;

    if (!schedule.rrule || !schedule.dtstart) {
      const simple = simpleToRrule({
        cadence: schedule.cadence ?? "daily",
        runAtTime: schedule.run_at_time ?? null,
        runAtWeekday: schedule.run_at_weekday ?? null,
        runAtMonthDay: schedule.run_at_month_day ?? null,
      });
      if (simple) {
        const afterNow = getNextRunAt(simple.rrule, simple.dtstart, new Date());
        if (afterNow) {
          await supabase
            .from("report_schedules")
            .update({
              rrule: simple.rrule,
              dtstart: simple.dtstart.toISOString(),
              next_run_at: afterNow.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", scheduleId);
          await step.sendEvent("next-tick-after-backfill", {
            name: "report/schedule.tick",
            data: { scheduleId, next_run_at: afterNow.toISOString() },
          });
          return { backfilled: true, next_run_at: afterNow.toISOString() };
        }
      }
      return { error: "Could not backfill rrule for legacy schedule" };
    }

    const result = await step.run("run-report", async () => {
      return runReportSchedule(schedule, supabase);
    });

    if (result.status !== "succeeded") {
      const next = getNextRunAt(schedule.rrule, schedule.dtstart, new Date());
      if (next) {
        await supabase
          .from("report_schedules")
          .update({ next_run_at: next.toISOString(), updated_at: new Date().toISOString() })
          .eq("id", scheduleId);
        await step.sendEvent("next-tick-after-failure", {
          name: "report/schedule.tick",
          data: { scheduleId, next_run_at: next.toISOString() },
        });
      }
      return { executed: false, error: result.error, next_run_at: next?.toISOString() ?? null };
    }

    const now = new Date();
    const next = getNextRunAt(schedule.rrule, schedule.dtstart, now);
    if (!next) {
      return { executed: true, next_run_at: null };
    }

    await step.run("update-next-run", async () => {
      await supabase
        .from("report_schedules")
        .update({ next_run_at: next.toISOString(), updated_at: now.toISOString() })
        .eq("id", scheduleId);
      return { next_run_at: next.toISOString() };
    });

    await step.sendEvent("next-tick", {
      name: "report/schedule.tick",
      data: { scheduleId, next_run_at: next.toISOString() },
    });

    return { executed: true, next_run_at: next.toISOString() };
  }
);

/**
 * Bootstrap: once per day, find enabled schedules with no next_run_at (legacy or new),
 * backfill rrule/dtstart/next_run_at from simple fields, and send first tick.
 */
export const reportScheduleBootstrap = inngest.createFunction(
  {
    id: "report-schedule-bootstrap",
    name: "Canon: Report Schedule Bootstrap",
    retries: 1,
    concurrency: { limit: 1 },
  },
  { cron: "0 2 * * *" },
  async ({ step }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return { error: "Missing Supabase env" };
    }
    const supabase = createServiceRoleClient();
    const { data: rows, error } = await supabase
      .from("report_schedules")
      .select("id, cadence, run_at_time, run_at_weekday, run_at_month_day")
      .eq("enabled", true)
      .is("next_run_at", null);

    if (error) {
      console.error("[report-schedule-bootstrap] Failed to fetch", error);
      return { error: error.message };
    }
    if (!rows?.length) {
      return { bootstrapped: 0 };
    }

    const events: { name: string; data: { scheduleId: string; next_run_at: string } }[] = [];
    const now = new Date();
    for (const row of rows) {
      const simple = simpleToRrule({
        cadence: (row.cadence as string) ?? "daily",
        runAtTime: (row.run_at_time as string | null) ?? null,
        runAtWeekday: (row.run_at_weekday as number | null) ?? null,
        runAtMonthDay: (row.run_at_month_day as number | null) ?? null,
      });
      if (!simple) continue;
      const nextRunAt = getNextRunAt(simple.rrule, simple.dtstart, now);
      if (!nextRunAt) continue;
      await supabase
        .from("report_schedules")
        .update({
          rrule: simple.rrule,
          dtstart: simple.dtstart.toISOString(),
          next_run_at: nextRunAt.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", row.id);
      events.push({
        name: "report/schedule.tick",
        data: { scheduleId: row.id, next_run_at: nextRunAt.toISOString() },
      });
    }
    if (events.length > 0) {
      await step.sendEvent("bootstrap-ticks", events);
    }
    return { bootstrapped: events.length };
  }
);
