import { inngest } from "../client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isScheduleDue, isInRunAtHour, isInRunAtWeekday, cadenceUsesWeekday, isInRunAtMonthDay, cadenceUsesMonthDay } from "@/lib/server/schedules/cadence";
import { runReportSchedule, type ReportScheduleRow } from "@/lib/server/schedules/runReportSchedule";

/**
 * Report schedules runner: runs every hour, loads enabled report_schedules,
 * runs each that is due (cadence + last_run_at) and, when run_at_time is set, in the user's chosen hour.
 */
export const runReportSchedules = inngest.createFunction(
  {
    id: "report-schedules-runner",
    name: "Report Schedules Runner (Diff & Projection)",
    retries: 1,
    concurrency: { limit: 1 },
  },
  { cron: "0 * * * *" }, // every hour at :00
  async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.error("[report-schedules] Missing Supabase env");
      return { error: "Missing Supabase env" };
    }

    const supabase = createServiceRoleClient();

    const { data: rows, error } = await supabase
      .from("report_schedules")
      .select("id, user_id, type, name, enabled, cadence, source_ids, communication, audiences, units, last_run_at, last_run_status, last_run_error, run_at_time, run_at_timezone, run_at_weekday, run_at_month_day")
      .eq("enabled", true);

    if (error) {
      console.error("[report-schedules] Failed to fetch schedules", error);
      return { error: error.message };
    }

    if (!rows?.length) {
      return { checked: 0, executed: 0 };
    }

    const now = new Date();
    const due = (rows as ReportScheduleRow[]).filter((row) => {
      const cadenceDue = isScheduleDue(row.last_run_at, row.cadence ?? "daily", now);
      if (!cadenceDue) return false;
      if (row.run_at_time) {
        if (!isInRunAtHour(now, row.run_at_time)) return false;
      }
      if (cadenceUsesWeekday(row.cadence ?? "daily") && row.run_at_weekday != null) {
        if (!isInRunAtWeekday(now, row.run_at_weekday)) return false;
      }
      if (cadenceUsesMonthDay(row.cadence ?? "daily") && row.run_at_month_day != null) {
        if (!isInRunAtMonthDay(now, row.run_at_month_day)) return false;
      }
      return true;
    });

    if (due.length === 0) {
      return { checked: rows.length, executed: 0 };
    }

    console.log(`[report-schedules] Running ${due.length} due schedule(s)`);
    let executed = 0;
    for (const schedule of due) {
      const result = await runReportSchedule(schedule, supabase);
      if (result.status === "succeeded") {
        executed += 1;
      }
    }

    return { checked: rows.length, executed };
  }
);
