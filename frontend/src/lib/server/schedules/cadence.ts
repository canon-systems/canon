/**
 * Cadence helpers for report_schedules: due-check and time window for diff runs.
 */

function toISO(date: Date): string {
  return date.toISOString();
}

/**
 * Returns a time window { start, end } in ISO format for the given cadence.
 * Used as the diff report window (e.g. "last 7 days" for weekly).
 */
export function getWindowForCadence(cadence: string, now: Date = new Date()): { start: string; end: string } {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);

  switch (cadence) {
    case 'daily':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    case 'monthly':
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      // Unknown cadence: default to last 7 days
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { start: toISO(start), end: toISO(end) };
}

/**
 * Returns true if the schedule is due to run (enough time has passed since last_run_at).
 */
export function isScheduleDue(
  lastRunAt: Date | string | null,
  cadence: string,
  now: Date = new Date()
): boolean {
  const last = lastRunAt == null ? null : typeof lastRunAt === 'string' ? new Date(lastRunAt) : lastRunAt;
  if (last != null && Number.isNaN(last.getTime())) return true;

  const msSinceLast = last == null ? Infinity : now.getTime() - last.getTime();

  switch (cadence) {
    case 'daily':
      return msSinceLast >= 23 * 60 * 60 * 1000; // 23h
    case 'weekly':
      return msSinceLast >= 6 * 24 * 60 * 60 * 1000; // 6 days
    case 'monthly':
      return msSinceLast >= 28 * 24 * 60 * 60 * 1000; // 28 days
    default:
      return msSinceLast >= 23 * 60 * 60 * 1000; // treat as daily
  }
}

/** Cadences that use day-of-week: user picks which day to run. (Monthly uses day-of-month instead.) */
const CADENCES_WITH_WEEKDAY = new Set(['weekly']);

/**
 * Returns true if `now` falls in the run-at hour. We use UTC only.
 * runAtTime: "HH:mm" 24h (e.g. "09:00"). When null/empty, returns true (no time filter).
 */
export function isInRunAtHour(
  now: Date,
  runAtTime: string | null | undefined
): boolean {
  if (!runAtTime || typeof runAtTime !== 'string') return true;
  const trimmed = runAtTime.trim();
  if (!trimmed) return true;

  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return true;
  const desiredHour = parseInt(match[1], 10);
  if (desiredHour < 0 || desiredHour > 23) return true;

  return now.getUTCHours() === desiredHour;
}

/**
 * Returns true if the current UTC day of week matches runAtWeekday.
 * runAtWeekday: 0 = Sunday, 1 = Monday, ... 6 = Saturday. When null/undefined, returns true.
 */
export function isInRunAtWeekday(
  now: Date,
  runAtWeekday: number | null | undefined
): boolean {
  if (runAtWeekday == null || runAtWeekday < 0 || runAtWeekday > 6) return true;
  return now.getUTCDay() === runAtWeekday;
}

/**
 * Returns true if this cadence uses day-of-week (weekly).
 */
export function cadenceUsesWeekday(cadence: string): boolean {
  return CADENCES_WITH_WEEKDAY.has(String(cadence).toLowerCase());
}

/**
 * Returns true if the current UTC day of month matches runAtMonthDay.
 * runAtMonthDay: 1-31 = that day, 0 = last day of month. When null/undefined, returns true.
 */
export function isInRunAtMonthDay(
  now: Date,
  runAtMonthDay: number | null | undefined
): boolean {
  if (runAtMonthDay == null || runAtMonthDay < 0 || runAtMonthDay > 31) return true;
  const utcDate = now.getUTCDate();
  if (runAtMonthDay === 0) {
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    return utcDate === lastDay;
  }
  return utcDate === runAtMonthDay;
}

/**
 * Returns true if this cadence uses day-of-month (monthly only).
 */
export function cadenceUsesMonthDay(cadence: string): boolean {
  return String(cadence).toLowerCase() === 'monthly';
}
