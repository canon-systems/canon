/**
 * RRULE helpers for report_schedules. UTC only (no tzid in string to avoid rrule.js bugs).
 */

import { RRule } from "rrule";

/** Map 0=Sun, 1=Mon, ... 6=Sat to RRule weekday. */
const WEEKDAY_MAP = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA] as const;

export type SimpleScheduleInput = {
  cadence: string;
  runAtTime: string | null;
  runAtWeekday: number | null;
  runAtMonthDay: number | null;
};

/**
 * Parse "HH:mm" (24h) into hour and minute. Returns { hour, minute } or null.
 */
function parseTime(s: string | null | undefined): { hour: number; minute: number } | null {
  if (!s || typeof s !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Build RRULE string and dtstart (UTC) from simple schedule fields.
 * Used when creating/updating schedules from UI (cadence + run_at_time + optional weekday/monthday).
 */
export function simpleToRrule(input: SimpleScheduleInput): { rrule: string; dtstart: Date } | null {
  const time = parseTime(input.runAtTime);
  const hour = time?.hour ?? 9;
  const minute = time?.minute ?? 30;
  const cadence = (input.cadence || "daily").toLowerCase();

  // Base dtstart: same time UTC on a reference day (Jan 1, 2020)
  const ref = new Date(Date.UTC(2020, 0, 1, hour, minute, 0, 0));

  if (cadence === "daily") {
    const rule = new RRule({
      freq: RRule.DAILY,
      dtstart: ref,
      interval: 1,
    });
    return { rrule: rule.toString(), dtstart: ref };
  }

  if (cadence === "weekly" && input.runAtWeekday != null && input.runAtWeekday >= 0 && input.runAtWeekday <= 6) {
    // Jan 1 2020 is Wednesday (2). We need a date that is the chosen weekday.
    const jan1 = new Date(Date.UTC(2020, 0, 1));
    const jan1Day = jan1.getUTCDay();
    const offset = (input.runAtWeekday - jan1Day + 7) % 7;
    const dtstart = new Date(Date.UTC(2020, 0, 1 + offset, hour, minute, 0, 0));
    const rule = new RRule({
      freq: RRule.WEEKLY,
      byweekday: [WEEKDAY_MAP[input.runAtWeekday]],
      dtstart,
      interval: 1,
    });
    return { rrule: rule.toString(), dtstart };
  }

  if (cadence === "monthly") {
    const day = input.runAtMonthDay != null && input.runAtMonthDay >= 1 && input.runAtMonthDay <= 31
      ? input.runAtMonthDay
      : 1;
    const dtstart = new Date(Date.UTC(2020, 0, Math.min(day, 28), hour, minute, 0, 0));
    const rule = new RRule({
      freq: RRule.MONTHLY,
      bymonthday: [day],
      dtstart,
      interval: 1,
    });
    return { rrule: rule.toString(), dtstart };
  }

  // custom or unknown: treat as daily
  const rule = new RRule({
    freq: RRule.DAILY,
    dtstart: ref,
    interval: 1,
  });
  return { rrule: rule.toString(), dtstart: ref };
}

/**
 * Compute the next run time after `afterDate` from stored rrule and dtstart (UTC).
 * Returns null if no more occurrences.
 */
export function getNextRunAt(
  rrule: string | null | undefined,
  dtstart: Date | string | null | undefined,
  afterDate: Date = new Date()
): Date | null {
  if (!rrule || !dtstart) return null;
  const dt = typeof dtstart === "string" ? new Date(dtstart) : dtstart;
  if (Number.isNaN(dt.getTime())) return null;

  try {
    const options = RRule.parseString(rrule);
    if (!options) return null;
    const rule = new RRule({
      ...options,
      dtstart: dt,
      tzid: null,
    });
    return rule.after(afterDate, false);
  } catch {
    return null;
  }
}
